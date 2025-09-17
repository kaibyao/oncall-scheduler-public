import { DateTime } from 'luxon';
import { getAllUsers } from '../database/queries.js';
import { Logger } from '../logger.js';
import { GoogleCalendarClient } from './google-calendar.client.js';
import {
  CalendarErrorCode,
  type CalendarEvent,
  type EngineerOOOCache,
  type OOOEvent,
  type GoogleCalendarEvent,
  type CalendarServiceOptions,
} from './google-calendar.types.js';

const logger = new Logger('google-calendar-service');

export class GoogleCalendarService {
  private client: GoogleCalendarClient;
  private engineerEmailToNameMap: Map<string, string> = new Map();
  private engineerNameToEmailMap: Map<string, string> = new Map();
  private engineerMappingsInitialized = false;

  constructor(options: CalendarServiceOptions = {}) {
    this.client = new GoogleCalendarClient(options);
    // Lazy initialization - only initialize mappings when actually needed
  }

  private ensureEngineerMappingsInitialized(): void {
    if (this.engineerMappingsInitialized) {
      return;
    }

    this.initializeEngineerMappings();
  }

  private initializeEngineerMappings(): void {
    if (this.engineerMappingsInitialized) {
      return;
    }

    try {
      const users = getAllUsers();

      for (const user of users) {
        this.engineerEmailToNameMap.set(user.email.toLowerCase(), user.name);

        // Create multiple name variations for better matching
        const firstName = user.name.split(' ')[0].toLowerCase();
        const fullName = user.name.toLowerCase();

        this.engineerNameToEmailMap.set(firstName, user.email);
        this.engineerNameToEmailMap.set(fullName, user.email);

        // Handle common nickname variations
        const nicknames = this.generateNicknames(firstName);
        for (const nickname of nicknames) {
          this.engineerNameToEmailMap.set(nickname, user.email);
        }
      }

      logger.info(`Initialized engineer mappings for ${users.length} engineers`);
      this.engineerMappingsInitialized = true;
    } catch (error) {
      logger.error('Failed to initialize engineer mappings:', error);
      // Don't throw error during lazy initialization
      this.engineerMappingsInitialized = false;
    }
  }

  private generateNicknames(firstName: string): string[] {
    const nicknames: string[] = [];
    const name = firstName.toLowerCase();

    // Common nickname patterns
    const nicknameMap: Record<string, string[]> = {
      robert: ['rob', 'bob', 'bobby'],
      william: ['will', 'bill', 'billy'],
      richard: ['rick', 'dick'],
      michael: ['mike', 'mick'],
      christopher: ['chris'],
      matthew: ['matt'],
      anthony: ['tony'],
      daniel: ['dan', 'danny'],
      joseph: ['joe', 'joey'],
      thomas: ['tom', 'tommy'],
      andrew: ['andy', 'drew'],
      jonathan: ['jon', 'john'],
      alexander: ['alex'],
      benjamin: ['ben'],
      nicholas: ['nick'],
      samuel: ['sam'],
      elizabeth: ['liz', 'beth', 'lizzy'],
      jennifer: ['jen', 'jenny'],
      jessica: ['jess'],
      patricia: ['pat', 'patty'],
      katherine: ['kate', 'katie', 'kathy'],
      stephanie: ['steph'],
    };

    if (nicknameMap[name]) {
      nicknames.push(...nicknameMap[name]);
    }

    return nicknames;
  }

