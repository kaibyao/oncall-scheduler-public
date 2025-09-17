export const IS_PRODUCTION = process.env.NODE_ENV === 'staging';
export const {
  SLACK_TOKEN,
  NOTION_API_TOKEN,
  NOTION_CURRENT_SCHEDULE_DB_ID,
  NOTION_PAST_SCHEDULE_DB_ID,
  GOOGLE_CALENDAR_ID,
  GOOGLE_SERVICE_ACCOUNT_CREDENTIALS,
} = process.env;

/** Disables slack group updates + notifications */
export const DISABLE_UPDATE_SLACK_GROUP =
  process.env.DISABLE_UPDATE_SLACK_GROUP === 'true' || process.env.DISABLE_UPDATE_SLACK_GROUP === '1';

/**
 * Validates that required environment variables are set
 * @param requireNotion - Whether to require NOTION_API_TOKEN (defaults to false for backward compatibility)
 * @param requireGoogleCalendar - Whether to require Google Calendar environment variables (defaults to false)
 */
export function validateEnvironmentVariables(
  requireNotion: boolean = false,
  requireGoogleCalendar: boolean = false,
): {
  valid: boolean;
  missing: string[];
} {
  const missing: string[] = [];

  if (!SLACK_TOKEN) {
    missing.push('SLACK_TOKEN');
  }

  if (requireNotion) {
    if (!NOTION_API_TOKEN) {
      missing.push('NOTION_API_TOKEN');
    }

    // Using hardcoded database IDs in production, for now.
    if (!IS_PRODUCTION) {
      if (!NOTION_CURRENT_SCHEDULE_DB_ID) {
        missing.push('NOTION_CURRENT_SCHEDULE_DB_ID');
      }
      if (!NOTION_PAST_SCHEDULE_DB_ID) {
        missing.push('NOTION_PAST_SCHEDULE_DB_ID');
      }
    }
  }

  if (requireGoogleCalendar) {
    if (!GOOGLE_CALENDAR_ID) {
      missing.push('GOOGLE_CALENDAR_ID');
    }
    if (!GOOGLE_SERVICE_ACCOUNT_CREDENTIALS) {
      missing.push('GOOGLE_SERVICE_ACCOUNT_CREDENTIALS');
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}
