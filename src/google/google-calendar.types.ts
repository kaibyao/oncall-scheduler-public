import type { calendar_v3 } from '@googleapis/calendar';

export interface GoogleCalendarConfig {
  calendarId: string;
  serviceAccountCredentials: string;
}

export interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  creator?: {
    email?: string;
    displayName?: string;
  };
  attendees?: Array<{
    email?: string;
    displayName?: string;
    responseStatus?: string;
  }>;
}

export interface OOOEvent {
  id: string;
  engineerEmail: string;
  engineerName?: string;
  startDate: string; // YYYY-MM-DD format
  endDate: string; // YYYY-MM-DD format
  title: string;
  rawEvent: CalendarEvent;
  mappingMethod: 'title' | 'creator_email';
}

export interface EngineerOOOCache {
  [engineerEmail: string]: OOOEvent[];
}

export interface CalendarApiError {
  code: string;
  message: string;
  details?: unknown;
}

export enum CalendarErrorCode {
  AUTH_FAILURE = 'CALENDAR_AUTH_FAILURE',
  API_UNAVAILABLE = 'CALENDAR_API_UNAVAILABLE',
  RATE_LIMITED = 'CALENDAR_RATE_LIMITED',
  INVALID_CALENDAR = 'CALENDAR_INVALID_CALENDAR',
  NETWORK_ERROR = 'CALENDAR_NETWORK_ERROR',
  UNKNOWN_ERROR = 'CALENDAR_UNKNOWN_ERROR',
}

export interface CalendarServiceOptions {
  enableCaching?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
}

export type GoogleCalendarEventResponse = calendar_v3.Schema$Events;
export type GoogleCalendarEvent = calendar_v3.Schema$Event;
