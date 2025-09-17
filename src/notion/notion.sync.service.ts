import type { OncallScheduleEntry } from './notion.types.js';
import { Logger } from '../logger.js';
import { NOTION_API_TOKEN } from '../config.js';
import { getEngineeringManagerName, isEngineeringManager } from '../constants.js';
import {
  getCompleteScheduleData,
  filterOnlyPastEntries,
  filterScheduleDataByDateRange,
  getAllScheduleData,
  getScheduleDataWithOverrides,
  formatScheduleEntryWithDateTime,
  isPastDate,
  isInCurrentBusinessWeek,
} from '../utils/schedule-data.js';
import { DateTime } from 'luxon';
import type { RetryOptions } from '../utils/retry.js';
import { NotionUserService } from './notion.user.service.js';
import { NotionDatabaseService } from './notion.database.service.js';

export class NotionSyncService {
  private readonly logger: Logger;
  private readonly userService: NotionUserService;
  private readonly databaseService: NotionDatabaseService;

  constructor(retryOptions: RetryOptions = {}) {
    this.logger = new Logger('notion-sync-service');
    this.userService = new NotionUserService(retryOptions);
    this.databaseService = new NotionDatabaseService(this.userService, retryOptions);
  }

  /**
   * Resolves an engineer's display name for consistent Notion synchronization.
   *
   * For engineering managers: Returns the proper name (e.g., "Eng Director")
   * For regular engineers: Returns the email address as-is
   *
   * This ensures that manager assignments display with proper names in Notion
   * while maintaining backward compatibility for regular engineer emails.
   *
   * @param emailOrName - Engineer's email address or display name from database
   * @returns Display name for Notion sync operations
   */
  private resolveEngineerDisplayName(emailOrName: string): string {
    // If it looks like an email (contains '@'), try to resolve it as a manager
    if (emailOrName.includes('@')) {
      if (isEngineeringManager(emailOrName)) {
        const resolvedName = getEngineeringManagerName(emailOrName);
        this.logger.debug(`Resolved manager email ${emailOrName} to display name: ${resolvedName}`);
        return resolvedName;
      }
      // Not a manager email, return the email as-is (shouldn't happen in normal flow)
      return emailOrName;
    }
    // Already a name, return as-is
    return emailOrName;
  }

  /**
   * Compares local schedule entries with Notion entries to find differences
   * @param localEntries - Local schedule entries from database
   * @param notionEntries - Existing entries from Notion
   * @returns Object containing entries to create, update, and delete
   */
  compareScheduleEntries(
    localEntries: OncallScheduleEntry[],
    notionEntries: Array<OncallScheduleEntry & { notionPageId: string }>,
  ): {
    toCreate: OncallScheduleEntry[];
    toUpdate: Array<OncallScheduleEntry & { notionPageId: string }>;
    toDelete: Array<{ notionPageId: string }>;
  } {
    this.logger.info(`Comparing ${localEntries.length} local entries with ${notionEntries.length} Notion entries`);

    // Create lookup maps for efficient comparison
    const localMap = new Map<string, OncallScheduleEntry>();
    const notionMap = new Map<string, OncallScheduleEntry & { notionPageId: string }>();

    // Build local entries map (key: date-rotation)
    localEntries.forEach((entry) => {
      const key = `${entry.date}-${entry.rotation}`;
      localMap.set(key, entry);
    });

    // Build notion entries map (key: date-rotation)
    notionEntries.forEach((entry) => {
      const key = `${entry.date}-${entry.rotation}`;
      notionMap.set(key, entry);
    });

    const toCreate: OncallScheduleEntry[] = [];
    const toUpdate: Array<OncallScheduleEntry & { notionPageId: string }> = [];
    const toDelete: Array<{ notionPageId: string }> = [];

    // Find entries to create or update
    localEntries.forEach((localEntry) => {
      const key = `${localEntry.date}-${localEntry.rotation}`;
      const notionEntry = notionMap.get(key);

      if (!notionEntry) {
        // Entry doesn't exist in Notion - create it
        toCreate.push(localEntry);
      } else {
        // Entry exists - check if it needs updating
        if (this.needsUpdate(localEntry, notionEntry)) {
          toUpdate.push({
            ...localEntry,
            notionPageId: notionEntry.notionPageId,
          });
        }
      }
    });

    // Find entries to delete (exist in Notion but not locally)
    notionEntries.forEach((notionEntry) => {
      const key = `${notionEntry.date}-${notionEntry.rotation}`;
      if (!localMap.has(key)) {
        toDelete.push({ notionPageId: notionEntry.notionPageId });
      }
    });

    this.logger.info(
      `Comparison complete: ${toCreate.length} to create, ${toUpdate.length} to update, ${toDelete.length} to delete`,
    );

    return {
      toCreate,
      toUpdate,
      toDelete,
    };
  }

