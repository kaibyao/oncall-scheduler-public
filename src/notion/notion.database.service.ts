import type { NotionClient, OncallScheduleEntry, RotationType } from './notion.types.js';
import type {
  QueryDatabaseResponse,
  PageObjectResponse,
  QueryDatabaseParameters,
  CreatePageParameters,
} from '@notionhq/client/build/src/api-endpoints.js';
import { notionClient } from './notion.client.js';
import { getNotionDatabaseId } from './notion.databases.js';
import { Logger } from '../logger.js';
import { retryWithExponentialBackoff, type RetryOptions } from '../utils/retry.js';
import { NotionUserService } from './notion.user.service.js';

export class NotionDatabaseService {
  private readonly logger: Logger;
  private readonly client: NotionClient;
  private readonly retryOptions: RetryOptions;
  private readonly userService: NotionUserService;

  constructor(userService: NotionUserService, retryOptions: RetryOptions = {}) {
    this.logger = new Logger('notion-database-service');
    this.client = notionClient;
    this.userService = userService;
    this.retryOptions = {
      maxAttempts: 4,
      baseDelayMs: 2000,
      maxDelayMs: 16000,
      ...retryOptions,
    };
  }

  /**
   * Queries existing Notion database entries for a specific time period
   * @param isPast - Whether to query the past calendar database
   * @param startDate - Optional start date filter (YYYY-MM-DD format)
   * @param endDate - Optional end date filter (YYYY-MM-DD format)
   * @returns Array of existing schedule entries from Notion
   */
  async queryNotionDatabase(
    isPast: boolean = false,
    startDate?: string,
    endDate?: string,
  ): Promise<Array<OncallScheduleEntry & { notionPageId: string }>> {
    this.logger.info(`Querying Notion database (isPast: ${isPast}, startDate: ${startDate}, endDate: ${endDate})`);

    const databaseId = getNotionDatabaseId(isPast);

    const queryFn = async (): Promise<Array<OncallScheduleEntry & { notionPageId: string }>> => {
      const allEntries: Array<OncallScheduleEntry & { notionPageId: string }> = [];
      let cursor: string | undefined;

      do {
        // Build filter for date range if provided
        let filter: QueryDatabaseParameters['filter'] = undefined;
        if (startDate || endDate) {
          interface DateFilterCondition {
            property: string;
            date: {
              on_or_after?: string;
              on_or_before?: string;
            };
          }

          const andConditions: DateFilterCondition[] = [];
          if (startDate) {
            andConditions.push({
              property: 'Date',
              date: {
                on_or_after: startDate,
              },
            });
          }
          if (endDate) {
            andConditions.push({
              property: 'Date',
              date: {
                on_or_before: endDate,
              },
            });
          }
          filter = { and: andConditions } as QueryDatabaseParameters['filter'];
        }

        const queryParams: QueryDatabaseParameters = {
          database_id: databaseId,
          start_cursor: cursor,
          page_size: 100,
          archived: false,
        };

        // Add filter if we have date constraints
        if (filter) {
          queryParams.filter = filter;
        }

        const response = (await this.client.databases.query(queryParams)) as QueryDatabaseResponse;

        // Transform Notion pages to OncallScheduleEntry format
        const entries = response.results
          .filter((page): page is PageObjectResponse => 'properties' in page && !('archived' in page && page.archived))
          .map((page) => {
            const entry = this.transformNotionPageToScheduleEntry(page);
            return entry ? { ...entry, notionPageId: page.id } : null;
          })
          .filter((entry): entry is OncallScheduleEntry & { notionPageId: string } => entry !== null);

        allEntries.push(...entries);
        cursor = response.next_cursor || undefined;
      } while (cursor);

      return allEntries;
    };

    try {
      const entries = await retryWithExponentialBackoff(queryFn, this.retryOptions);
      this.logger.info(`Successfully queried ${entries.length} entries from Notion database`);
      return entries;
    } catch (error) {
      this.logger.error('Failed to query Notion database after retries', error);
      throw error;
    }
  }

