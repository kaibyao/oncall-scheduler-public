import { calendar, auth } from '@googleapis/calendar';

import { GOOGLE_CALENDAR_ID, GOOGLE_SERVICE_ACCOUNT_CREDENTIALS } from '../config.js';
import { Logger } from '../logger.js';
import {
  CalendarErrorCode,
  type CalendarApiError,
  type GoogleCalendarConfig,
  type GoogleCalendarEventResponse,
  type CalendarServiceOptions,
} from './google-calendar.types.js';

const logger = new Logger('google-calendar-client');

export class GoogleCalendarClient {
  private calendar?: ReturnType<typeof calendar>;
  private config: GoogleCalendarConfig;
  private options: CalendarServiceOptions;

  constructor(options: CalendarServiceOptions = {}) {
    this.options = {
      enableCaching: true,
      retryAttempts: 3,
      retryDelayMs: 1000,
      ...options,
    };

    this.config = {
      calendarId: GOOGLE_CALENDAR_ID || '',
      serviceAccountCredentials: GOOGLE_SERVICE_ACCOUNT_CREDENTIALS || '',
    };

    // Lazy initialization - only initialize when actually needed
    if (this.isConfigured()) {
      try {
        this.calendar = this.initializeCalendarClient();
      } catch (error) {
        logger.warn('Failed to initialize Google Calendar client, will skip calendar integration:', error);
      }
    } else {
      logger.info('Google Calendar not configured, calendar integration will be skipped');
    }
  }

  private initializeCalendarClient() {
    try {
      if (!this.config.calendarId || !this.config.serviceAccountCredentials) {
        throw new Error(
          'Google Calendar configuration is missing. Please set GOOGLE_CALENDAR_ID and GOOGLE_SERVICE_ACCOUNT_CREDENTIALS environment variables.',
        );
      }

      const credentials = JSON.parse(this.config.serviceAccountCredentials);

      const authClient = new auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
      });

      return calendar({ version: 'v3', auth: authClient });
    } catch (error) {
      logger.error('Failed to initialize Google Calendar client:', error);
      throw this.createCalendarError(
        CalendarErrorCode.AUTH_FAILURE,
        'Failed to initialize Google Calendar client',
        error,
      );
    }
  }

  async fetchEvents(timeMin: string, timeMax: string): Promise<GoogleCalendarEventResponse> {
    if (!this.calendar) {
      throw this.createCalendarError(
        CalendarErrorCode.AUTH_FAILURE,
        'Google Calendar client not initialized. Check configuration.',
      );
    }

    const startTime = Date.now();
    let attempt = 0;

    while (attempt < this.options.retryAttempts!) {
      try {
        logger.info(`Fetching calendar events from ${timeMin} to ${timeMax} (attempt ${attempt + 1})`);

        const response = await this.calendar.events.list({
          calendarId: this.config.calendarId,
          timeMin,
          timeMax,
          singleEvents: true,
          orderBy: 'startTime',
          maxResults: 2500, // Google Calendar API limit
        });

        const duration = Date.now() - startTime;
        logger.info(`Successfully fetched ${response.data.items?.length || 0} events in ${duration}ms`);

        return response.data;
      } catch (error) {
        attempt++;
        const isLastAttempt = attempt >= this.options.retryAttempts!;

        logger.warn(`Calendar API request failed (attempt ${attempt}/${this.options.retryAttempts}):`, error);

        if (isLastAttempt) {
          const calendarError = this.mapErrorToCalendarError(error);
          logger.error('All retry attempts exhausted, throwing error:', calendarError);
          throw calendarError;
        }

        // Exponential backoff
        const delay = this.options.retryDelayMs! * Math.pow(2, attempt - 1);
        logger.info(`Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    // This should never be reached due to the throw in the catch block above
    throw this.createCalendarError(CalendarErrorCode.UNKNOWN_ERROR, 'Unexpected error in fetchEvents');
  }

  private mapErrorToCalendarError(error: unknown): CalendarApiError {
    if (error && typeof error === 'object' && 'code' in error) {
      const errorWithCode = error as { code: number };
      const statusCode = errorWithCode.code;

      switch (statusCode) {
        case 401:
        case 403:
          return this.createCalendarError(CalendarErrorCode.AUTH_FAILURE, 'Authentication failed', error);
        case 404:
          return this.createCalendarError(CalendarErrorCode.INVALID_CALENDAR, 'Calendar not found', error);
        case 429:
          return this.createCalendarError(CalendarErrorCode.RATE_LIMITED, 'Rate limit exceeded', error);
        case 500:
        case 502:
        case 503:
        case 504:
          return this.createCalendarError(
            CalendarErrorCode.API_UNAVAILABLE,
            'Google Calendar API temporarily unavailable',
            error,
          );
        default:
          return this.createCalendarError(CalendarErrorCode.NETWORK_ERROR, 'Network error occurred', error);
      }
    }

    return this.createCalendarError(CalendarErrorCode.UNKNOWN_ERROR, 'Unknown error occurred', error);
  }

  private createCalendarError(code: CalendarErrorCode, message: string, details?: unknown): CalendarApiError {
    return {
      code,
      message,
      details,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  isConfigured(): boolean {
    return !!(this.config.calendarId && this.config.serviceAccountCredentials);
  }

  getConfig(): GoogleCalendarConfig {
    return { ...this.config };
  }
}
