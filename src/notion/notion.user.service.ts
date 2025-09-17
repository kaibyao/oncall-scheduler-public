import type { NotionClient, NotionUser, NotionUsersListResponse, PersonLookupCache } from './notion.types.js';
import { notionClient } from './notion.client.js';
import { Logger } from '../logger.js';
import { retryWithExponentialBackoff, type RetryOptions } from '../utils/retry.js';
import { updateUser, getAllUsers } from '../database/queries.js';
import type { UserEntity } from '../database/entities.js';

export class NotionUserService {
  private readonly logger: Logger;
  private readonly client: NotionClient;
  private readonly personCache: PersonLookupCache = {
    emailToPersonId: {},
    personIdToInfo: {},
  };
  private readonly retryOptions: RetryOptions;

  constructor(retryOptions: RetryOptions = {}) {
    this.logger = new Logger('notion-user-service');
    this.client = notionClient;
    this.retryOptions = {
      maxAttempts: 4,
      baseDelayMs: 2000,
      maxDelayMs: 16000,
      ...retryOptions,
    };
  }

  /**
   * Fetches all users from the Notion workspace with retry logic
   * @returns Array of Notion users
   */
  async fetchAllUsers(): Promise<NotionUser[]> {
    this.logger.info('Fetching all users from Notion workspace');

    const fetchUsers = async (): Promise<NotionUser[]> => {
      const allUsers: NotionUser[] = [];
      let cursor: string | undefined;

      do {
        const response = (await this.client.users.list({
          start_cursor: cursor,
          page_size: 100,
        })) as NotionUsersListResponse;

        allUsers.push(...response.results);
        cursor = response.next_cursor || undefined;
      } while (cursor);

      return allUsers;
    };

    try {
      const users = await retryWithExponentialBackoff(fetchUsers, this.retryOptions);
      this.logger.info(`Successfully fetched ${users.length} users from Notion`);

      // First, load all users from database to avoid unnecessary updates
      let existingNotionIdsByUserEmail: Record<string, string | null> = {};
      try {
        const dbUsers = getAllUsers();
        existingNotionIdsByUserEmail = dbUsers.reduce(
          (acc: Record<string, string | null>, user: UserEntity) => {
            acc[user.email.toLowerCase().trim()] = user.notion_person_id;
            return acc;
          },
          {} as Record<string, string | null>,
        );
      } catch (dbError) {
        this.logger.warn('Failed to load existing users from database during bulk fetch', { dbError });
      }

      // Populate cache with all users and update database cache only when needed
      users.forEach((user) => {
        if (user.type === 'person' && user.person?.email) {
          const userEmail = user.person.email.toLowerCase().trim();
          this.personCache.emailToPersonId[userEmail] = user.id;
          this.personCache.personIdToInfo[user.id] = {
            email: userEmail,
            name: user.name || user.person.email,
          };

          // Only update database if the notion_person_id has changed or doesn't exist
          const existingNotionId = existingNotionIdsByUserEmail[userEmail];
          if (existingNotionId && existingNotionId !== user.id) {
            try {
              updateUser(userEmail, { notion_person_id: user.id });
              this.logger.info('Updated notion_person_id in database', {
                email: userEmail,
                old_id: existingNotionId,
                new_id: user.id,
              });
            } catch (dbError) {
              // Log warning but don't fail the operation
              this.logger.warn('Failed to cache Notion person ID in database during bulk fetch', {
                email: userEmail,
                dbError,
              });
            }
          }
        }
      });

      this.logger.debug(`Populated person cache with ${Object.keys(this.personCache.emailToPersonId).length} users`);

      return users;
    } catch (error) {
      this.logger.error('Failed to fetch users from Notion after retries', error);
      throw error;
    }
  }

  /**
   * Gets the engineer display name (first + last name) for display, using person lookup with fallback to email
   * @param emailOrPersonId - Engineer email address or person ID
   * @returns Display name if found, email if person lookup fails
   */
  async getEngineerDisplayName(emailOrPersonId: string): Promise<string> {
    this.logger.debug(`Getting display name for: ${emailOrPersonId}`);

    try {
      // First, check if this is already a person ID by checking if it's in our reverse cache
      if (emailOrPersonId in this.personCache.personIdToInfo) {
        // It's a person ID, return the cached name
        return this.personCache.personIdToInfo[emailOrPersonId].name;
      }

      // Otherwise, treat it as an email and look up the person ID directly from cache
      const normalizedEmail = emailOrPersonId.toLowerCase().trim();
      const personId = this.personCache.emailToPersonId[normalizedEmail];
      if (personId && personId in this.personCache.personIdToInfo) {
        return this.personCache.personIdToInfo[personId].name;
      }

      // Fallback to the original value (likely an email)
      return emailOrPersonId;
    } catch (error) {
      this.logger.error(`Error getting display name for ${emailOrPersonId}:`, error);
      return emailOrPersonId; // Return original value as fallback
    }
  }
}
