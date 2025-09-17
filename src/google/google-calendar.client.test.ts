import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GoogleCalendarClient } from './google-calendar.client.js';
import { CalendarErrorCode } from './google-calendar.types.js';
import type { calendar_v3 } from '@googleapis/calendar';

// Mock the entire googleapis calendar module
vi.mock('@googleapis/calendar', () => ({
  calendar: vi.fn(),
  auth: {
    GoogleAuth: vi.fn(),
  },
}));

// Mock config
vi.mock('../config.js', () => ({
  GOOGLE_CALENDAR_ID: 'test-calendar@group.calendar.google.com',
  GOOGLE_SERVICE_ACCOUNT_CREDENTIALS: JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    private_key: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----\n',
    client_email: 'test@test-project.iam.gserviceaccount.com',
  }),
}));

// Mock logger
vi.mock('../logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('GoogleCalendarClient', () => {
  let mockCalendar: { events: Partial<calendar_v3.Resource$Events> };
  let mockEventsListFn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup mock calendar API
    mockEventsListFn = vi.fn();
    mockCalendar = {
      events: {
        list: mockEventsListFn,
      },
    };

    // Setup mocks
    const { calendar, auth } = await import('@googleapis/calendar');
    vi.mocked(calendar).mockReturnValue(mockCalendar as calendar_v3.Calendar);
    vi.mocked(auth.GoogleAuth).mockImplementation(() => ({}) as InstanceType<typeof auth.GoogleAuth>);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default options', () => {
      const client = new GoogleCalendarClient();
      expect(client.isConfigured()).toBe(true);
    });

    it('should accept custom options', () => {
      const options = {
        enableCaching: false,
        retryAttempts: 5,
        retryDelayMs: 2000,
      };

      const client = new GoogleCalendarClient(options);
      expect(client.isConfigured()).toBe(true);
    });
  });

  describe('fetchEvents', () => {
    it('should successfully fetch events', async () => {
      const mockResponse = {
        data: {
          items: [
            {
              id: 'event1',
              summary: 'John OOO',
              start: { date: '2024-01-01' },
              end: { date: '2024-01-02' },
            },
            {
              id: 'event2',
              summary: 'Jane vacation',
              start: { date: '2024-01-03' },
              end: { date: '2024-01-04' },
            },
          ],
        },
      };

      mockEventsListFn.mockResolvedValue(mockResponse);

      const client = new GoogleCalendarClient();
      const result = await client.fetchEvents('2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z');

      expect(result).toEqual(mockResponse.data);
      expect(mockEventsListFn).toHaveBeenCalledWith({
        calendarId: 'test-calendar@group.calendar.google.com',
        timeMin: '2024-01-01T00:00:00Z',
        timeMax: '2024-01-31T23:59:59Z',
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500,
      });
    });

    it('should handle authentication errors', async () => {
      const authError = { code: 401, message: 'Unauthorized' };
      mockEventsListFn.mockRejectedValue(authError);

      const client = new GoogleCalendarClient({ retryAttempts: 1 });

      await expect(client.fetchEvents('2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z')).rejects.toMatchObject({
        code: CalendarErrorCode.AUTH_FAILURE,
        message: 'Authentication failed',
      });
    });

    it('should handle rate limiting errors', async () => {
      const rateLimitError = { code: 429, message: 'Rate limit exceeded' };
      mockEventsListFn.mockRejectedValue(rateLimitError);

      const client = new GoogleCalendarClient({ retryAttempts: 1 });

      await expect(client.fetchEvents('2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z')).rejects.toMatchObject({
        code: CalendarErrorCode.RATE_LIMITED,
        message: 'Rate limit exceeded',
      });
    });

    it('should handle API unavailable errors', async () => {
      const apiError = { code: 503, message: 'Service unavailable' };
      mockEventsListFn.mockRejectedValue(apiError);

      const client = new GoogleCalendarClient({ retryAttempts: 1 });

      await expect(client.fetchEvents('2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z')).rejects.toMatchObject({
        code: CalendarErrorCode.API_UNAVAILABLE,
        message: 'Google Calendar API temporarily unavailable',
      });
    });

    it('should retry on transient failures', async () => {
      const transientError = { code: 500, message: 'Internal server error' };
      const successResponse = {
        data: {
          items: [{ id: 'event1', summary: 'Test event' }],
        },
      };

      // First call fails, second succeeds
      mockEventsListFn.mockRejectedValueOnce(transientError).mockResolvedValueOnce(successResponse);

      const client = new GoogleCalendarClient({ retryAttempts: 2, retryDelayMs: 10 });
      const result = await client.fetchEvents('2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z');

      expect(result).toEqual(successResponse.data);
      expect(mockEventsListFn).toHaveBeenCalledTimes(2);
    });

    it('should handle network errors', async () => {
      const networkError = { code: 'ENOTFOUND', message: 'Network error' };
      mockEventsListFn.mockRejectedValue(networkError);

      const client = new GoogleCalendarClient({ retryAttempts: 1 });

      await expect(client.fetchEvents('2024-01-01T00:00:00Z', '2024-01-31T23:59:59Z')).rejects.toMatchObject({
        code: CalendarErrorCode.NETWORK_ERROR,
      });
    });
  });

  describe('isConfigured', () => {
    it('should return true when properly configured', () => {
      const client = new GoogleCalendarClient();
      expect(client.isConfigured()).toBe(true);
    });
  });

  describe('getConfig', () => {
    it('should return configuration copy', () => {
      const client = new GoogleCalendarClient();
      const config = client.getConfig();

      expect(config).toEqual({
        calendarId: 'test-calendar@group.calendar.google.com',
        serviceAccountCredentials: JSON.stringify({
          type: 'service_account',
          project_id: 'test-project',
          private_key: '-----BEGIN PRIVATE KEY-----\ntest-key\n-----END PRIVATE KEY-----\n',
          client_email: 'test@test-project.iam.gserviceaccount.com',
        }),
      });
    });
  });
});
