import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { GoogleCalendarService } from './google-calendar.service.js';
import { CalendarErrorCode } from './google-calendar.types.js';

// Mock dependencies
vi.mock('../database/queries.js', () => ({
  getAllUsers: vi.fn(),
}));

vi.mock('./google-calendar.client.js', () => ({
  GoogleCalendarClient: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('GoogleCalendarService', () => {
  let mockClient: { isConfigured: ReturnType<typeof vi.fn>; fetchEvents: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock the client
    mockClient = {
      isConfigured: vi.fn().mockReturnValue(true),
      fetchEvents: vi.fn(),
    };

    const { GoogleCalendarClient } = (await vi.importMock('./google-calendar.client.js')) as {
      GoogleCalendarClient: ReturnType<typeof vi.fn>;
    };
    GoogleCalendarClient.mockImplementation(() => mockClient);

    // Mock database queries
    const { getAllUsers } = (await vi.importMock('../database/queries.js')) as {
      getAllUsers: ReturnType<typeof vi.fn>;
    };
    getAllUsers.mockReturnValue([
      { email: 'john.doe@company.com', name: 'John Doe', pod: 'Blinky', rotation: 'AM' },
      { email: 'jane.smith@company.com', name: 'Jane Smith', pod: 'Swayze', rotation: 'PM' },
      { email: 'robert.johnson@company.com', name: 'Robert Johnson', pod: 'Zero', rotation: 'Core' },
    ]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with engineer mappings', () => {
      const service = new GoogleCalendarService();
      const mappings = service.getEngineerMappings();

      expect(mappings.emailToName.get('john.doe@company.com')).toBe('John Doe');
      expect(mappings.nameToEmail.get('john')).toBe('john.doe@company.com');
      expect(mappings.nameToEmail.get('jane')).toBe('jane.smith@company.com');
      expect(mappings.nameToEmail.get('robert')).toBe('robert.johnson@company.com');
      expect(mappings.nameToEmail.get('bob')).toBe('robert.johnson@company.com'); // nickname
    });
  });

  describe('getOOOEvents', () => {
    it('should fetch and parse OOO events successfully', async () => {
      const mockEvents = {
        items: [
          {
            id: 'event1',
            summary: 'John OOO',
            start: { date: '2024-01-01' },
            end: { date: '2024-01-03' },
            creator: { email: 'john.doe@company.com' },
          },
          {
            id: 'event2',
            summary: 'Jane vacation',
            start: { date: '2024-01-05' },
            end: { date: '2024-01-07' },
            creator: { email: 'jane.smith@company.com' },
          },
          {
            id: 'event3',
            summary: 'Regular meeting',
            start: { dateTime: '2024-01-10T10:00:00Z' },
            end: { dateTime: '2024-01-10T11:00:00Z' },
            creator: { email: 'john.doe@company.com' },
          },
        ],
      };

      mockClient.fetchEvents.mockResolvedValue(mockEvents);

      const service = new GoogleCalendarService();
      const startDate = DateTime.fromISO('2024-01-01');
      const endDate = DateTime.fromISO('2024-01-31');

      const result = await service.getOOOEvents(startDate, endDate);

      expect(result).toEqual({
        'john.doe@company.com': [
          {
            id: 'event1',
            engineerEmail: 'john.doe@company.com',
            engineerName: 'John Doe',
            startDate: '2024-01-01',
            endDate: '2024-01-02', // End date adjusted for all-day event
            title: 'John OOO',
            rawEvent: expect.any(Object),
            mappingMethod: 'title',
          },
        ],
        'jane.smith@company.com': [
          {
            id: 'event2',
            engineerEmail: 'jane.smith@company.com',
            engineerName: 'Jane Smith',
            startDate: '2024-01-05',
            endDate: '2024-01-06', // End date adjusted for all-day event
            title: 'Jane vacation',
            rawEvent: expect.any(Object),
            mappingMethod: 'title',
          },
        ],
      });
    });

    it('should handle events identified by creator email', async () => {
      const mockEvents = {
        items: [
          {
            id: 'event1',
            summary: 'Out of office',
            start: { date: '2024-01-01' },
            end: { date: '2024-01-03' },
            creator: { email: 'john.doe@company.com' },
          },
        ],
      };

      mockClient.fetchEvents.mockResolvedValue(mockEvents);

      const service = new GoogleCalendarService();
      const startDate = DateTime.fromISO('2024-01-01');
      const endDate = DateTime.fromISO('2024-01-31');

      const result = await service.getOOOEvents(startDate, endDate);

      expect(result['john.doe@company.com'][0].mappingMethod).toBe('creator_email');
    });

    it('should handle timed events (dateTime)', async () => {
      const mockEvents = {
        items: [
          {
            id: 'event1',
            summary: 'John OOO',
            start: { dateTime: '2024-01-01T09:00:00Z' },
            end: { dateTime: '2024-01-01T17:00:00Z' },
            creator: { email: 'john.doe@company.com' },
          },
        ],
      };

      mockClient.fetchEvents.mockResolvedValue(mockEvents);

      const service = new GoogleCalendarService();
      const result = await service.getOOOEvents(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      expect(result['john.doe@company.com'][0]).toMatchObject({
        startDate: '2024-01-01',
        endDate: '2024-01-01',
      });
    });

    it('should skip non-OOO events', async () => {
      const mockEvents = {
        items: [
          {
            id: 'event1',
            summary: 'Team standup',
            start: { dateTime: '2024-01-01T10:00:00Z' },
            end: { dateTime: '2024-01-01T11:00:00Z' },
            creator: { email: 'john.doe@company.com' },
          },
          {
            id: 'event2',
            summary: 'John OOO',
            start: { date: '2024-01-05' },
            end: { date: '2024-01-07' },
            creator: { email: 'john.doe@company.com' },
          },
        ],
      };

      mockClient.fetchEvents.mockResolvedValue(mockEvents);

      const service = new GoogleCalendarService();
      const result = await service.getOOOEvents(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      expect(Object.keys(result)).toHaveLength(1);
      expect(result['john.doe@company.com']).toHaveLength(1);
      expect(result['john.doe@company.com'][0].id).toBe('event2');
    });

    it('should handle unknown engineers gracefully', async () => {
      const mockEvents = {
        items: [
          {
            id: 'event1',
            summary: 'Unknown Person OOO',
            start: { date: '2024-01-01' },
            end: { date: '2024-01-03' },
            creator: { email: 'unknown@company.com' },
          },
        ],
      };

      mockClient.fetchEvents.mockResolvedValue(mockEvents);

      const service = new GoogleCalendarService();
      const result = await service.getOOOEvents(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      expect(result).toEqual({});
    });

    it('should return empty cache when client is not configured', async () => {
      mockClient.isConfigured.mockReturnValue(false);

      const service = new GoogleCalendarService();
      const result = await service.getOOOEvents(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      expect(result).toEqual({});
      expect(mockClient.fetchEvents).not.toHaveBeenCalled();
    });

    it('should handle calendar unavailable errors gracefully', async () => {
      const calendarError = {
        code: CalendarErrorCode.API_UNAVAILABLE,
        message: 'API unavailable',
      };

      mockClient.fetchEvents.mockRejectedValue(calendarError);

      const service = new GoogleCalendarService();
      const result = await service.getOOOEvents(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      expect(result).toEqual({});
    });

    it('should re-throw non-recoverable errors', async () => {
      const unknownError = new Error('Unknown error');
      mockClient.fetchEvents.mockRejectedValue(unknownError);

      const service = new GoogleCalendarService();

      await expect(
        service.getOOOEvents(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31')),
      ).rejects.toThrow('Unknown error');
    });
  });

  describe('OOO event parsing', () => {
    it('should recognize various OOO patterns', async () => {
      const oooTitles = [
        'John OOO',
        'John out of office',
        'John vacation',
        'Alice holiday',
        'Charlie time off',
        'David away',
        'Eve off',
        'Frank PTO',
        'Grace sick',
      ];

      const mockEvents = {
        items: oooTitles.map((title, index) => ({
          id: `event${index}`,
          summary: title,
          start: { date: '2024-01-01' },
          end: { date: '2024-01-02' },
          creator: { email: 'john.doe@company.com' },
        })),
      };

      mockClient.fetchEvents.mockResolvedValue(mockEvents);

      const service = new GoogleCalendarService();
      const result = await service.getOOOEvents(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      expect(result['john.doe@company.com']).toHaveLength(oooTitles.length);
    });

    it('should handle nickname mapping', async () => {
      // Add user with nickname-friendly name
      const { getAllUsers } = (await vi.importMock('../database/queries.js')) as {
        getAllUsers: ReturnType<typeof vi.fn>;
      };
      getAllUsers.mockReturnValue([
        { email: 'robert.smith@company.com', name: 'Robert Smith', pod: 'Blinky', rotation: 'AM' },
      ]);

      const mockEvents = {
        items: [
          {
            id: 'event1',
            summary: 'Bob OOO', // Using nickname "Bob" for "Robert"
            start: { date: '2024-01-01' },
            end: { date: '2024-01-02' },
            creator: { email: 'other@company.com' },
          },
        ],
      };

      mockClient.fetchEvents.mockResolvedValue(mockEvents);

      const service = new GoogleCalendarService();
      const result = await service.getOOOEvents(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      expect(result['robert.smith@company.com']).toHaveLength(1);
      expect(result['robert.smith@company.com'][0].mappingMethod).toBe('title');
    });
  });

  describe('isConfigured', () => {
    it('should return client configuration status', () => {
      mockClient.isConfigured.mockReturnValue(true);
      const service = new GoogleCalendarService();
      expect(service.isConfigured()).toBe(true);

      mockClient.isConfigured.mockReturnValue(false);
      const service2 = new GoogleCalendarService();
      expect(service2.isConfigured()).toBe(false);
    });
  });
});
