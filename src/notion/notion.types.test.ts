import { describe, it, expect } from 'vitest';
import type {
  NotionDateProperty,
  NotionSelectProperty,
  NotionPeopleProperty,
  NotionRichTextProperty,
  NotionPageCreateRequest,
  NotionUser,
  OncallScheduleEntry,
  RotationType,
  PersonLookupCache,
} from './notion.types.js';

describe('notion.types', () => {
  describe('RotationType', () => {
    it('should accept valid rotation types', () => {
      const validRotations: RotationType[] = ['AM', 'Core', 'PM'];

      validRotations.forEach((rotation) => {
        expect(['AM', 'Core', 'PM']).toContain(rotation);
      });
    });
  });

  describe('NotionDateProperty', () => {
    it('should have correct structure for date property', () => {
      const dateProperty: NotionDateProperty = {
        id: 'test-id',
        type: 'date',
        date: {
          start: '2024-01-15T09:00:00.000Z',
          end: '2024-01-15T12:00:00.000Z',
          time_zone: null,
        },
      };

      expect(dateProperty.type).toBe('date');
      expect(dateProperty.date?.start).toBe('2024-01-15T09:00:00.000Z');
      expect(dateProperty.date?.end).toBe('2024-01-15T12:00:00.000Z');
    });

    it('should allow null date value', () => {
      const dateProperty: NotionDateProperty = {
        id: 'test-id',
        type: 'date',
        date: null,
      };

      expect(dateProperty.date).toBeNull();
    });
  });

  describe('NotionSelectProperty', () => {
    it('should have correct structure for select property', () => {
      const selectProperty: NotionSelectProperty = {
        id: 'rotation-id',
        type: 'select',
        select: {
          id: 'option-id',
          name: 'AM',
          color: 'blue',
        },
      };

      expect(selectProperty.type).toBe('select');
      expect(selectProperty.select?.name).toBe('AM');
    });

    it('should allow null select value', () => {
      const selectProperty: NotionSelectProperty = {
        id: 'rotation-id',
        type: 'select',
        select: null,
      };

      expect(selectProperty.select).toBeNull();
    });
  });

  describe('NotionPeopleProperty', () => {
    it('should have correct structure for people property', () => {
      const peopleProperty: NotionPeopleProperty = {
        id: 'people-id',
        type: 'people',
        people: [
          {
            id: 'user-id',
            object: 'user',
            name: 'John Doe',
            avatar_url: null,
            type: 'person',
            person: {
              email: 'john@example.com',
            },
          },
        ],
      };

      expect(peopleProperty.type).toBe('people');
      expect(peopleProperty.people).toHaveLength(1);
      expect(peopleProperty.people[0].type).toBe('person');
      if (peopleProperty.people[0].type === 'person') {
        expect(peopleProperty.people[0].person.email).toBe('john@example.com');
      }
    });

    it('should allow empty people array', () => {
      const peopleProperty: NotionPeopleProperty = {
        id: 'people-id',
        type: 'people',
        people: [],
      };

      expect(peopleProperty.people).toHaveLength(0);
    });
  });

  describe('NotionRichTextProperty', () => {
    it('should have correct structure for rich text property', () => {
      const richTextProperty: NotionRichTextProperty = {
        id: 'text-id',
        type: 'rich_text',
        rich_text: [
          {
            type: 'text',
            text: {
              content: 'John Doe',
              link: null,
            },
            plain_text: 'John Doe',
            href: null,
            annotations: {
              bold: false,
              italic: false,
              strikethrough: false,
              underline: false,
              code: false,
              color: 'default',
            },
          },
        ],
      };

      expect(richTextProperty.type).toBe('rich_text');
      expect(richTextProperty.rich_text[0].type).toBe('text');
      if (richTextProperty.rich_text[0].type === 'text') {
        expect(richTextProperty.rich_text[0].text.content).toBe('John Doe');
      }
    });
  });

  describe('NotionPageCreateRequest', () => {
    it('should have correct structure for page creation', () => {
      const createRequest: NotionPageCreateRequest = {
        parent: {
          database_id: 'database-123',
        },
        properties: {
          Date: {
            id: 'date-id',
            type: 'date',
            date: {
              start: '2024-01-15T09:00:00.000Z',
              end: '2024-01-15T12:00:00.000Z',
              time_zone: null,
            },
          },
          Rotation: {
            id: 'rotation-id',
            type: 'select',
            select: {
              id: 'am-id',
              name: 'AM',
              color: 'blue',
            },
          },
        },
      };

      expect(createRequest.parent.database_id).toBe('database-123');
      expect(createRequest.properties.Date?.date?.start).toBe('2024-01-15T09:00:00.000Z');
    });
  });

  describe('NotionUser', () => {
    it('should have correct structure for person user', () => {
      const user: NotionUser = {
        id: 'user-123',
        name: 'John Doe',
        type: 'person',
        person: {
          email: 'john@example.com',
        },
      };

      expect(user.type).toBe('person');
      expect(user.person?.email).toBe('john@example.com');
    });

    it('should have correct structure for bot user', () => {
      const user: NotionUser = {
        id: 'bot-123',
        type: 'bot',
        bot: {
          owner: {
            type: 'workspace',
          },
          workspace_name: 'Test Workspace',
        },
      };

      expect(user.type).toBe('bot');
      expect(user.bot?.owner.type).toBe('workspace');
    });
  });

  describe('OncallScheduleEntry', () => {
    it('should have correct structure for schedule entry', () => {
      const entry: OncallScheduleEntry = {
        date: '2024-01-15',
        rotation: 'AM',
        originalEngineer: 'john@example.com',
        overrideEngineer: 'jane@example.com',
        finalEngineer: 'jane@example.com',
        startDateTime: '2024-01-15T09:00:00.000-08:00',
        endDateTime: '2024-01-15T12:00:00.000-08:00',
      };

      expect(entry.rotation).toBe('AM');
      expect(entry.originalEngineer).toBe('john@example.com');
      expect(entry.finalEngineer).toBe('jane@example.com');
    });

    it('should allow optional override engineer', () => {
      const entry: OncallScheduleEntry = {
        date: '2024-01-15',
        rotation: 'Core',
        originalEngineer: 'john@example.com',
        finalEngineer: 'john@example.com',
        startDateTime: '2024-01-15T12:00:00.000-08:00',
        endDateTime: '2024-01-15T18:00:00.000-08:00',
      };

      expect(entry.overrideEngineer).toBeUndefined();
      expect(entry.finalEngineer).toBe('john@example.com');
    });
  });

  describe('PersonLookupCache', () => {
    it('should have correct structure for unified cache', () => {
      const cache: PersonLookupCache = {
        emailToPersonId: {
          'john@example.com': 'user-123',
          'unknown@example.com': null,
          'jane@example.com': 'user-456',
        },
        personIdToInfo: {
          'user-123': { email: 'john@example.com', name: 'John Doe' },
          'user-456': { email: 'jane@example.com', name: 'Jane Smith' },
        },
      };

      expect(cache.emailToPersonId['john@example.com']).toBe('user-123');
      expect(cache.emailToPersonId['unknown@example.com']).toBeNull();
      expect(cache.personIdToInfo['user-123'].email).toBe('john@example.com');
      expect(cache.personIdToInfo['user-123'].name).toBe('John Doe');
    });
  });
});
