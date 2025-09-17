import { IS_PRODUCTION } from '../config.js';
import { slackClient } from './slack.client.js';
import { Logger } from '../logger.js';

const logger = new Logger('slack.user-groups');

export enum SlackUserGroup {
  ONCALL = 'ONCALL',
}

const SLACK_USER_GROUP_IDS: Record<SlackUserGroup, { prod: string; nonProd: string }> = {
  [SlackUserGroup.ONCALL]: {
    // @support
    prod: 'S06U3ARAWR5',
    // @oncall-not-prod-ignore
    nonProd: 'S09357FRA9M',
  },
};

export function getSlackUserGroup(userGroup: SlackUserGroup) {
  if (IS_PRODUCTION) {
    return SLACK_USER_GROUP_IDS[userGroup].prod;
  } else {
    return SLACK_USER_GROUP_IDS[userGroup].nonProd;
  }
}

export async function getUserGroupMembers(userGroupId: string): Promise<string[]> {
  if (!slackClient) {
    return [];
  }

  try {
    const response = await slackClient.usergroups.users.list({
      usergroup: userGroupId,
    });

    return response.users || [];
  } catch (err) {
    logger.error('Error getting user group members', { err, userGroupId });
    return [];
  }
}

export async function updateUserGroupMembers(userGroupId: string, userIds: string[]): Promise<boolean> {
  if (!slackClient) {
    return false;
  }

  try {
    await slackClient.usergroups.users.update({
      usergroup: userGroupId,
      users: userIds.join(','),
    });

    return true;
  } catch (err) {
    logger.error('Error updating user group members', { err, userGroupId, userIds });
    return false;
  }
}