  /**
   * Transforms a Notion page to an OncallScheduleEntry
   * @param page - Notion page object
   * @returns Transformed schedule entry or null if invalid
   */
  private transformNotionPageToScheduleEntry(page: PageObjectResponse): OncallScheduleEntry | null {
    try {
      const properties = page.properties;

      // Extract date
      const dateProperty = properties.Date;
      if (!dateProperty || dateProperty.type !== 'date' || !dateProperty.date?.start) {
        this.logger.warn(`Page ${page.id} missing date property`);
        return null;
      }
      const date = dateProperty.date.start;

      // Extract rotation
      const rotationProperty = properties.Rotation;
      if (!rotationProperty || rotationProperty.type !== 'select' || !rotationProperty.select?.name) {
        this.logger.warn(`Page ${page.id} missing rotation property`);
        return null;
      }
      const rotation = rotationProperty.select.name as RotationType;

      // Extract original engineer from rich text
      const originalEngineerProperty = properties['Orig. Engineer'];
      let originalEngineer = '';
      if (
        originalEngineerProperty &&
        originalEngineerProperty.type === 'rich_text' &&
        originalEngineerProperty.rich_text &&
        originalEngineerProperty.rich_text.length > 0
      ) {
        // Extract plain text content from rich text
        originalEngineer = originalEngineerProperty.rich_text
          .map((item: { plain_text?: string }) => item.plain_text || '')
          .join('');
      } else if (
        originalEngineerProperty &&
        originalEngineerProperty.type === 'people' &&
        originalEngineerProperty.people &&
        originalEngineerProperty.people.length > 0
      ) {
        // Backward compatibility: handle existing people references during transition
        const firstPerson = originalEngineerProperty.people[0];
        if (
          'type' in firstPerson &&
          firstPerson.type === 'person' &&
          'person' in firstPerson &&
          firstPerson.person?.email
        ) {
          originalEngineer = firstPerson.person.email;
        } else {
          originalEngineer = firstPerson.id;
        }
      }

      // Extract override engineer from rich text
      const overrideProperty = properties.Override;
      let overrideEngineer: string | undefined;
      if (
        overrideProperty &&
        overrideProperty.type === 'rich_text' &&
        overrideProperty.rich_text &&
        overrideProperty.rich_text.length > 0
      ) {
        // Extract plain text content from rich text
        overrideEngineer = overrideProperty.rich_text
          .map((item: { plain_text?: string }) => item.plain_text || '')
          .join('');
      } else if (
        overrideProperty &&
        overrideProperty.type === 'people' &&
        overrideProperty.people &&
        overrideProperty.people.length > 0
      ) {
        // Backward compatibility: handle existing people references during transition
        const firstOverride = overrideProperty.people[0];
        if (
          'type' in firstOverride &&
          firstOverride.type === 'person' &&
          'person' in firstOverride &&
          firstOverride.person?.email
        ) {
          overrideEngineer = firstOverride.person.email;
        } else {
          overrideEngineer = firstOverride.id;
        }
      }

      // Extract final engineer from rich text
      const finalEngineerProperty = properties['Final Engineer'];
      let finalEngineer = originalEngineer; // Default fallback
      if (
        finalEngineerProperty &&
        finalEngineerProperty.type === 'rich_text' &&
        finalEngineerProperty.rich_text &&
        finalEngineerProperty.rich_text.length > 0
      ) {
        // Extract plain text content from rich text
        finalEngineer = finalEngineerProperty.rich_text
          .map((item: { plain_text?: string }) => item.plain_text || '')
          .join('');
      } else if (
        finalEngineerProperty &&
        finalEngineerProperty.type === 'title' &&
        finalEngineerProperty.title &&
        finalEngineerProperty.title.length > 0
      ) {
        // Backward compatibility: handle existing title with mentions during transition
        const titleItem = finalEngineerProperty.title[0];
        if (titleItem.type === 'mention' && titleItem.mention?.type === 'user') {
          // Use user ID from mention (user mentions don't include email in the API response)
          finalEngineer = titleItem.mention.user.id;
        } else {
          // Plain text fallback
          finalEngineer = finalEngineerProperty.title
            .map((item: { plain_text?: string }) => item.plain_text || '')
            .join('');
        }
      }

      return {
        date,
        rotation,
        originalEngineer,
        overrideEngineer,
        finalEngineer,
        startDateTime: '',
        endDateTime: '',
      };
    } catch (error) {
      this.logger.error(`Error transforming Notion page ${page.id} to schedule entry`, error);
      return null;
    }
  }

