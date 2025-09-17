import { LOOKAHEAD_NUMBER_DAYS, ROTATION_DAYS_OF_WEEK } from '../constants.js';
import { type EngineerRotationAssignment, GhostEngPod, OncallRotationName } from './schedule.types.js';
import { extrapolateSolutionToAllDays, getRotationHours, printSolutionDiagnostics } from './schedule.utils.js';
import { getOncallScheduleDates } from '../utils/date.js';
import {
  getAllUsers,
  getLastScheduledOncallDay,
  getWorkloadHistory,
  getWorkloadHistoryHoursByEngineerRotation,
  saveSchedule,
} from '../database/queries.js';
import { groupBy } from 'lodash-es';
import { DateTime } from 'luxon';
import { updateSlackWithScheduleChanges } from './schedule.notifications.js';
import { NotionSyncService } from '../notion/notion.sync.service.js';
import { Logger } from '../logger.js';
import { NotionSyncError } from './schedule.overrides.js';
import { scheduleAvailabilityService } from './schedule.availability.js';

const logger = new Logger('schedule-generation');

export async function runScheduleGeneration(): Promise<{
  scheduleGenerated: boolean;
  notionSync?: {
    success: boolean;
    dryRun?: boolean;
    syncStats?: {
      created: number;
      updated: number;
      deleted: number;
      errors: number;
      duration: number;
      apiCalls: number;
    };
    error?: string;
  };
}> {
  try {
    logger.info('Generating schedule...');
    await generateOncallSchedule();
    logger.info('Schedule generated, updating slack...');
    await updateSlackWithScheduleChanges();
    logger.info('Slack updated, syncing to Notion...');

    // Sync with Notion after successful schedule generation
    // Use try-catch to ensure sync failures don't break main process
    let notionSyncResult;
    try {
      const notionSyncService = new NotionSyncService();
      notionSyncResult = await notionSyncService.syncToNotion();
    } catch (syncError) {
      logger.error('Notion sync failed but schedule generation succeeded:', syncError);
      notionSyncResult = {
        success: false,
        error: syncError instanceof Error ? syncError.message : 'Unknown sync error',
      };
    }

    return {
      scheduleGenerated: true,
      notionSync: notionSyncResult,
    };
  } catch (error) {
    logger.error('Schedule generation failed:', error);
    throw error; // Re-throw to maintain existing error handling behavior
  }
}

async function generateOncallSchedule(): Promise<EngineerRotationAssignment[]> {
  // const vacationDates = this.getEPDVacationCalendar();
  const startDate = await getGenerationStartDate();
  const endDate = DateTime.now().plus({ days: LOOKAHEAD_NUMBER_DAYS }).setZone('America/Los_Angeles');

  return generateScheduleUsingSmartRoundRobin(startDate, endDate);
}

async function getGenerationStartDate(): Promise<DateTime> {
  const lastScheduledOncallDay = await getLastScheduledOncallDay();

  let nextRotationDay = !lastScheduledOncallDay
    ? DateTime.now().setZone('America/Los_Angeles')
    : DateTime.fromFormat(lastScheduledOncallDay.date, 'yyyy-MM-dd', { zone: 'America/Los_Angeles' }).plus({ days: 1 });

  while (!ROTATION_DAYS_OF_WEEK.includes(nextRotationDay.weekday)) {
    nextRotationDay = nextRotationDay.plus({ days: 1 });
  }
  return nextRotationDay;
}