  /**
   * Checks if a local entry differs from its Notion counterpart
   * @param localEntry - Local schedule entry (already has resolved names)
   * @param notionEntry - Notion schedule entry (may have emails that need resolution)
   * @returns True if the entry needs updating
   */
  private needsUpdate(localEntry: OncallScheduleEntry, notionEntry: OncallScheduleEntry): boolean {
    // Local entries already have resolved names, but Notion entries may have emails
    // So we only resolve the Notion side for comparison
    const notionOriginal = this.resolveEngineerDisplayName(notionEntry.originalEngineer);
    const notionOverride = notionEntry.overrideEngineer
      ? this.resolveEngineerDisplayName(notionEntry.overrideEngineer)
      : undefined;
    const notionFinal = this.resolveEngineerDisplayName(notionEntry.finalEngineer);

    // Compare local (already resolved) with resolved Notion names
    const needsUpdate =
      localEntry.originalEngineer !== notionOriginal ||
      localEntry.overrideEngineer !== notionOverride ||
      localEntry.finalEngineer !== notionFinal;

    if (needsUpdate) {
      this.logger.info(
        `Entry needs update for ${localEntry.date} ${localEntry.rotation}: ` +
          `original (${localEntry.originalEngineer} vs ${notionOriginal}), ` +
          `override (${localEntry.overrideEngineer} vs ${notionOverride}), ` +
          `final (${localEntry.finalEngineer} vs ${notionFinal})`,
      );
    }

    return needsUpdate;
  }

  /**
   * Batch sync operations with rate limiting and error handling
   * @param localEntries - Local schedule entries to sync
   * @param isPast - Whether to sync to the past calendar database
   * @param startDateTime - Optional start date to filter Notion entries (prevents accidental deletions)
   * @param endDateTime - Optional end date to filter Notion entries (prevents accidental deletions)
   * @returns Summary of operations performed
   */
  async batchSyncOperations({
    localEntries,
    isPast = false,
    startDateTime,
    endDateTime,
  }: {
    localEntries: OncallScheduleEntry[];
    isPast: boolean;
    startDateTime?: DateTime;
    endDateTime?: DateTime;
  }): Promise<{
    created: number;
    updated: number;
    deleted: number;
    errors: number;
  }> {
    const dateRangeInfo =
      startDateTime && endDateTime ? ` (range: ${startDateTime.toISODate()} to ${endDateTime.toISODate()})` : '';
    this.logger.info(`Starting batch sync of ${localEntries.length} entries (isPast: ${isPast}${dateRangeInfo})`);

    // Query existing Notion entries
    const allNotionEntries = await this.databaseService.queryNotionDatabase(isPast);

    // Filter Notion entries to date range if provided (prevents accidental deletions of unrelated entries)
    let notionEntries = allNotionEntries;
    if (startDateTime && endDateTime) {
      notionEntries = allNotionEntries.filter((entry) => {
        // Parse entry date and set to 12pm UTC for consistent comparison
        const entryDate = DateTime.fromISO(entry.date, { zone: 'UTC' }).set({ hour: 12, minute: 0, second: 0 });
        const startDate = startDateTime.set({ hour: 12, minute: 0, second: 0 });
        const endDate = endDateTime.set({ hour: 12, minute: 0, second: 0 });
        return entryDate >= startDate && entryDate <= endDate;
      });
      this.logger.info(
        `Filtered Notion entries from ${allNotionEntries.length} to ${notionEntries.length} entries within date range`,
      );
    }

    // Compare and determine operations needed
    const { toCreate, toUpdate, toDelete } = this.compareScheduleEntries(localEntries, notionEntries);

    let created = 0;
    let updated = 0;
    let deleted = 0;
    let errors = 0;

    // Process creates in batches
    if (toCreate.length > 0) {
      this.logger.info(`Processing ${toCreate.length} creates`);
      for (const entry of toCreate) {
        try {
          await this.databaseService.createNotionEntry(entry, isPast);
          created++;

          // Add delay to respect rate limits (Notion allows ~3 requests per second)
          await this.databaseService.rateLimitDelay();
        } catch (error) {
          this.logger.error(`Failed to create entry for ${entry.date} ${entry.rotation}`, error);
          errors++;
        }
      }
    }

    // Process updates in batches
    if (toUpdate.length > 0) {
      this.logger.info(`Processing ${toUpdate.length} updates`);
      for (const entry of toUpdate) {
        try {
          await this.databaseService.updateNotionEntry(entry, entry.notionPageId);
          updated++;

          await this.databaseService.rateLimitDelay();
        } catch (error) {
          this.logger.error(`Failed to update entry for ${entry.date} ${entry.rotation}`, error);
          errors++;
        }
      }
    }

    // Process deletes in batches
    if (toDelete.length > 0) {
      this.logger.info(`Processing ${toDelete.length} deletes`);
      for (const entry of toDelete) {
        try {
          await this.databaseService.archiveNotionEntry(entry.notionPageId);
          deleted++;

          await this.databaseService.rateLimitDelay();
        } catch (error) {
          this.logger.error(`Failed to delete entry ${entry.notionPageId}`, error);
          errors++;
        }
      }
    }

    const summary = { created, updated, deleted, errors };
    this.logger.info(`Batch sync complete: ${JSON.stringify(summary)}`);

    return summary;
  }