  /**
   * Transforms local schedule data to Notion page properties format
   * @param entry - Local schedule entry
   * @returns Notion page properties object
   */
  async transformToNotionProperties(entry: OncallScheduleEntry): Promise<CreatePageParameters['properties']> {
    this.logger.debug(`Transforming entry for ${entry.date} ${entry.rotation}`);

    // Get display names for engineers (plain text, no person references)
    const originalEngineerName = await this.userService.getEngineerDisplayName(entry.originalEngineer);
    const overrideEngineerName = entry.overrideEngineer
      ? await this.userService.getEngineerDisplayName(entry.overrideEngineer)
      : null;
    const finalEngineerName = await this.userService.getEngineerDisplayName(entry.finalEngineer);

    // Build properties object
    const properties: CreatePageParameters['properties'] = {
      Date: {
        type: 'date',
        date: {
          start: entry.date,
          end: null,
          time_zone: null,
        },
      },
      Rotation: {
        type: 'select',
        select: {
          name: entry.rotation,
        },
      },
      'Orig. Engineer': {
        type: 'rich_text',
        rich_text: [
          {
            type: 'text',
            text: {
              content: originalEngineerName,
            },
          },
        ],
      },
      'Final Engineer': {
        type: 'title',
        title: [
          {
            type: 'text',
            text: {
              content: finalEngineerName,
            },
          },
        ],
      },
    };

    // Add override if present
    if (entry.overrideEngineer && overrideEngineerName) {
      properties.Override = {
        type: 'rich_text',
        rich_text: [
          {
            type: 'text',
            text: {
              content: overrideEngineerName,
            },
          },
        ],
      };
    } else {
      properties.Override = {
        type: 'rich_text',
        rich_text: [],
      };
    }

    return properties;
  }

  /**
   * Creates a new Notion database entry
   * @param entry - Local schedule entry to create
   * @param isPast - Whether to create in the past calendar database
   * @returns Created page ID
   */
  async createNotionEntry(entry: OncallScheduleEntry, isPast: boolean = false): Promise<string> {
    this.logger.info(
      `Creating Notion entry for ${entry.date} ${entry.rotation} (original: ${entry.originalEngineer}, override: ${entry.overrideEngineer}, final: ${entry.finalEngineer})`,
    );

    const databaseId = getNotionDatabaseId(isPast);
    const properties = await this.transformToNotionProperties(entry);

    const createFn = async (): Promise<string> => {
      const response = await this.client.pages.create({
        parent: {
          database_id: databaseId,
        },
        properties,
      });

      return response.id;
    };

    try {
      const pageId = await retryWithExponentialBackoff(createFn, this.retryOptions);
      this.logger.info(`Successfully created Notion entry with ID: ${pageId}`);
      return pageId;
    } catch (error) {
      this.logger.error(`Failed to create Notion entry for ${entry.date} ${entry.rotation}`, error);
      throw error;
    }
  }

  /**
   * Updates an existing Notion database entry
   * @param entry - Local schedule entry with updates
   * @param notionPageId - ID of the Notion page to update
   * @returns Updated page ID
   */
  async updateNotionEntry(entry: OncallScheduleEntry, notionPageId: string): Promise<string> {
    this.logger.info(
      `Updating Notion entry ${notionPageId} for ${entry.date} ${entry.rotation} (original: ${entry.originalEngineer}, override: ${entry.overrideEngineer}, final: ${entry.finalEngineer})`,
    );

    const properties = await this.transformToNotionProperties(entry);

    const updateFn = async (): Promise<string> => {
      const response = await this.client.pages.update({
        page_id: notionPageId,
        properties: properties,
      });

      return response.id;
    };

    try {
      const pageId = await retryWithExponentialBackoff(updateFn, this.retryOptions);
      this.logger.info(`Successfully updated Notion entry: ${pageId}`);
      return pageId;
    } catch (error) {
      this.logger.error(`Failed to update Notion entry ${notionPageId}`, error);
      throw error;
    }
  }

  /**
   * Archives (soft deletes) a Notion database entry
   * @param notionPageId - ID of the Notion page to archive
   * @returns Archived page ID
   */
  async archiveNotionEntry(notionPageId: string): Promise<string> {
    this.logger.info(`Archiving Notion entry: ${notionPageId}`);

    const archiveFn = async (): Promise<string> => {
      const response = await this.client.pages.update({
        page_id: notionPageId,
        archived: true,
      });

      return response.id;
    };

    try {
      const pageId = await retryWithExponentialBackoff(archiveFn, this.retryOptions);
      this.logger.info(`Successfully archived Notion entry: ${pageId}`);
      return pageId;
    } catch (error) {
      this.logger.error(`Failed to archive Notion entry ${notionPageId}`, error);
      throw error;
    }
  }

  /**
   * Adds a delay to respect Notion API rate limits
   * Notion allows ~3 requests per second for integrations
   */
  async rateLimitDelay(): Promise<void> {
    // Wait 350ms between requests to stay well under the 3 req/sec limit
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
}
