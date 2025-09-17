import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DateTime } from 'luxon';
import { overrideSchedule } from './schedule.overrides.js';
import { createTestDatabaseWithMigrations, cleanupTestDatabase, seedTestData } from '../../test/utils/database.js';
import { OncallRotationName, GhostEngPod } from './schedule.types.js';
import { LambdaTask } from '../aws.types.js';
import type Database from 'better-sqlite3';
import type { OverrideRotationAssignmentLambdaTask } from '../aws.types.js';
import type { OncallScheduleEntity, OncallScheduleOverrideEntity } from '../database/entities.js';

// Database result types for test queries with additional fields
interface OverrideRowWithTimestamp extends OncallScheduleOverrideEntity {
  created_at: string;
}

interface ScheduleRowWithTimestamp extends OncallScheduleEntity {
  created_at: string;
}

interface JoinedRow {
  name: string;
  user_rotations: string;
}
// Store test database reference
let testDb: Database.Database;

// Mock the database module to use our test database
vi.mock('../database/db.js', () => ({
  default: new Proxy(
    {},
    {
      get(_target, prop) {
        return testDb?.[prop as keyof Database.Database];
      },
    },
  ),
}));

// Mock external integrations to prevent actual API calls and environment dependencies
vi.mock('../slack/slack.messages.js', () => ({
  postSlackMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../slack/slack.user-groups.js', () => ({
  getSlackUserGroup: vi.fn(),
  getUserGroupMembers: vi.fn(),
  updateUserGroupMembers: vi.fn(),
}));

vi.mock('../slack/slack.users.js', () => ({
  getSlackUserIdByEmail: vi.fn(),
}));

vi.mock('../notion/notion.sync.service.js', () => ({
  NotionSyncService: vi.fn().mockImplementation(() => ({
    syncToNotion: vi.fn().mockResolvedValue({
      success: true,
      dryRun: false,
      syncStats: {
        created: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
        duration: 100,
        apiCalls: 1,
      },
    }),
    syncDateRangeToNotion: vi.fn().mockResolvedValue({
      success: true,
      dryRun: false,
      syncStats: {
        created: 0,
        updated: 0,
        deleted: 0,
        errors: 0,
        duration: 100,
        apiCalls: 1,
      },
    }),
  })),
}));

