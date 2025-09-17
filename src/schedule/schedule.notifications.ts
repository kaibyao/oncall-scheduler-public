import { ENGINEERING_MANAGER_EMAILS } from '../constants.js';
import { getCurrentAssignments, getCurrentOverrides } from '../database/queries.js';
import { getSlackChannel, SlackChannel } from '../slack/slack.channels.js';
import { postSlackMessage } from '../slack/slack.messages.js';
import {
  getSlackUserGroup,
  getUserGroupMembers,
  SlackUserGroup,
  updateUserGroupMembers,
} from '../slack/slack.user-groups.js';
import { getSlackUserIdByEmail } from '../slack/slack.users.js';
import { OncallRotationName, type EngineerRotationAssignment } from './schedule.types.js';

import { Logger } from '../logger.js';
import { DISABLE_UPDATE_SLACK_GROUP } from '../config.js';

const logger = new Logger('schedule-notifications');

/**
 * Updates the oncall slack group with the new week's assignments if the schedule has changed from the current assignments.
 */
export async function updateSlackWithScheduleChanges() {
  // Exit early if it's weekend - no on-call rotation changes on weekends
  const now = new Date();
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    // Sunday (0) or Saturday (6)
    logger.info('Skipping Slack update on weekend');
    return;
  }

  const { shouldBeAssigned, assignedSlackUserIdsByEmail, currentSlackUserIds, oncallUserGroupId, hasChanges } =
    await getDailyAssignmentChanges();

  logger.info('Daily assignment changes', {
    shouldBeAssigned,
    assignedSlackUserIdsByEmail,
    currentSlackUserIds,
    oncallUserGroupId,
    hasChanges,
  });

  // If the schedule has changed, update the oncall slack group with the new week's assignments
  if (hasChanges && !DISABLE_UPDATE_SLACK_GROUP) {
    await updateSlackUserGroupAndNotify({
      oncallUserGroupId,
      currentSlackUserIds,
      assignedSlackUserIdsByEmail,
      shouldBeAssigned,
    });
  } else {
    logger.info('No changes to oncall assignments');
  }
}

async function getDailyAssignmentChanges(): Promise<{
  shouldBeAssigned: { engineer_email: string; rotation: string }[];
  assignedSlackUserIdsByEmail: Record<string, string>;
  currentSlackUserIds: string[];
  oncallUserGroupId: string;
  hasChanges: boolean;
}> {
  // Check who is currently assigned to the oncall rotation via the Slack @oncall user group.
  const oncallUserGroupId = getSlackUserGroup(SlackUserGroup.ONCALL);
  const currentSlackUserIds = await getUserGroupMembers(oncallUserGroupId);

  // Get both regular assignments and overrides
  const currentAndNearFutureAssignments = getCurrentAssignments();
  const currentOverrides = getCurrentOverrides();

  // Create a map of overrides by date and rotation for easy lookup
  const overrideMap = new Map<string, string>();
  for (const override of currentOverrides) {
    const key = `${override.date}_${override.rotation}`;
    overrideMap.set(key, override.engineer_email);
  }

  const shouldBeAssignedPerRotation: Record<OncallRotationName, EngineerRotationAssignment | undefined> = {
    [OncallRotationName.AM]: undefined,
    [OncallRotationName.Core]: undefined,
    [OncallRotationName.PM]: undefined,
  };

  for (const assignment of currentAndNearFutureAssignments) {
    if (!shouldBeAssignedPerRotation[assignment.rotation]) {
      // Check if there's an override for this date and rotation
      const dateKey = `${assignment.date}_${assignment.rotation}`;
      const override = overrideMap.get(dateKey);

      if (override) {
        // Use the override assignment
        shouldBeAssignedPerRotation[assignment.rotation] = {
          ...assignment,
          engineer_email: override,
        };
      } else {
        // Use the regular assignment
        shouldBeAssignedPerRotation[assignment.rotation] = assignment;
      }
    }

    if (
      shouldBeAssignedPerRotation[OncallRotationName.AM] &&
      shouldBeAssignedPerRotation[OncallRotationName.Core] &&
      shouldBeAssignedPerRotation[OncallRotationName.PM]
    ) {
      break;
    }
  }

  const shouldBeAssigned = Object.values(shouldBeAssignedPerRotation) as EngineerRotationAssignment[];

  // Get Slack user IDs for all assigned engineers
  const assignedSlackUserIdByEmail: Record<string, string> = {};
  for (const assignment of shouldBeAssigned) {
    const slackUserId = await getSlackUserIdByEmail(assignment.engineer_email);
    if (slackUserId) {
      assignedSlackUserIdByEmail[assignment.engineer_email] = slackUserId;
    } else {
      logger.warn('Could not find Slack user ID for engineer', { email: assignment.engineer_email });
    }
  }

  // Get Slack user IDs for all engineering managers
  for (const email of ENGINEERING_MANAGER_EMAILS) {
    const slackUserId = await getSlackUserIdByEmail(email);
    if (slackUserId) {
      assignedSlackUserIdByEmail[email] = slackUserId;
    } else {
      logger.warn('Could not find Slack user ID for engineering manager', { email });
    }
  }

  // Compare the schedule's assignments to the current assignments.
  const currentSet = new Set(currentSlackUserIds);
  const shouldBeSet = new Set(Object.values(assignedSlackUserIdByEmail));

  // Check if there are any differences
  const hasChanges =
    currentSet.size !== shouldBeSet.size ||
    [...currentSet].some((id) => !shouldBeSet.has(id)) ||
    [...shouldBeSet].some((id) => !currentSet.has(id));

  return {
    shouldBeAssigned,
    assignedSlackUserIdsByEmail: assignedSlackUserIdByEmail,
    currentSlackUserIds,
    oncallUserGroupId,
    hasChanges,
  };
}