  async getOOOEvents(startDate: DateTime, endDate: DateTime): Promise<EngineerOOOCache> {
    if (!this.client.isConfigured()) {
      logger.warn('Google Calendar client is not configured, returning empty OOO events');
      return {};
    }

    // Ensure engineer mappings are initialized
    this.ensureEngineerMappingsInitialized();

    try {
      const timeMin = startDate.toISO();
      const timeMax = endDate.toISO();

      if (!timeMin || !timeMax) {
        throw new Error('Invalid date range provided');
      }

      logger.info(`Fetching OOO events from ${startDate.toISODate()} to ${endDate.toISODate()}`);

      const response = await this.client.fetchEvents(timeMin, timeMax);
      const events = response.items || [];

      logger.info(`Processing ${events.length} calendar events for OOO information`);

      const oooEvents: OOOEvent[] = [];
      let processedCount = 0;
      let skippedCount = 0;

      for (const event of events) {
        const oooEvent = this.parseOOOEvent(event);
        if (oooEvent) {
          oooEvents.push(oooEvent);
          processedCount++;
        } else {
          skippedCount++;
        }
      }

      logger.info(`Processed ${processedCount} OOO events, skipped ${skippedCount} non-OOO events`);

      return this.groupOOOEventsByEngineer(oooEvents);
    } catch (error) {
      logger.error('Failed to fetch OOO events:', error);

      // For graceful degradation, return empty cache if calendar is unavailable
      if (this.isCalendarUnavailableError(error)) {
        logger.warn('Calendar API unavailable, continuing with empty OOO cache');
        return {};
      }

      throw error;
    }
  }

  private parseOOOEvent(event: GoogleCalendarEvent): OOOEvent | null {
    if (!event.id || !event.summary) {
      return null;
    }

    // Check if this looks like an OOO event
    const title = event.summary.toLowerCase();
    if (!this.isOOOEvent(title)) {
      return null;
    }

    // Extract dates
    const dateRange = this.extractDateRange(event);
    if (!dateRange) {
      logger.debug(`Skipping event ${event.id}: could not extract date range`);
      return null;
    }

    // Try to identify the engineer
    const engineerInfo = this.identifyEngineer(event);
    if (!engineerInfo.email) {
      logger.warn(`Could not identify engineer for OOO event: "${event.summary}"`);
      return null;
    }

    // If the event is more than 5 business days, increase the end date by 5 business days
    // This is to help people ease back into the office after a long OOO.
    const startDate = DateTime.fromISO(dateRange.startDate);
    const endDate = DateTime.fromISO(dateRange.endDate);
    const daysBetween = endDate.diff(startDate, 'days').days;
    if (daysBetween >= 5) {
      const newEndDate = endDate.plus({ days: 5 }).toISODate();
      if (newEndDate) {
        dateRange.endDate = newEndDate;
      }
    }

    return {
      id: event.id,
      engineerEmail: engineerInfo.email,
      engineerName: engineerInfo.name,
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
      title: event.summary,
      rawEvent: this.convertToCalendarEvent(event),
      mappingMethod: engineerInfo.mappingMethod,
    };
  }

  private isOOOEvent(title: string): boolean {
    const oooPatterns = [
      /\booo\b/i,
      /\bout of office\b/i,
      /\bvacation\b/i,
      /\bholiday\b/i,
      /\btime off\b/i,
      /\baway\b/i,
      /\boff\b/i,
      /\bpto\b/i,
      /\bsick\b/i,
    ];

    return oooPatterns.some((pattern) => pattern.test(title));
  }

  private extractDateRange(event: GoogleCalendarEvent): { startDate: string; endDate: string } | null {
    const start = event.start?.date || event.start?.dateTime;
    const end = event.end?.date || event.end?.dateTime;

    if (!start || !end) {
      return null;
    }

    try {
      let startDate: DateTime;
      let endDate: DateTime;

      // Handle all-day events (date format) vs. timed events (dateTime format)
      if (event.start?.date) {
        startDate = DateTime.fromISO(event.start.date);
      } else if (event.start?.dateTime) {
        startDate = DateTime.fromISO(event.start.dateTime);
      } else {
        return null;
      }

      if (event.end?.date) {
        // For all-day events, end date is exclusive, so subtract one day
        endDate = DateTime.fromISO(event.end.date).minus({ days: 1 });
      } else if (event.end?.dateTime) {
        endDate = DateTime.fromISO(event.end.dateTime);
      } else {
        return null;
      }

      return {
        startDate: startDate.toISODate() || '',
        endDate: endDate.toISODate() || '',
      };
    } catch (error) {
      logger.warn('Failed to parse event dates:', error);
      return null;
    }
  }

