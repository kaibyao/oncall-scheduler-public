import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { ScheduleAvailabilityService } from '../schedule/schedule.availability.js';

// Mock the Google Calendar service
vi.mock('./google-calendar.service.js', () => ({
  GoogleCalendarService: vi.fn(),
}));

vi.mock('../logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
}));

describe('Google Calendar - Graceful Degradation Scenarios', () => {
  let mockCalendarService: { isConfigured: ReturnType<typeof vi.fn>; getOOOEvents: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Mock the calendar service with different failure scenarios
    mockCalendarService = {
      isConfigured: vi.fn(),
      getOOOEvents: vi.fn(),
    };

    const { GoogleCalendarService } = (await vi.importMock('./google-calendar.service.js')) as {
      GoogleCalendarService: ReturnType<typeof vi.fn>;
    };
    GoogleCalendarService.mockImplementation(() => mockCalendarService);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Calendar Service Not Configured', () => {
    it('should handle unconfigured calendar service gracefully', async () => {
      mockCalendarService.isConfigured.mockReturnValue(false);

      const availabilityService = new ScheduleAvailabilityService();

      // Should not try to initialize cache when service is not configured
      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      // Should always return true (available) when not configured
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-15'),
      );

      expect(isAvailable).toBe(true);
      expect(mockCalendarService.getOOOEvents).not.toHaveBeenCalled();
    });

    it('should report correct configuration status', () => {
      mockCalendarService.isConfigured.mockReturnValue(false);

      const availabilityService = new ScheduleAvailabilityService();
      expect(availabilityService.isConfigured()).toBe(false);
    });
  });

  describe('Calendar API Failures', () => {
    it('should handle network errors gracefully', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);
      mockCalendarService.getOOOEvents.mockRejectedValue(new Error('Network timeout'));

      const availabilityService = new ScheduleAvailabilityService();

      // Should not throw on initialization failure
      await expect(
        availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31')),
      ).resolves.not.toThrow();

      // Should return true (available) when cache failed to initialize
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-15'),
      );

      expect(isAvailable).toBe(true);
    });

    it('should handle authentication failures gracefully', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);
      mockCalendarService.getOOOEvents.mockRejectedValue(new Error('Authentication failed'));

      const availabilityService = new ScheduleAvailabilityService();

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      // Should still function with graceful degradation
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-15'),
      );

      expect(isAvailable).toBe(true);
    });

    it('should handle malformed API responses gracefully', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);
      mockCalendarService.getOOOEvents.mockResolvedValue(null); // Invalid response

      const availabilityService = new ScheduleAvailabilityService();

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-15'),
      );

      expect(isAvailable).toBe(true);
    });
  });

  describe('Partial Data Scenarios', () => {
    it('should handle empty OOO events gracefully', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);
      mockCalendarService.getOOOEvents.mockResolvedValue({}); // Empty cache

      const availabilityService = new ScheduleAvailabilityService();

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      const stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(true);
      expect(stats.engineerCount).toBe(0);
      expect(stats.totalEvents).toBe(0);

      // Should return true when no OOO events exist
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-15'),
      );

      expect(isAvailable).toBe(true);
    });

    it('should handle cache not initialized gracefully', async () => {
      const availabilityService = new ScheduleAvailabilityService();

      // Don't initialize cache
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-15'),
      );

      expect(isAvailable).toBe(true);

      const stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(false);
    });

    it('should handle dates outside cache range gracefully', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);
      mockCalendarService.getOOOEvents.mockResolvedValue({
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
      });

      const availabilityService = new ScheduleAvailabilityService();

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      // Check availability outside cache range
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-02-15'), // Outside cache range
      );

      // Should return true for dates outside cache range
      expect(isAvailable).toBe(true);
    });
  });

  describe('Error Recovery', () => {
    it('should recover after clearing cache', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);
      mockCalendarService.getOOOEvents.mockResolvedValue({
        'john.doe@company.com': [],
      });

      const availabilityService = new ScheduleAvailabilityService();

      // Initialize cache
      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      let stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(true);

      // Clear cache
      availabilityService.clearCache();

      stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(false);

      // Should still function after clearing cache
      const isAvailable = await availabilityService.isEngineerAvailable(
        'john.doe@company.com',
        DateTime.fromISO('2024-01-15'),
      );

      expect(isAvailable).toBe(true);
    });

    it('should handle reinitialization after failure', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);

      // First call fails
      mockCalendarService.getOOOEvents.mockRejectedValueOnce(new Error('Network error'));
      // Second call succeeds
      mockCalendarService.getOOOEvents.mockResolvedValueOnce({
        'john.doe@company.com': [],
      });

      const availabilityService = new ScheduleAvailabilityService();

      // First initialization fails
      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      let stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(true); // Graceful degradation: continue with empty cache

      // Clear cache to test reinitialization
      availabilityService.clearCache();
      stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(false); // Now cleared for retry

      // Second initialization succeeds
      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      stats = availabilityService.getCacheStats();
      expect(stats.initialized).toBe(true); // Should now be true
    });
  });

  describe('Performance Under Failure', () => {
    it('should not block when calendar service is slow', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);

      // Mock a slow response
      mockCalendarService.getOOOEvents.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));

      const availabilityService = new ScheduleAvailabilityService();

      const startTime = Date.now();

      // Initialize cache (should handle slow response)
      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      const duration = Date.now() - startTime;

      // Should complete within reasonable time (allowing for the 100ms mock delay)
      expect(duration).toBeLessThan(200);
    });

    it('should remain responsive during availability checks', async () => {
      mockCalendarService.isConfigured.mockReturnValue(true);
      mockCalendarService.getOOOEvents.mockResolvedValue({});

      const availabilityService = new ScheduleAvailabilityService();

      await availabilityService.initializeOOOCache(DateTime.fromISO('2024-01-01'), DateTime.fromISO('2024-01-31'));

      // Multiple rapid availability checks should be fast
      const startTime = Date.now();

      const promises = Array.from({ length: 10 }, (_, i) =>
        availabilityService.isEngineerAvailable(`engineer${i}@company.com`, DateTime.fromISO('2024-01-15')),
      );

      const results = await Promise.all(promises);

      const duration = Date.now() - startTime;

      // All should return true (available)
      expect(results.every((result) => result === true)).toBe(true);

      // Should complete quickly
      expect(duration).toBeLessThan(50);
    });
  });
});