async function generateScheduleUsingSmartRoundRobin(
  startDate: DateTime,
  endDate: DateTime,
): Promise<EngineerRotationAssignment[]> {
  const scheduleDates = getOncallScheduleDates(startDate, endDate);
  const assignments: EngineerRotationAssignment[] = [];

  // Initialize OOO cache for availability checking
  try {
    await scheduleAvailabilityService.initializeOOOCache(startDate, endDate);
    logger.info('OOO cache initialized successfully for schedule generation');
  } catch (error) {
    logger.warn('Failed to initialize OOO cache, continuing without availability checks:', error);
  }

  // Fetch all users once and cache them by rotation for efficiency
  const allUsers = getAllUsers().filter((user) => !user.deleted_at);
  const usersByRotation: Record<OncallRotationName, string[]> = {
    [OncallRotationName.AM]: [],
    [OncallRotationName.PM]: [],
    [OncallRotationName.Core]: [],
  };

  // Create email to name lookup for efficient name resolution
  const emailToNameMap: Record<string, string> = {};
  for (const user of allUsers) {
    emailToNameMap[user.email] = user.name;
  }

  // Group users by their pod for efficient pod lookups during scheduling
  const usersByPod: Record<GhostEngPod, string[]> = {
    [GhostEngPod.Blinky]: [],
    [GhostEngPod.Swayze]: [],
    [GhostEngPod.Zero]: [],
  };

  // Group users by their rotation and pod
  for (const user of allUsers) {
    const rotation = user.rotation as OncallRotationName;
    if (rotation === OncallRotationName.AM || rotation === OncallRotationName.PM) {
      usersByRotation[rotation].push(user.email);
    }
    // Group users by pod for efficient pod lookups
    usersByPod[user.pod].push(user.email);
  }

  // Core rotation is the union of AM + PM users
  usersByRotation[OncallRotationName.Core] = [
    ...new Set([...usersByRotation[OncallRotationName.AM], ...usersByRotation[OncallRotationName.PM]]),
  ];

  // Calculate workload history days back using cached user data
  // This replaces the constant calculation: new Set(Object.values(rotationEmails).flat()).size * 7
  const uniqueUserEmails = new Set(allUsers.map((user) => user.email));
  const workloadHistoryDaysBack = uniqueUserEmails.size * 7;

  for (const date of scheduleDates) {
    // ENG total hours per rotation
    const pastEngineerRotationHours = getWorkloadHistoryHoursByEngineerRotation(workloadHistoryDaysBack);

    const pastEngineerRotationHoursByEmail = groupBy(pastEngineerRotationHours, 'engineer_email');

    // Calculate total hours for each engineer
    const engineerTotalHours: Record<string, number> = {};
    for (const [email, hours] of Object.entries(pastEngineerRotationHoursByEmail)) {
      engineerTotalHours[email] = hours.reduce((sum, h) => sum + h.total_hours, 0);
    }

    // Get historical assignments including any we've just created
    const historicalAssignments = getWorkloadHistory(workloadHistoryDaysBack);

    // Find the latest date in historical assignments to check for previous date assignments
    const sortedHistoricalDates = [
      ...new Set(
        historicalAssignments.map((a) => DateTime.fromFormat(a.date, 'yyyy-MM-dd', { zone: 'America/Los_Angeles' })),
      ),
    ]
      .sort()
      .reverse();

    // Get engineers assigned on the previous date (could be from historical data or just assigned)
    const previousDateAssignments = new Set<string>();
    if (sortedHistoricalDates.length > 0) {
      // Find the most recent date before the current date
      const previousDate = sortedHistoricalDates.find((d) => d < date);
      if (previousDate) {
        historicalAssignments
          .filter((a) => a.date === previousDate.toFormat('yyyy-MM-dd'))
          .forEach((a) => previousDateAssignments.add(a.engineer_email));
      }
    }

    // Track assignments for the current date to enforce constraint 2 (Engineer should not already be assigned on current date)
    const currentDateAssignments: Set<string> = new Set();
    const dateAssignments: EngineerRotationAssignment[] = [];

    // Process rotations in order: Core, AM, PM
    const rotationOrder = [OncallRotationName.Core, OncallRotationName.AM, OncallRotationName.PM];

    for (const rotation of rotationOrder) {
      const eligibleEngineerEmails = usersByRotation[rotation];

      // Sort engineers by total hours (ascending) to prioritize those with fewer hours
      const engineerEmailsSortedByLeastHours = [...eligibleEngineerEmails].sort((a, b) => {
        const aHours = engineerTotalHours[a] || 0;
        const bHours = engineerTotalHours[b] || 0;
        return aHours - bHours;
      });

      let assigned = false;

      for (const engineer of engineerEmailsSortedByLeastHours) {
        // Check constraint 1: Engineer should not have been assigned on the previous date
        if (previousDateAssignments.has(engineer)) {
          continue;
        }

        // Check constraint 2: Engineer should not already be assigned on current date
        if (currentDateAssignments.has(engineer)) {
          continue;
        }

        // Check constraint 3: Engineer should be available (not OOO) on this date
        const isAvailable = await scheduleAvailabilityService.isEngineerAvailable(engineer, date);
        if (!isAvailable) {
          logger.info(`Skipping ${engineer} for ${rotation} on ${date.toISODate()}: engineer is OOO`);
          continue;
        }

        // Check constraint 4: For AM/PM, check if engineer is in same pod as Core engineer
        if (rotation === OncallRotationName.AM || rotation === OncallRotationName.PM) {
          const coreAssignment = dateAssignments.find((a) => a.rotation === OncallRotationName.Core);
          if (coreAssignment) {
            // Find which pod the core engineer belongs to using cached usersByPod
            const corePod = Object.keys(usersByPod).find((pod) =>
              usersByPod[pod as GhostEngPod].includes(coreAssignment.engineer_email),
            ) as GhostEngPod;

            // Check if current engineer is in the same pod
            if (corePod && usersByPod[corePod].includes(engineer)) {
              continue;
            }
          }
        }

        // If all constraints pass, assign this engineer
        const assignment: EngineerRotationAssignment = {
          engineer_email: engineer,
          engineer_name: emailToNameMap[engineer] || engineer,
          date: date.toFormat('yyyy-MM-dd'),
          rotation,
        };

        assignments.push(assignment);
        dateAssignments.push(assignment);
        currentDateAssignments.add(engineer);
        assigned = true;

        // Update the engineer's total hours for future iterations
        const rotationHours = getRotationHours(rotation);
        engineerTotalHours[engineer] = (engineerTotalHours[engineer] || 0) + rotationHours;

        break;
      }

      if (!assigned) {
        // Try to find an available engineer even if it breaks other constraints
        let fallbackEngineer = null;

        for (const engineer of engineerEmailsSortedByLeastHours) {
          const isAvailable = await scheduleAvailabilityService.isEngineerAvailable(engineer, date);
          if (isAvailable) {
            fallbackEngineer = engineer;
            break;
          }
        }

        // If no engineer is available, use the lowest-hour engineer anyway
        const selectedEngineer = fallbackEngineer || engineerEmailsSortedByLeastHours[0];

        if (!fallbackEngineer) {
          logger.warn(
            `No available engineers found for ${rotation} on ${date.toISODate()}, assigning ${selectedEngineer} despite OOO status`,
          );
        }

        const assignment: EngineerRotationAssignment = {
          engineer_email: selectedEngineer,
          engineer_name: emailToNameMap[selectedEngineer] || selectedEngineer,
          date: date.toFormat('yyyy-MM-dd'),
          rotation,
        };

        assignments.push(assignment);
        dateAssignments.push(assignment);
        currentDateAssignments.add(selectedEngineer);

        const rotationHours = getRotationHours(rotation);
        engineerTotalHours[selectedEngineer] = (engineerTotalHours[selectedEngineer] || 0) + rotationHours;
      }
    }

    const solutionWithAllDaysInSchedule = extrapolateSolutionToAllDays(dateAssignments);

    // Save the assignments for this date immediately so they're included in historical data for next iteration
    await saveSchedule(solutionWithAllDaysInSchedule);
  }

  printSolutionDiagnostics(assignments);

  return assignments;
}

export async function regenerateScheduleForDateRange(startDate: string, endDate: string): Promise<void> {
  logger.info(`Syncing schedule overrides to Notion for date range: ${startDate} to ${endDate}`);

  try {
    // We don't need to regenerate the schedule - the overrides are already persisted
    // We just need to sync the updated assignments to Notion for the specific date range
    const notionSyncService = new NotionSyncService();
    const syncResult = await notionSyncService.syncDateRangeToNotion(startDate, endDate);

    if (!syncResult.success) {
      throw new NotionSyncError(syncResult.error || 'Unknown sync error', syncResult);
    }

    logger.info('Successfully synced schedule overrides to Notion');
  } catch (error) {
    logger.error('Failed to sync schedule overrides to Notion:', error);

    // Convert any non-NotionSyncError to NotionSyncError
    if (!(error instanceof NotionSyncError)) {
      throw new NotionSyncError(
        `Failed to sync schedule overrides: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error,
      );
    }

    throw error; // Re-throw NotionSyncError as-is
  }
}