  private identifyEngineer(event: GoogleCalendarEvent): {
    email: string | null;
    name?: string;
    mappingMethod: 'title' | 'creator_email';
  } {
    // Method 1: Parse event title for pattern "<first name> OOO"
    if (event.summary) {
      const titleMatch = this.extractEngineerFromTitle(event.summary);
      if (titleMatch) {
        return {
          email: titleMatch,
          name: this.engineerEmailToNameMap.get(titleMatch.toLowerCase()),
          mappingMethod: 'title',
        };
      }
    }

    // Method 2: Use event creator's email address
    if (event.creator?.email) {
      const creatorEmail = event.creator.email.toLowerCase();
      if (this.engineerEmailToNameMap.has(creatorEmail)) {
        return {
          email: creatorEmail,
          name: this.engineerEmailToNameMap.get(creatorEmail),
          mappingMethod: 'creator_email',
        };
      }
    }

    return { email: null, mappingMethod: 'title' };
  }

  private extractEngineerFromTitle(title: string): string | null {
    // Pattern: "<first name> OOO" or "<first name> out of office" etc.
    const patterns = [
      /^(\w+)\s+ooo\b/i,
      /^(\w+)\s+out\s+of\s+office\b/i,
      /^(\w+)\s+vacation\b/i,
      /^(\w+)\s+holiday\b/i,
      /^(\w+)\s+time\s+off\b/i,
      /^(\w+)\s+away\b/i,
      /^(\w+)\s+off\b/i,
      /^(\w+)\s+pto\b/i,
      /^(\w+)\s+sick\b/i,
    ];

    for (const pattern of patterns) {
      const match = title.match(pattern);
      if (match && match[1]) {
        const firstName = match[1].toLowerCase();
        const email = this.engineerNameToEmailMap.get(firstName);
        if (email) {
          return email;
        }
      }
    }

    return null;
  }

  private convertToCalendarEvent(event: GoogleCalendarEvent): CalendarEvent {
    return {
      id: event.id || '',
      summary: event.summary || undefined,
      description: event.description || undefined,
      start: event.start
        ? {
            date: event.start.date || undefined,
            dateTime: event.start.dateTime || undefined,
            timeZone: event.start.timeZone || undefined,
          }
        : undefined,
      end: event.end
        ? {
            date: event.end.date || undefined,
            dateTime: event.end.dateTime || undefined,
            timeZone: event.end.timeZone || undefined,
          }
        : undefined,
      creator: event.creator
        ? {
            email: event.creator.email || undefined,
            displayName: event.creator.displayName || undefined,
          }
        : undefined,
      attendees: event.attendees?.map((attendee) => ({
        email: attendee.email || undefined,
        displayName: attendee.displayName || undefined,
        responseStatus: attendee.responseStatus || undefined,
      })),
    };
  }

  private groupOOOEventsByEngineer(events: OOOEvent[]): EngineerOOOCache {
    const cache: EngineerOOOCache = {};

    for (const event of events) {
      if (!cache[event.engineerEmail]) {
        cache[event.engineerEmail] = [];
      }
      cache[event.engineerEmail].push(event);
    }

    // Sort events by start date for each engineer
    for (const engineerEmail in cache) {
      cache[engineerEmail].sort((a, b) => a.startDate.localeCompare(b.startDate));
    }

    return cache;
  }

  private isCalendarUnavailableError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      const errorWithCode = error as { code: CalendarErrorCode };
      return (
        errorWithCode.code === CalendarErrorCode.API_UNAVAILABLE ||
        errorWithCode.code === CalendarErrorCode.NETWORK_ERROR ||
        errorWithCode.code === CalendarErrorCode.AUTH_FAILURE
      );
    }
    return false;
  }

  isConfigured(): boolean {
    return this.client.isConfigured();
  }

  getEngineerMappings(): { emailToName: Map<string, string>; nameToEmail: Map<string, string> } {
    this.ensureEngineerMappingsInitialized();
    return {
      emailToName: new Map(this.engineerEmailToNameMap),
      nameToEmail: new Map(this.engineerNameToEmailMap),
    };
  }
}