  /**
   * Moves past entries to the PAST_CALENDAR database
   * @param entries - Entries to move (should be from past week)
   * @returns Summary of move operations
   */
  async moveToPastDatabase(entries: Array<OncallScheduleEntry & { notionPageId: string }>): Promise<{
    moved: number;
    errors: number;
  }> {
    this.logger.info(`Moving ${entries.length} entries to past calendar database`);

    let moved = 0;
    let errors = 0;

    for (const entry of entries) {
      try {
        // Create entry in past database
        await this.databaseService.createNotionEntry(entry, true);

        // Archive entry in current database
        await this.databaseService.archiveNotionEntry(entry.notionPageId);

        moved++;

        // Respect rate limits
        await this.databaseService.rateLimitDelay();
      } catch (error) {
        this.logger.error(`Failed to move entry for ${entry.date} ${entry.rotation}`, error);
        errors++;
      }
    }

    const summary = { moved, errors };
    this.logger.info(`Move to past database complete: ${JSON.stringify(summary)}`);

    return summary;
  }

  /**
   * Moves past assignments from current database to past database
   * @returns Summary of move operations
   */
  async movePastAssignmentsFromCurrentDatabase(): Promise<{
    moved: number;
    errors: number;
  }> {
    this.logger.info('Checking for past assignments in current database to move to past database');

    try {
      // Get all entries from current database
      const currentEntries = await this.databaseService.queryNotionDatabase(false);

      // Filter to find past entries (excluding current business week)
      const pastEntries = currentEntries.filter(
        (entry) => isPastDate(entry.date) && !isInCurrentBusinessWeek(entry.date),
      );

      if (pastEntries.length === 0) {
        this.logger.info('No past assignments found in current database');
        return { moved: 0, errors: 0 };
      }

      this.logger.info(`Found ${pastEntries.length} past assignments in current database to move`);

      // Check which past entries don't already exist in past database
      // Optimize by querying only the date range we need instead of all historical data
      const pastEntryDates = pastEntries.map((entry) => entry.date);
      const minDate = pastEntryDates.reduce((min, date) => (date < min ? date : min));
      const maxDate = pastEntryDates.reduce((max, date) => (date > max ? date : max));

      this.logger.info(`Querying past database for date range: ${minDate} to ${maxDate}`);
      const existingPastEntries = await this.databaseService.queryNotionDatabase(true, minDate, maxDate);
      const existingPastKeys = new Set(existingPastEntries.map((entry) => `${entry.date}-${entry.rotation}`));

      const entriesToMove = pastEntries.filter((entry) => !existingPastKeys.has(`${entry.date}-${entry.rotation}`));

      if (entriesToMove.length === 0) {
        this.logger.info('All past assignments already exist in past database, archiving from current database');
        // Archive from current database only
        let errors = 0;
        for (const entry of pastEntries) {
          try {
            await this.databaseService.archiveNotionEntry(entry.notionPageId);
            await this.databaseService.rateLimitDelay();
          } catch (error) {
            this.logger.error(`Failed to archive past entry for ${entry.date} ${entry.rotation}`, error);
            errors++;
          }
        }
        return { moved: pastEntries.length - errors, errors };
      }

      // Move entries to past database
      const { moved, errors } = await this.moveToPastDatabase(entriesToMove);

      this.logger.info(`Successfully moved ${moved} past assignments from current to past database`);
      return { moved, errors };
    } catch (error) {
      this.logger.error('Failed to move past assignments from current database', error);
      throw error;
    }
  }

