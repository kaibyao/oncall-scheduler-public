import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { ScheduleAvailabilityService } from './schedule.availability.js';

// Mock the Google Calendar service
vi.mock('../google/google-calendar.service.js', () => ({
  GoogleCalendarService: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('ScheduleAvailabilityService', () => {
  let availabilityService: ScheduleAvailabilityService;
  let mockCalendarService: { isConfigured: ReturnType<typeof vi.fn>; getOOOEvents: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock the calendar service
    mockCalendarService = {
      isConfigured: vi.fn().mockReturnValue(true),
      getOOOEvents: vi.fn(),
    };

    const { GoogleCalendarService } = (await vi.importMock('../google/google-calendar.service.js')) as {
      GoogleCalendarService: ReturnType<typeof vi.fn>;
    };
    GoogleCalendarService.mockImplementation(() => mockCalendarService);

    availabilityService = new ScheduleAvailabilityService();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initializeOOOCache', () => {
    it('should initialize cache with OOO events', async () => {
      const mockOOOEvents = {
        'john.doe@company.com': [
          {
            id: 'event1',
            engineerEmail: 'john.doe@company.com',
            engineerName: 'John Doe',
            startDate: '2024-01-01',
            endDate: '2024-01-03',
            title: 'John OOO',
            rawEvent: {},
            mappingMethod: 'title' as const,
          },
        ],
        'jane.smith@company.com': [
          {
            id: 'event2',
            engineerEmail: 'jane.smith@company.com',
            engineerName: 'Jane Smith',
            startDate: '2024-01-05',
            endDate: '2024-01-07',
            title: 'Jane vacation',
            rawEvent: {},
            mappingMethod: 'title' as const,
          },
        ],
      };

      mockCalendarService.getOOOEvents.mockResolvedValue(mockOOOEvents);

      const startDate = DateTime.fromISO('2024-01-01');
      const endDate = DateTime.fromISO('2024-01-31');

      await availabilityService.initializeOOOCache(startDate, endDate);

      const stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(true);
      expect(stats.engineerCount).toBe(2);
      expect(stats.totalEvents).toBe(2);
      expect(stats.cacheRange).toEqual({
        start: '2024-01-01',
        end: '2024-01-31',
      });
    });

    it('should handle calendar service errors gracefully', async () => {
      mockCalendarService.getOOOEvents.mockRejectedValue(new Error('Calendar API error'));

      const startDate = DateTime.fromISO('2024-01-01');
      const endDate = DateTime.fromISO('2024-01-31');

      await availabilityService.initializeOOOCache(startDate, endDate);

      const stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(true);
      expect(stats.engineerCount).toBe(0);
      expect(stats.totalEvents).toBe(0);
    });
  });

  describe('isEngineerAvailable', () => {
    beforeEach(async () => {
      const mockOOOEvents = {
        'john.doe@company.com': [
          {
            id: 'event1',
            engineerEmail: 'john.doe@company.com',
            engineerName: 'John Doe',
            startDate: '2024-01-15',
            endDate: '2024-01-17',
            title: 'John OOO',
            rawEvent: {},
            mappingMethod: 'title' as const,
          },
        ],
      };

      mockCalendarService.getOOOEvents.mockResolvedValue(mockOOOEvents);

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));
    });

    it('should return true for engineers with no OOO events', async () => {
      const isAvailable = await availabilityService.isEngineerAvailable(
        'jane.smith@company.com',
        DateTime.fromISO('2024-01-10'),
      );

      expect(isAvailable).toBe(true);
    });

    it('should return false for engineers who are OOO on the given date', async () => {
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-16'), // Within OOO range
      );

      expect(isAvailable).toBe(false);
    });

    it('should return true for engineers who are not OOO on the given date', async () => {
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-10'), // Before OOO range
      );

      expect(isAvailable).toBe(true);
    });

    it('should handle date boundary conditions correctly', async () => {
      // Start date of OOO period
      const startDateAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-15'),
      );
      expect(startDateAvailable).toBe(false);

      // End date of OOO period
      const endDateAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-17'),
      );
      expect(endDateAvailable).toBe(false);

      // Day before OOO period
      const beforeAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-14'),
      );
      expect(beforeAvailable).toBe(true);

      // Day after OOO period
      const afterAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-18'),
      );
      expect(afterAvailable).toBe(true);
    });

    it('should handle case-insensitive email matching', async () => {
      const isAvailable = await availabilityService.isEngineerAvailable(
        'JOHN.DOE@COMPANY.COM', // Uppercase email
        DateTime.fromISO('2024-01-16'),
      );

      expect(isAvailable).toBe(false);
    });

    it('should return true when cache is not initialized', async () => {
      const newService = new ScheduleAvailabilityService();

      const isAvailable = await newService.isEngineerAvailable('john.doe@company.com', DateTime.fromISO('2024-01-16'));

      expect(isAvailable).toBe(true);
    });

    it('should return true for dates outside cache range', async () => {
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-02-15'), // Outside cache range
      );

      expect(isAvailable).toBe(true);
    });
  });

  describe('getEngineerOOOEvents', () => {
    beforeEach(async () => {
      const mockOOOEvents = {
        'john.doe@company.com': [
          {
            id: 'event1',
            engineerEmail: 'john.doe@company.com',
            engineerName: 'John Doe',
            startDate: '2024-01-15',
            endDate: '2024-01-17',
            title: 'John OOO',
            rawEvent: {},
            mappingMethod: 'title' as const,
          },
          {
            id: 'event2',
            engineerEmail: 'john.doe@company.com',
            engineerName: 'John Doe',
            startDate: '2024-01-25',
            endDate: '2024-01-26',
            title: 'John vacation',
            rawEvent: {},
            mappingMethod: 'title' as const,
          },
        ],
      };

      mockCalendarService.getOOOEvents.mockResolvedValue(mockOOOEvents);

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));
    });

    it('should return all OOO events for an engineer', () => {
      const events = availabilityService.getEngineerOOOEvents('john.doe@company.com');

      expect(events).toHaveLength(2);
      expect(events[0].startDate).toBe('2024-01-15');
      expect(events[1].startDate).toBe('2024-01-25');
    });

    it('should return empty array for engineers with no OOO events', () => {
      const events = availabilityService.getEngineerOOOEvents('jane.smith@company.com');
      expect(events).toEqual([]);
    });

    it('should return empty array when cache is not initialized', () => {
      const newService = new ScheduleAvailabilityService();
      const events = newService.getEngineerOOOEvents('john.doe@company.com');
      expect(events).toEqual([]);
    });
  });

  describe('getEngineersOOOOnDate', () => {
    beforeEach(async () => {
      const mockOOOEvents = {
        'john.doe@company.com': [
          {
            id: 'event1',
            engineerEmail: 'john.doe@company.com',
            engineerName: 'John Doe',
            startDate: '2024-01-15',
            endDate: '2024-01-17',
            title: 'John OOO',
            rawEvent: {},
            mappingMethod: 'title' as const,
          },
        ],
        'jane.smith@company.com': [
          {
            id: 'event2',
            engineerEmail: 'jane.smith@company.com',
            engineerName: 'Jane Smith',
            startDate: '2024-01-16',
            endDate: '2024-01-18',
            title: 'Jane vacation',
            rawEvent: {},
            mappingMethod: 'title' as const,
          },
        ],
      };

      mockCalendarService.getOOOEvents.mockResolvedValue(mockOOOEvents);

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));
    });

    it('should return all engineers OOO on a specific date', () => {
      const oooEngineers = availabilityService.getEngineersOOOOnDate(DateTime.fromISO('2024-01-16'));

      expect(oooEngineers).toHaveLength(2);
      expect(oooEngineers).toContain('john.doe@company.com');
      expect(oooEngineers).toContain('jane.smith@company.com');
    });

    it('should return partial list when only some engineers are OOO', () => {
      const oooEngineers = availabilityService.getEngineersOOOOnDate(DateTime.fromISO('2024-01-15'));

      expect(oooEngineers).toHaveLength(1);
      expect(oooEngineers).toContain('john.doe@company.com');
    });

    it('should return empty array when no engineers are OOO', () => {
      const oooEngineers = availabilityService.getEngineersOOOOnDate(DateTime.fromISO('2024-01-10'));

      expect(oooEngineers).toEqual([]);
    });
  });

  describe('isConfigured', () => {
    it('should return calendar service configuration status', () => {
      mockCalendarService.isConfigured.mockReturnValue(true);
      expect(availabilityService.isConfigured()).toBe(true);

      mockCalendarService.isConfigured.mockReturnValue(false);
      expect(availabilityService.isConfigured()).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear the cache and reset initialization state', async () => {
      // Initialize cache first
      mockCalendarService.getOOOEvents.mockResolvedValue({
        'john.doe@company.com': [],
      });

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      let stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(true);

      // Clear cache
      availabilityService.clearCache();

      stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(false);
      expect(stats.engineerCount).toBe(0);
      expect(stats.totalEvents).toBe(0);
      expect(stats.cacheRange).toBeUndefined();
    });
  });
});
