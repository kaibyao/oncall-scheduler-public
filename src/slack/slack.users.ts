import { slackClient } from './slack.client.js';
import { Logger } from '../logger.js';
import { getUserByEmail, updateUser } from '../database/queries.js';

const logger = new Logger('slack.users');

export async function getSlackUserIdByEmail(email: string): Promise<string | undefined> {
  try {
    // First, check if we have the Slack user ID cached in the database
    const user = getUserByEmail(email);
    if (user?.slack_user_id) {
      logger.debug('Cache hit for Slack user ID', { email });
      return user.slack_user_id;
    }

    logger.debug('Cache miss for Slack user ID, calling Slack API', { email });

    // Cache miss - call Slack API
    const lookupResponse = await slackClient.users.lookupByEmail({
      email,
    });

    const slackUserId = lookupResponse.user?.id;

    // If we got a Slack user ID, cache it in the database
    if (slackUserId) {
      try {
        updateUser(email, { slack_user_id: slackUserId });
        logger.debug('Successfully cached Slack user ID in database', { email });
      } catch (dbError) {
        // Log warning but don't fail the operation
        logger.warn('Failed to cache Slack user ID in database', { email, dbError });
      }
    }

    return slackUserId;
  } catch (err) {
    logger.error('Caught error looking up slack user by email', { err });
    return;
  }
}