async function updateSlackUserGroupAndNotify({
  oncallUserGroupId,
  currentSlackUserIds,
  assignedSlackUserIdsByEmail,
  shouldBeAssigned,
}: {
  oncallUserGroupId: string;
  currentSlackUserIds: string[];
  /** A map of engineer emails to their Slack user IDs */
  assignedSlackUserIdsByEmail: Record<string, string>;
  shouldBeAssigned: { engineer_email: string; rotation: string }[];
}): Promise<void> {
  logger.info('Updating oncall Slack user group', {
    currentMembers: currentSlackUserIds,
    newMembers: assignedSlackUserIdsByEmail,
  });

  const updateSuccess = await updateUserGroupMembers(oncallUserGroupId, Object.values(assignedSlackUserIdsByEmail));

  if (updateSuccess) {
    // Post a message to the support channel with new assignments.
    const assignmentSummary = shouldBeAssigned
      .map(
        (assignment) =>
          `${assignedSlackUserIdsByEmail[assignment.engineer_email] ? `<@${assignedSlackUserIdsByEmail[assignment.engineer_email]}>` : assignment.engineer_email} (${assignment.rotation})`,
      )
      .join(', ');

    await postSlackMessage({
      channel: getSlackChannel(SlackChannel.EPD_SUPPORT),
      text: `🔄 On-call rotation updated!\n\nNew assignments: ${assignmentSummary}`,
    });

    logger.info('Successfully updated oncall Slack user group and posted notification');
  } else {
    logger.error('Failed to update oncall Slack user group');
  }
}

/**
 * Notifies engineers about schedule override assignments
 * @param assignedEngineerEmail - Email of the engineer being assigned to the override
 * @param replacedEngineers - Array of engineer emails who are being replaced
 * @param dates - Array of dates being overridden (yyyy-MM-dd format)
 * @param rotation - The rotation being overridden
 * @returns Promise that resolves when notifications are complete
 */
export async function notifyOverrideAssignment(
  assignedEngineerEmail: string,
  replacedEngineers: string[],
  dates: string[],
  rotation: string,
): Promise<{
  success: boolean;
  notificationsSent: number;
  errors: string[];
}> {
  logger.info('Starting override assignment notifications', {
    assignedEngineer: assignedEngineerEmail,
    replacedEngineers,
    dates,
    rotation,
  });

  const errors: string[] = [];
  let notificationsSent = 0;

  try {
    // Format date range for display
    const dateRange = dates.length === 1 ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`;
    const daysText = dates.length === 1 ? 'day' : 'days';

    // Notify the engineer being assigned to the override
    try {
      const assignedSlackUserId = await getSlackUserIdByEmail(assignedEngineerEmail);
      if (assignedSlackUserId) {
        await postSlackMessage({
          channel: assignedSlackUserId, // Send as direct message
          text: `🔄 **On-call Override Assignment**\n\nYou have been assigned to cover the **${rotation}** rotation for ${dates.length} ${daysText} (${dateRange}).`,
        });
        notificationsSent++;
        logger.info(`Successfully notified assigned engineer: ${assignedEngineerEmail}`);
      } else {
        const error = `Could not find Slack user ID for assigned engineer: ${assignedEngineerEmail}`;
        logger.warn(error);
        errors.push(error);
      }
    } catch (error) {
      const errorMsg = `Failed to notify assigned engineer ${assignedEngineerEmail}: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(errorMsg);
      errors.push(errorMsg);
    }

    // Notify engineers being replaced (if any)
    if (replacedEngineers.length > 0) {
      const uniqueReplacedEngineers = [
        ...new Set(replacedEngineers.filter((email) => email !== assignedEngineerEmail)),
      ];

      for (const replacedEngineerEmail of uniqueReplacedEngineers) {
        try {
          const replacedSlackUserId = await getSlackUserIdByEmail(replacedEngineerEmail);
          if (replacedSlackUserId) {
            await postSlackMessage({
              channel: replacedSlackUserId, // Send as direct message
              text: `ℹ️ **On-call Schedule Update**\n\nYour **${rotation}** rotation assignment for ${dates.length} ${daysText} (${dateRange}) has been reassigned to <@${(await getSlackUserIdByEmail(assignedEngineerEmail)) || assignedEngineerEmail}>.\n\nYou are no longer on-call for these dates.`,
            });
            notificationsSent++;
            logger.info(`Successfully notified replaced engineer: ${replacedEngineerEmail}`);
          } else {
            const error = `Could not find Slack user ID for replaced engineer: ${replacedEngineerEmail}`;
            logger.warn(error);
            errors.push(error);
          }
        } catch (error) {
          const errorMsg = `Failed to notify replaced engineer ${replacedEngineerEmail}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          logger.error(errorMsg);
          errors.push(errorMsg);
        }
      }
    }

    const success = errors.length === 0;
    logger.info('Override assignment notifications completed', {
      success,
      notificationsSent,
      errorCount: errors.length,
    });

    return {
      success,
      notificationsSent,
      errors,
    };
  } catch (error) {
    const errorMsg = `Unexpected error during override notifications: ${error instanceof Error ? error.message : 'Unknown error'}`;
    logger.error(errorMsg);
    errors.push(errorMsg);

    return {
      success: false,
      notificationsSent,
      errors,
    };
  }
}
