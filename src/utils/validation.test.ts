import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { validateEngineerForRotation, validateDateRange, validateOverrideRequest } from './validation.js';
import { OncallRotationName } from '../schedule/schedule.types.js';
import type { UserEntity, Upsertable } from '../database/entities.js';
import { GhostEngPod } from '../schedule/schedule.types.js';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from '../../test/utils/database.js';
import { upsertUser } from '../database/queries.js';
import type Database from 'better-sqlite3';

// Mock database module to use test database
let testDb: Database.Database;

vi.mock('../database/db.js', () => ({
  default: {
    prepare: (query: string) => {
      if (!testDb) {
        throw new Error('Test database not initialized');
      }
      return testDb.prepare(query);
    },
  },
}));

describe('validation utilities', () => {
  beforeEach(() => {
    testDb = createTestDatabaseWithMigrations();

    // Insert test users directly using upsertUser
    const testUsers: Upsertable<UserEntity>[] = [
      {
        email: 'core.qualified@ghost.org',
        name: 'Core Qualified Engineer',
        slack_user_id: 'U111111',
        notion_person_id: 'notion-core',
        rotation: 'AM',
        pod: GhostEngPod.Zero,
      },
      {
        email: 'am.engineer@ghost.org',
        name: 'AM Engineer',
        slack_user_id: 'U789012',
        notion_person_id: 'notion-456',
        rotation: 'AM',
        pod: GhostEngPod.Blinky,
      },
      {
        email: 'pm.engineer@ghost.org',
        name: 'PM Engineer',
        slack_user_id: 'U345678',
        notion_person_id: 'notion-789',
        rotation: 'PM',
        pod: GhostEngPod.Swayze,
      },
    ];

    testUsers.forEach((user) => upsertUser(user));
  });

  afterEach(() => {
    cleanupTestDatabase(testDb);
    vi.clearAllMocks();
  });

  describe('validateEngineerForRotation', () => {
    it('should validate existing engineer for correct rotation', () => {
      const result = validateEngineerForRotation('core.qualified@ghost.org', OncallRotationName.Core);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject empty email', () => {
      const result = validateEngineerForRotation('', OncallRotationName.Core);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Engineer email is required');
    });

    it('should reject invalid email format', () => {
      const result = validateEngineerForRotation('invalid-email', OncallRotationName.Core);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Engineer email must be a valid email address');
    });

    it('should reject non-existent engineer', () => {
      const result = validateEngineerForRotation('nonexistent@ghost.org', OncallRotationName.Core);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Engineer with email nonexistent@ghost.org not found in database');
    });

    it('should reject engineer not qualified for rotation', () => {
      // Since Core rotation is union of AM + PM, AM engineer IS qualified for Core
      // Test with a non-existent rotation scenario instead
      const result = validateEngineerForRotation('pm.engineer@ghost.org', OncallRotationName.AM);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Engineer pm.engineer@ghost.org is not qualified for AM rotation');
    });

    it('should validate engineer for AM rotation', () => {
      const result = validateEngineerForRotation('am.engineer@ghost.org', OncallRotationName.AM);
      expect(result.isValid).toBe(true);
    });

    it('should validate engineer for PM rotation', () => {
      const result = validateEngineerForRotation('pm.engineer@ghost.org', OncallRotationName.PM);
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateDateRange', () => {
    const tomorrow = DateTime.now().plus({ days: 1 }).toISODate();
    const dayAfterTomorrow = DateTime.now().plus({ days: 2 }).toISODate();
    const yesterday = DateTime.now().minus({ days: 1 }).toISODate();
    const farFuture = DateTime.now().plus({ days: 400 }).toISODate();

    it('should validate future date range', () => {
      const result = validateDateRange(tomorrow!, dayAfterTomorrow!);
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should validate same start and end date', () => {
      const result = validateDateRange(tomorrow!, tomorrow!);
      expect(result.isValid).toBe(true);
    });

    it('should reject missing start date', () => {
      const result = validateDateRange('', tomorrow!);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Both start_date and end_date are required');
    });

    it('should reject missing end date', () => {
      const result = validateDateRange(tomorrow!, '');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Both start_date and end_date are required');
    });

    it('should reject invalid date format', () => {
      const result = validateDateRange('invalid-date', tomorrow!);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('start_date "invalid-date" is not a valid date');
    });

    it('should reject invalid start date', () => {
      const result = validateDateRange('2025-13-45', tomorrow!);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('start_date "2025-13-45" is not a valid date');
    });

    it('should reject invalid end date', () => {
      const result = validateDateRange(tomorrow!, '2025-02-30');
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('end_date "2025-02-30" is not a valid date');
    });

    it('should reject past start date', () => {
      const result = validateDateRange(yesterday!, tomorrow!);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('start_date cannot be in the past');
    });

    it('should reject end date before start date', () => {
      const laterDate = DateTime.now().plus({ days: 3 }).toISODate();
      const result = validateDateRange(laterDate!, tomorrow!);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('end_date must be on or after start_date');
    });

    it('should reject dates too far in the future', () => {
      const result = validateDateRange(farFuture!, farFuture!);
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('end_date cannot be more than 365 days in the future');
    });
  });

  describe('validateOverrideRequest', () => {
    const tomorrow = DateTime.now().plus({ days: 1 }).toISODate();
    const dayAfterTomorrow = DateTime.now().plus({ days: 2 }).toISODate();

    it('should validate complete valid request', () => {
      const result = validateOverrideRequest(
        tomorrow!,
        dayAfterTomorrow!,
        OncallRotationName.Core,
        'core.qualified@ghost.org',
      );
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return date validation error first', () => {
      const yesterday = DateTime.now().minus({ days: 1 }).toISODate();
      const result = validateOverrideRequest(
        yesterday!,
        tomorrow!,
        OncallRotationName.Core,
        'core.qualified@ghost.org',
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('start_date cannot be in the past');
    });

    it('should return engineer validation error when dates are valid', () => {
      const result = validateOverrideRequest(
        tomorrow!,
        dayAfterTomorrow!,
        OncallRotationName.Core,
        'nonexistent@ghost.org',
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Engineer with email nonexistent@ghost.org not found in database');
    });

    it('should return rotation qualification error', () => {
      const result = validateOverrideRequest(
        tomorrow!,
        dayAfterTomorrow!,
        OncallRotationName.AM,
        'pm.engineer@ghost.org',
      );
      expect(result.isValid).toBe(false);
      expect(result.error).toBe('Engineer pm.engineer@ghost.org is not qualified for AM rotation');
    });
  });
});
