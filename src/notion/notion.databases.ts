import { IS_PRODUCTION, NOTION_CURRENT_SCHEDULE_DB_ID, NOTION_PAST_SCHEDULE_DB_ID } from '../config.js';

/**
 * Gets the appropriate Notion database ID based on environment and database type
 * @param isPast - Whether to get the past calendar database ID
 * @returns Database ID string
 */
export const getNotionDatabaseId = (isPast?: boolean): string => {
  if (IS_PRODUCTION) {
    // Production environment - use hardcoded IDs
    return isPast
      ? '23b6859d770b80c68e54c1feb2dd2242' // PAST_PROD
      : '23b6859d770b8067a827d45568b50434'; // CURRENT_PROD
  } else {
    // Development environment - use environment variables
    const dbId = isPast ? NOTION_PAST_SCHEDULE_DB_ID : NOTION_CURRENT_SCHEDULE_DB_ID;
    if (!dbId) {
      throw new Error(
        `Missing environment variable: ${isPast ? 'NOTION_PAST_SCHEDULE_DB_ID' : 'NOTION_CURRENT_SCHEDULE_DB_ID'}`,
      );
    }
    return dbId;
  }
};
