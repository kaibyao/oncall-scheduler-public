import { DateTime } from 'luxon';
import { Logger } from '../logger.js';
import { GoogleCalendarService } from '../google/google-calendar.service.js';
import type { EngineerOOOCache, OOOEvent } from '../google/google-calendar.types.js';

const logger = new Logger('schedule-availability');

export class ScheduleAvailabilityService {
  private calendarService: GoogleCalendarService;
  private oooCache: EngineerOOOCache = {};
  private cacheInitialized = false;
  private cacheStartDate?: DateTime;
  private cacheEndDate?: DateTime;

  constructor() {
    this.calendarService = new GoogleCalendarService();
  }

  /**
   * Initialize the OOO cache for the given date range
   * This should be called once at the beginning of schedule generation
   */
  async initializeOOOCache(startDate: DateTime, endDate: DateTime): Promise<void> {
    try {
      logger.info(`Initializing OOO cache from ${startDate.toISODate()} to ${endDate.toISODate()}`);

      // If calendar service is not configured, use empty cache
      if (!this.calendarService.isConfigured()) {
        logger.warn('Google Calendar service is not configured, using empty OOO cache');
        this.oooCache = {};
        this.cacheInitialized = true;
        this.cacheStartDate = startDate;
        this.cacheEndDate = endDate;
        logger.info('OOO cache initialized with empty data (service not configured)');
        return;
      }

      const startTime = Date.now();
      this.oooCache = await this.calendarService.getOOOEvents(startDate, endDate);
      const duration = Date.now() - startTime;

      this.cacheInitialized = true;
      this.cacheStartDate = startDate;
      this.cacheEndDate = endDate;

      const engineerCount = Object.keys(this.oooCache).length;
      const totalEvents = Object.values(this.oooCache).flat().length;

      logger.info(`OOO cache initialized in ${duration}ms: ${engineerCount} engineers with ${totalEvents} OOO events`);

      // Log summary of OOO events for debugging
      if (totalEvents > 0) {
        this.logOOOSummary();
      }
    } catch (error) {
      logger.error('Failed to initialize OOO cache:', error);

      // For graceful degradation, continue with empty cache
      this.oooCache = {};
      this.cacheInitialized = true;
      this.cacheStartDate = startDate;
      this.cacheEndDate = endDate;

      logger.warn('Continuing with empty OOO cache due to initialization failure');
    }
  }

  /**
   * Check if an engineer is available on a specific date
   * @param engineerEmail - Engineer's email address
   * @param date - Date to check availability for
   * @returns true if engineer is available, false if OOO or error occurred
   */
  async isEngineerAvailable(engineerEmail: string, date: DateTime): Promise<boolean> {
    try {
      // Ensure cache is initialized
      if (!this.cacheInitialized) {
        logger.warn('OOO cache not initialized, assuming engineer is available');
        return true;
      }

      // Check if the requested date is within our cache range
      if (this.cacheStartDate && this.cacheEndDate) {
        if (date < this.cacheStartDate || date > this.cacheEndDate) {
          logger.warn(`Date ${date.toISODate()} is outside cache range, assuming engineer is available`);
          return true;
        }
      }

      // Check if engineer has any OOO events
      const engineerOOOEvents = this.oooCache[engineerEmail.toLowerCase()];
      if (!engineerOOOEvents || engineerOOOEvents.length === 0) {
        return true;
      }

      // Check if the date falls within any OOO event
      const dateString = date.toISODate();
      if (!dateString) {
        logger.warn(`Invalid date provided: ${date}`);
        return true;
      }

      const isOOO = engineerOOOEvents.some((event) => this.isDateWithinOOOEvent(dateString, event));

      if (isOOO) {
        const conflictingEvent = engineerOOOEvents.find((event) => this.isDateWithinOOOEvent(dateString, event));

        logger.info(`Engineer ${engineerEmail} is OOO on ${dateString}: "${conflictingEvent?.title}"`);
      }

      return !isOOO;
    } catch (error) {
      logger.error(`Error checking availability for ${engineerEmail} on ${date.toISODate()}:`, error);

      // For graceful degradation, assume engineer is available on error
      return true;
    }
  }

  /**
   * Get all OOO events for a specific engineer
   */
  getEngineerOOOEvents(engineerEmail: string): OOOEvent[] {
    if (!this.cacheInitialized) {
      return [];
    }

    return this.oooCache[engineerEmail.toLowerCase()] || [];
  }

  /**
   * Get all engineers who are OOO on a specific date
   */
  getEngineersOOOOnDate(date: DateTime): string[] {
    if (!this.cacheInitialized) {
      return [];
    }

    const dateString = date.toISODate();
    if (!dateString) {
      return [];
    }

    const oooEngineers: string[] = [];

    for (const [engineerEmail, events] of Object.entries(this.oooCache)) {
      const isOOO = events.some((event) => this.isDateWithinOOOEvent(dateString, event));
      if (isOOO) {
        oooEngineers.push(engineerEmail);
      }
    }

    return oooEngineers;
  }

  /**
   * Check if a date string falls within an OOO event's date range
   */
  private isDateWithinOOOEvent(dateString: string, event: OOOEvent): boolean {
    return dateString >= event.startDate && dateString <= event.endDate;
  }

  /**
   * Log summary of OOO events for debugging
   */
  private logOOOSummary(): void {
    const summary: Record<string, number> = {};
    let totalDays = 0;

    for (const [engineerEmail, events] of Object.entries(this.oooCache)) {
      let engineerOOODays = 0;

      for (const event of events) {
        const startDate = DateTime.fromISO(event.startDate);
        const endDate = DateTime.fromISO(event.endDate);
        const days = Math.max(1, endDate.diff(startDate, 'days').days + 1);
        engineerOOODays += days;
      }

      summary[engineerEmail] = engineerOOODays;
      totalDays += engineerOOODays;
    }

    logger.info('OOO Summary:', { summary, totalDays });
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats(): {
    initialized: boolean;
    engineerCount: number;
    totalEvents: number;
    cacheRange?: { start: string; end: string };
  } {
    const engineerCount = Object.keys(this.oooCache).length;
    const totalEvents = Object.values(this.oooCache).flat().length;

    return {
      initialized: this.cacheInitialized,
      engineerCount,
      totalEvents,
      cacheRange:
        this.cacheStartDate && this.cacheEndDate
          ? {
              start: this.cacheStartDate.toISODate()!,
              end: this.cacheEndDate.toISODate()!,
            }
          : undefined,
    };
  }

  /**
   * Check if the calendar service is properly configured
   */
  isConfigured(): boolean {
    return this.calendarService.isConfigured();
  }

  /**
   * Clear the cache (useful for testing or manual refresh)
   */
  clearCache(): void {
    this.oooCache = {};
    this.cacheInitialized = false;
    this.cacheStartDate = undefined;
    this.cacheEndDate = undefined;
    logger.info('OOO cache cleared');
  }
}

// Export singleton instance for use across the application
export const scheduleAvailabilityService = new ScheduleAvailabilityService();