describe('Schedule Override - Integration Tests', () => {
  beforeEach(() => {
    // Mock current time to make tests deterministic and dates valid
    const mockDate = DateTime.fromISO('2025-08-01T12:00:00', { zone: 'America/Los_Angeles' });
    vi.useFakeTimers();
    vi.setSystemTime(mockDate.toJSDate());

    // Create fresh test database for each test
    testDb = createTestDatabaseWithMigrations();

    // Seed test data with realistic users and existing schedule
    seedTestData(testDb, {
      users: [
        {
          email: 'alice@ghost.org',
          name: 'Alice Engineer',
          slack_user_id: 'U123ALICE',
          notion_person_id: 'notion-alice-123',
          rotation: OncallRotationName.AM, // AM engineer (so can also do Core)
          pod: GhostEngPod.Blinky,
        },
        {
          email: 'bob@ghost.org',
          name: 'Bob Engineer',
          slack_user_id: 'U123BOB',
          notion_person_id: 'notion-bob-123',
          rotation: OncallRotationName.PM, // PM engineer (so can also do Core)
          pod: GhostEngPod.Swayze,
        },
        {
          email: 'charlie@ghost.org',
          name: 'Charlie Engineer',
          slack_user_id: 'U123CHARLIE',
          notion_person_id: 'notion-charlie-123',
          rotation: OncallRotationName.PM, // PM engineer (so can also do Core)
          pod: GhostEngPod.Zero,
        },
        {
          email: 'diana@ghost.org',
          name: 'Diana Engineer',
          slack_user_id: 'U123DIANA',
          notion_person_id: 'notion-diana-123',
          rotation: OncallRotationName.AM, // AM engineer (so can also do Core)
          pod: GhostEngPod.Blinky,
        },
      ],
      schedules: [
        // Existing schedule entries for the next week (Monday-Friday)
        { date: '2025-08-04', rotation: OncallRotationName.AM, engineer_email: 'alice@ghost.org' },
        { date: '2025-08-04', rotation: OncallRotationName.Core, engineer_email: 'bob@ghost.org' },
        { date: '2025-08-04', rotation: OncallRotationName.PM, engineer_email: 'charlie@ghost.org' },
        { date: '2025-08-05', rotation: OncallRotationName.AM, engineer_email: 'diana@ghost.org' },
        { date: '2025-08-05', rotation: OncallRotationName.Core, engineer_email: 'alice@ghost.org' },
        { date: '2025-08-05', rotation: OncallRotationName.PM, engineer_email: 'bob@ghost.org' },
        { date: '2025-08-06', rotation: OncallRotationName.AM, engineer_email: 'alice@ghost.org' },
        { date: '2025-08-06', rotation: OncallRotationName.Core, engineer_email: 'charlie@ghost.org' },
        { date: '2025-08-06', rotation: OncallRotationName.PM, engineer_email: 'diana@ghost.org' },
      ],
    });
  });

  afterEach(() => {
    cleanupTestDatabase(testDb);
    vi.useRealTimers();
  });

  describe('End-to-End Override Flow', () => {
    it('should successfully override a single date for Core rotation', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-04',
        rotation: OncallRotationName.Core,
        engineer_email: 'charlie@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully overridden 1 dates for Core rotation');
      expect(result.overridden_dates).toEqual(['2025-08-04']);
      expect(result.replaced_engineers).toEqual(['bob@ghost.org']);

      // Verify override was persisted in database
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date = ? AND rotation = ?');
      const override = overrideQuery.get('2025-08-04', 'Core') as OverrideRowWithTimestamp;
      expect(override).toBeTruthy();
      expect(override.engineer_email).toBe('charlie@ghost.org');

      // Verify original schedule still exists (override doesn't delete original)
      const scheduleQuery = testDb.prepare('SELECT * FROM oncall_schedule WHERE date = ? AND rotation = ?');
      const schedule = scheduleQuery.get('2025-08-04', 'Core') as ScheduleRowWithTimestamp;
      expect(schedule).toBeTruthy();
      expect(schedule.engineer_email).toBe('bob@ghost.org');
    });

    it('should successfully override multiple consecutive dates', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-06',
        rotation: OncallRotationName.AM,
        engineer_email: 'diana@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully overridden 3 dates for AM rotation');
      expect(result.overridden_dates).toEqual(['2025-08-04', '2025-08-05', '2025-08-06']);
      expect(result.replaced_engineers).toEqual(['alice@ghost.org', 'diana@ghost.org']);

      // Verify all overrides were persisted
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE rotation = ? ORDER BY date');
      const overrides = overrideQuery.all('AM') as OverrideRowWithTimestamp[];
      expect(overrides).toHaveLength(3);
      expect(overrides.map((o) => o.date)).toEqual(['2025-08-04', '2025-08-05', '2025-08-06']);
      expect(overrides.every((o) => o.engineer_email === 'diana@ghost.org')).toBe(true);
    });

    it('should handle date range spanning weekends by excluding them', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-08', // Friday
        end_date: '2025-08-12', // Tuesday (includes Sat-Sun weekend)
        rotation: OncallRotationName.PM,
        engineer_email: 'charlie@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(true);
      expect(result.overridden_dates).toEqual(['2025-08-08', '2025-08-11', '2025-08-12']); // Fri, Mon, Tue only
      expect(result.overridden_dates).not.toContain('2025-08-09'); // Saturday excluded
      expect(result.overridden_dates).not.toContain('2025-08-10'); // Sunday excluded

      // Verify only weekday overrides were persisted
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE rotation = ? ORDER BY date');
      const overrides = overrideQuery.all('PM') as OverrideRowWithTimestamp[];
      expect(overrides).toHaveLength(3);
      expect(overrides.map((o) => o.date)).toEqual(['2025-08-08', '2025-08-11', '2025-08-12']);
    });

    it('should handle overriding when no existing assignment exists', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-11', // Monday (no existing schedule data)
        end_date: '2025-08-11',
        rotation: OncallRotationName.Core,
        engineer_email: 'alice@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully overridden 1 dates for Core rotation');
      expect(result.overridden_dates).toEqual(['2025-08-11']);
      expect(result.replaced_engineers).toEqual([]); // No one to replace

      // Verify override was persisted
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date = ? AND rotation = ?');
      const override = overrideQuery.get('2025-08-11', 'Core') as OverrideRowWithTimestamp;
      expect(override).toBeTruthy();
      expect(override.engineer_email).toBe('alice@ghost.org');
    });

    it('should update existing override (upsert behavior)', async () => {
      // First override - Charlie (PM engineer) overrides PM rotation
      const firstOverride: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-04',
        rotation: OncallRotationName.PM,
        engineer_email: 'charlie@ghost.org',
      };

      const firstResult = await overrideSchedule(firstOverride);
      expect(firstResult.success).toBe(true);

      // Second override for same date/rotation with different PM engineer
      const secondOverride: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-04',
        rotation: OncallRotationName.PM,
        engineer_email: 'bob@ghost.org', // Bob is also PM engineer
      };

      const secondResult = await overrideSchedule(secondOverride);
      expect(secondResult.success).toBe(true);

      // Verify only one override record exists with updated engineer
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date = ? AND rotation = ?');
      const overrides = overrideQuery.all('2025-08-04', 'PM') as OverrideRowWithTimestamp[];
      expect(overrides).toHaveLength(1);
      expect(overrides[0].engineer_email).toBe('bob@ghost.org');
    });
  });

  describe('Error Handling - Integration', () => {
    it('should return validation error for non-existent engineer', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-04',
        rotation: OncallRotationName.Core,
        engineer_email: 'nonexistent@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(false);
      expect(result.error_type).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('not found in database');

      // Verify no override was persisted
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date = ?');
      const overrides = overrideQuery.all('2025-08-04') as OverrideRowWithTimestamp[];
      const newOverrides = overrides.filter(
        (o: OverrideRowWithTimestamp) => o.engineer_email === 'nonexistent@ghost.org',
      );
      expect(newOverrides).toHaveLength(0);
    });

    it('should return validation error for engineer not qualified for rotation', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-04',
        rotation: OncallRotationName.AM, // Charlie is only qualified for PM, not AM
        engineer_email: 'charlie@ghost.org', // Charlie is not qualified for AM (only PM)
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(false);
      expect(result.error_type).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('not qualified for AM rotation');

      // Verify no override was persisted
      const overrideQuery = testDb.prepare(
        'SELECT * FROM oncall_schedule_overrides WHERE date = ? AND engineer_email = ?',
      );
      const override = overrideQuery.get('2025-08-04', 'charlie@ghost.org');
      expect(override).toBeFalsy();
    });

    it('should return validation error for past dates', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-07-30', // Past date
        end_date: '2025-07-30',
        rotation: OncallRotationName.Core,
        engineer_email: 'alice@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(false);
      expect(result.error_type).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('cannot be in the past');

      // Verify no override was persisted
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date = ?');
      const override = overrideQuery.get('2025-07-30');
      expect(override).toBeFalsy();
    });

    it('should return validation error for invalid date range', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-06',
        end_date: '2025-08-04', // End date before start date
        rotation: OncallRotationName.Core,
        engineer_email: 'alice@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(false);
      expect(result.error_type).toBe('VALIDATION_ERROR');
      expect(result.error).toContain('end_date must be on or after start_date');

      // Verify no override was persisted
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE engineer_email = ?');
      const overrides = overrideQuery.all('alice@ghost.org');
      expect(overrides).toHaveLength(0);
    });

    it('should return validation error for weekend-only date range', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-09', // Saturday
        end_date: '2025-08-10', // Sunday
        rotation: OncallRotationName.Core, // Use Core rotation since Alice is qualified for AM,PM (so Core too)
        engineer_email: 'alice@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      expect(result.success).toBe(false);
      expect(result.error_type).toBe('VALIDATION_ERROR');
      expect(result.error).toBe('No valid weekdays found in the specified date range');

      // Verify no override was persisted
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date IN (?, ?)');
      const overrides = overrideQuery.all('2025-08-09', '2025-08-10');
      expect(overrides).toHaveLength(0);
    });
  });

  describe('Database State Verification', () => {
    it('should maintain referential integrity between users and overrides', async () => {
      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-05',
        rotation: OncallRotationName.Core,
        engineer_email: 'alice@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);
      expect(result.success).toBe(true);

      // Query with JOIN to verify referential integrity
      const joinQuery = testDb.prepare(`
        SELECT o.*, u.name, u.rotation as user_rotations
        FROM oncall_schedule_overrides o
        JOIN users u ON o.engineer_email = u.email
        WHERE o.date IN ('2025-08-04', '2025-08-05') AND o.rotation = ?
      `);
      const joinedResults = joinQuery.all('Core') as JoinedRow[];

      expect(joinedResults).toHaveLength(2);
      expect(joinedResults.every((r: JoinedRow) => r.name === 'Alice Engineer')).toBe(true);
      expect(joinedResults.every((r: JoinedRow) => r.user_rotations === 'AM')).toBe(true);
    });

    it('should handle concurrent-like override operations correctly', async () => {
      // Simulate multiple overrides for different rotations on same date
      const overrideRequests: OverrideRotationAssignmentLambdaTask[] = [
        {
          task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
          start_date: '2025-08-04',
          end_date: '2025-08-04',
          rotation: OncallRotationName.AM,
          engineer_email: 'diana@ghost.org',
        },
        {
          task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
          start_date: '2025-08-04',
          end_date: '2025-08-04',
          rotation: OncallRotationName.Core,
          engineer_email: 'charlie@ghost.org',
        },
        {
          task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
          start_date: '2025-08-04',
          end_date: '2025-08-04',
          rotation: OncallRotationName.PM,
          engineer_email: 'bob@ghost.org',
        },
      ];

      // Execute all overrides
      const results = await Promise.all(overrideRequests.map((req) => overrideSchedule(req)));

      // All should succeed
      expect(results.every((r) => r.success)).toBe(true);

      // Verify all overrides were persisted correctly
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date = ? ORDER BY rotation');
      const overrides = overrideQuery.all('2025-08-04') as OverrideRowWithTimestamp[];
      expect(overrides).toHaveLength(3);

      const [amOverride, coreOverride, pmOverride] = overrides;
      expect(amOverride.rotation).toBe('AM');
      expect(amOverride.engineer_email).toBe('diana@ghost.org');
      expect(coreOverride.rotation).toBe('Core');
      expect(coreOverride.engineer_email).toBe('charlie@ghost.org');
      expect(pmOverride.rotation).toBe('PM');
      expect(pmOverride.engineer_email).toBe('bob@ghost.org');
    });
  });

  describe('Notification and External Integration Verification', () => {
    it('should successfully complete override even when notifications fail', async () => {
      // Mock notification failure
      const { postSlackMessage } = await import('../slack/slack.messages.js');
      vi.mocked(postSlackMessage).mockRejectedValueOnce(new Error('Slack API failure'));

      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-04',
        rotation: OncallRotationName.Core,
        engineer_email: 'charlie@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      // Override should still succeed despite notification failure
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully overridden 1 dates for Core rotation');

      // Verify override was persisted despite notification failure
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date = ? AND rotation = ?');
      const override = overrideQuery.get('2025-08-04', 'Core') as OverrideRowWithTimestamp;
      expect(override).toBeTruthy();
      expect(override.engineer_email).toBe('charlie@ghost.org');
    });

    it('should successfully complete override even when Notion sync fails', async () => {
      // Mock Notion sync failure
      const { NotionSyncService } = await import('../notion/notion.sync.service.js');
      const mockConstructor = vi.mocked(NotionSyncService);
      const mockInstance = mockConstructor.mock.results[0].value;
      mockInstance.syncDateRangeToNotion.mockRejectedValueOnce(new Error('Notion API failure'));

      const overrideRequest: OverrideRotationAssignmentLambdaTask = {
        task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT,
        start_date: '2025-08-04',
        end_date: '2025-08-04',
        rotation: OncallRotationName.AM,
        engineer_email: 'diana@ghost.org',
      };

      const result = await overrideSchedule(overrideRequest);

      // Override should still succeed despite Notion sync failure
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully overridden 1 dates for AM rotation');

      // Verify override was persisted despite Notion sync failure
      const overrideQuery = testDb.prepare('SELECT * FROM oncall_schedule_overrides WHERE date = ? AND rotation = ?');
      const override = overrideQuery.get('2025-08-04', 'AM') as OverrideRowWithTimestamp;
      expect(override).toBeTruthy();
      expect(override.engineer_email).toBe('diana@ghost.org');
    });
  });
});