  /**
   * Orchestrates the complete synchronization of schedule data to Notion
   * @param dryRun - If true, simulates operations without making actual API calls
   * @returns Sync result with statistics and status
   */
  public async syncToNotion(dryRun: boolean = false): Promise<{
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
    historicalStats?: {
      moved: number;
      errors: number;
    };
    error?: string;
  }> {
    const startTime = Date.now();

    try {
      // Validate NOTION_API_TOKEN
      if (!NOTION_API_TOKEN) {
        this.logger.error('NOTION_API_TOKEN environment variable is not set - skipping Notion sync');
        return {
          success: false,
          error: 'NOTION_API_TOKEN not configured',
        };
      }

      this.logger.info(`Starting Notion sync${dryRun ? ' (DRY RUN)' : ''}...`);

      // Get complete schedule data with datetime formatting, excluding past entries for current database sync
      const currentScheduleData = getCompleteScheduleData('America/Los_Angeles', true); // excludePastEntries = true
      const pastScheduleData = getCompleteScheduleData('America/Los_Angeles', false); // get all data
      const pastOnlyData = filterOnlyPastEntries(pastScheduleData);

      // Convert current schedule data to format expected by sync service
      const currentOncallEntries = currentScheduleData.map((entry) => ({
        date: entry.date,
        rotation: entry.rotation,
        originalEngineer: this.resolveEngineerDisplayName(entry.engineer_name),
        overrideEngineer: entry.override_engineer_name
          ? this.resolveEngineerDisplayName(entry.override_engineer_name)
          : undefined,
        finalEngineer: this.resolveEngineerDisplayName(entry.final_engineer_name),
        startDateTime: entry.dateTimeRange.start.toISO() ?? '',
        endDateTime: entry.dateTimeRange.end.toISO() ?? '',
      }));

      // Convert past schedule data to format expected by sync service
      const pastOncallEntries = pastOnlyData.map((entry) => ({
        date: entry.date,
        rotation: entry.rotation,
        originalEngineer: this.resolveEngineerDisplayName(entry.engineer_name),
        overrideEngineer: entry.override_engineer_name
          ? this.resolveEngineerDisplayName(entry.override_engineer_name)
          : undefined,
        finalEngineer: this.resolveEngineerDisplayName(entry.final_engineer_name),
        startDateTime: entry.dateTimeRange.start.toISO() ?? '',
        endDateTime: entry.dateTimeRange.end.toISO() ?? '',
      }));

      this.logger.info(
        `${dryRun ? 'Would sync' : 'Syncing'} ${currentOncallEntries.length} current entries and ${pastOncallEntries.length} past entries to Notion`,
      );

      let syncStats;
      let historicalStats;

      await this.userService.fetchAllUsers();

      if (dryRun) {
        // In dry-run mode, simulate the operations without making actual API calls
        this.logger.info('DRY RUN: Simulating sync operations...');

        // Query existing entries to see what would be done for current database
        const currentNotionEntries = await this.databaseService.queryNotionDatabase(false);
        const currentComparison = this.compareScheduleEntries(currentOncallEntries, currentNotionEntries);

        // Query existing entries to see what would be done for past database
        const pastNotionEntries = await this.databaseService.queryNotionDatabase(true);
        const pastComparison = this.compareScheduleEntries(pastOncallEntries, pastNotionEntries);

        syncStats = {
          created: currentComparison.toCreate.length + pastComparison.toCreate.length,
          updated: currentComparison.toUpdate.length + pastComparison.toUpdate.length,
          deleted: currentComparison.toDelete.length + pastComparison.toDelete.length,
          errors: 0,
        };

        historicalStats = { moved: 0, errors: 0 };

        this.logger.info(
          `DRY RUN: Would create ${syncStats.created}, update ${syncStats.updated}, delete ${syncStats.deleted} entries`,
        );
      } else {
        // First, move any past assignments from current database to past database
        historicalStats = await this.movePastAssignmentsFromCurrentDatabase();

        // Sync current entries to current database
        this.logger.info(`Syncing ${currentOncallEntries.length} current entries to current database`);
        const currentSyncStats = await this.batchSyncOperations({ localEntries: currentOncallEntries, isPast: false });

        // Sync past entries to past database
        this.logger.info(`Syncing ${pastOncallEntries.length} past entries to past database`);
        const pastSyncStats = await this.batchSyncOperations({ localEntries: pastOncallEntries, isPast: true });

        // Combine sync stats
        syncStats = {
          created: currentSyncStats.created + pastSyncStats.created,
          updated: currentSyncStats.updated + pastSyncStats.updated,
          deleted: currentSyncStats.deleted + pastSyncStats.deleted,
          errors: currentSyncStats.errors + pastSyncStats.errors,
        };
      }

      const duration = Date.now() - startTime;
      const totalOperations = syncStats.created + syncStats.updated + syncStats.deleted;

      this.logger.info(`Notion sync completed in ${duration}ms: ${JSON.stringify(syncStats)}`);

      return {
        success: true,
        dryRun,
        syncStats: {
          ...syncStats,
          duration,
          apiCalls: totalOperations, // Approximate API call count
        },
        historicalStats,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Notion sync failed:', error);

      return {
        success: false,
        dryRun,
        error: error instanceof Error ? error.message : 'Unknown sync error',
        syncStats: {
          created: 0,
          updated: 0,
          deleted: 0,
          errors: 1,
          duration,
          apiCalls: 0,
        },
      };
    }
  }

  /**
   * Synchronizes only a specific date range to Notion (optimized for override operations)
   * @param startDate - Start date in yyyy-MM-dd format
   * @param endDate - End date in yyyy-MM-dd format
   * @param timezone - Timezone for datetime calculations (defaults to America/Los_Angeles)
   * @param dryRun - If true, simulates operations without making actual API calls
   * @returns Sync result with statistics and status
   */
  public async syncDateRangeToNotion(
    startDate: string,
    endDate: string,
    timezone: string = 'America/Los_Angeles',
    dryRun: boolean = false,
  ): Promise<{
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
  }> {
    const startTime = Date.now();

    try {
      // Validate NOTION_API_TOKEN
      if (!NOTION_API_TOKEN) {
        this.logger.error('NOTION_API_TOKEN environment variable is not set - skipping Notion sync');
        return {
          success: false,
          error: 'NOTION_API_TOKEN not configured',
        };
      }

      this.logger.info(
        `Starting Notion sync for date range ${startDate} to ${endDate}${dryRun ? ' (DRY RUN)' : ''}...`,
      );

      // Parse date range
      const startDateTime = DateTime.fromISO(startDate, { zone: timezone });
      const endDateTime = DateTime.fromISO(endDate, { zone: timezone });

      if (!startDateTime.isValid || !endDateTime.isValid) {
        throw new Error(`Invalid date range: ${startDate} to ${endDate}`);
      }

      // Get all schedule data and filter by date range
      const allScheduleData = getAllScheduleData();
      const filteredScheduleData = filterScheduleDataByDateRange(allScheduleData, {
        startDate: startDateTime,
        endDate: endDateTime,
      });

      // Apply overrides and format with datetime ranges
      const scheduleWithOverrides = getScheduleDataWithOverrides(filteredScheduleData);
      const formattedEntries = scheduleWithOverrides.map((assignment) =>
        formatScheduleEntryWithDateTime(assignment, timezone),
      );

      // Convert to format expected by sync service
      const oncallEntries = formattedEntries.map((entry) => ({
        date: entry.date,
        rotation: entry.rotation,
        originalEngineer: this.resolveEngineerDisplayName(entry.engineer_name),
        overrideEngineer: entry.override_engineer_name
          ? this.resolveEngineerDisplayName(entry.override_engineer_name)
          : undefined,
        finalEngineer: this.resolveEngineerDisplayName(entry.final_engineer_name),
        startDateTime: entry.dateTimeRange.start.toISO() ?? '',
        endDateTime: entry.dateTimeRange.end.toISO() ?? '',
      }));

      this.logger.info(
        `${dryRun ? 'Would sync' : 'Syncing'} ${oncallEntries.length} entries for date range ${startDate} to ${endDate}`,
      );

      let syncStats;

      await this.userService.fetchAllUsers();

      if (dryRun) {
        // In dry-run mode, simulate the operations without making actual API calls
        this.logger.info('DRY RUN: Simulating sync operations for date range...');

        // Query existing entries to see what would be done
        // Note: We query all entries since the database service doesn't have date filtering yet
        const currentNotionEntries = await this.databaseService.queryNotionDatabase(false);
        const pastNotionEntries = await this.databaseService.queryNotionDatabase(true);

        // Filter Notion entries to match our date range
        const filteredCurrentEntries = currentNotionEntries.filter((entry) => {
          // Parse entry date and set to 12pm UTC for consistent comparison
          const entryDate = DateTime.fromISO(entry.date, { zone: 'UTC' }).set({ hour: 12, minute: 0, second: 0 });
          const startDate = startDateTime.set({ hour: 12, minute: 0, second: 0 });
          const endDate = endDateTime.set({ hour: 12, minute: 0, second: 0 });
          return entryDate >= startDate && entryDate <= endDate;
        });

        const filteredPastEntries = pastNotionEntries.filter((entry) => {
          // Parse entry date and set to 12pm UTC for consistent comparison
          const entryDate = DateTime.fromISO(entry.date, { zone: 'UTC' }).set({ hour: 12, minute: 0, second: 0 });
          const startDate = startDateTime.set({ hour: 12, minute: 0, second: 0 });
          const endDate = endDateTime.set({ hour: 12, minute: 0, second: 0 });
          return entryDate >= startDate && entryDate <= endDate;
        });

        // Separate current and past entries
        const currentOncallEntries = oncallEntries.filter((entry) => !isPastDate(entry.date, timezone));
        const pastOncallEntries = oncallEntries.filter((entry) => isPastDate(entry.date, timezone));

        const currentComparison = this.compareScheduleEntries(currentOncallEntries, filteredCurrentEntries);
        const pastComparison = this.compareScheduleEntries(pastOncallEntries, filteredPastEntries);

        syncStats = {
          created: currentComparison.toCreate.length + pastComparison.toCreate.length,
          updated: currentComparison.toUpdate.length + pastComparison.toUpdate.length,
          deleted: currentComparison.toDelete.length + pastComparison.toDelete.length,
          errors: 0,
        };

        this.logger.info(
          `DRY RUN: Would create ${syncStats.created}, update ${syncStats.updated}, delete ${syncStats.deleted} entries`,
        );
      } else {
        // Separate current and past entries
        const currentOncallEntries = oncallEntries.filter((entry) => !isPastDate(entry.date, timezone));
        const pastOncallEntries = oncallEntries.filter((entry) => isPastDate(entry.date, timezone));

        // Sync current entries to current database (if any)
        let currentSyncStats = { created: 0, updated: 0, deleted: 0, errors: 0 };
        if (currentOncallEntries.length > 0) {
          this.logger.info(`Syncing ${currentOncallEntries.length} current entries to current database`);
          currentSyncStats = await this.batchSyncOperations({
            localEntries: currentOncallEntries,
            isPast: false,
            startDateTime,
            endDateTime,
          });
        }

        // Sync past entries to past database (if any)
        let pastSyncStats = { created: 0, updated: 0, deleted: 0, errors: 0 };
        if (pastOncallEntries.length > 0) {
          this.logger.info(`Syncing ${pastOncallEntries.length} past entries to past database`);
          pastSyncStats = await this.batchSyncOperations({
            localEntries: pastOncallEntries,
            isPast: true,
            startDateTime,
            endDateTime,
          });
        }

        // Combine sync stats
        syncStats = {
          created: currentSyncStats.created + pastSyncStats.created,
          updated: currentSyncStats.updated + pastSyncStats.updated,
          deleted: currentSyncStats.deleted + pastSyncStats.deleted,
          errors: currentSyncStats.errors + pastSyncStats.errors,
        };
      }

      const duration = Date.now() - startTime;
      const totalOperations = syncStats.created + syncStats.updated + syncStats.deleted;

      this.logger.info(`Notion sync for date range completed in ${duration}ms: ${JSON.stringify(syncStats)}`);

      return {
        success: true,
        dryRun,
        syncStats: {
          ...syncStats,
          duration,
          apiCalls: totalOperations, // Approximate API call count
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Notion sync for date range failed:', error);

      return {
        success: false,
        dryRun,
        error: error instanceof Error ? error.message : 'Unknown sync error',
        syncStats: {
          created: 0,
          updated: 0,
          deleted: 0,
          errors: 1,
          duration,
          apiCalls: 0,
        },
      };
    }
  }
}
