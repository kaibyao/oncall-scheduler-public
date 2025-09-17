import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runScheduleGeneration } from './schedule.generation.js';
import { createTestDatabaseWithMigrations, cleanupTestDatabase, seedTestData } from '../../test/utils/database.js';
import type Database from 'better-sqlite3';
import { DateTime } from 'luxon';
import type { OncallScheduleEntity } from '../database/entities.js';
import { OncallRotationName } from './schedule.types.js';

interface TableInfo {
  name: string;
}

// Mock external integrations to prevent actual API calls
vi.mock('./schedule.notifications.js', () => ({
  updateSlackWithScheduleChanges: vi.fn().mockResolvedValue(undefined),
}));

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
  })),
}));

// Store test database reference
let testDb: Database.Database;

// Mock the database module to use our test database
vi.mock('../database/db.js', () => ({
  default: new Proxy(
    {},
    {
      get(target, prop) {
        return testDb?.[prop as keyof Database.Database];
      },
    },
  ),
}));

describe('Schedule Generation (Characterization Tests)', () => {
  beforeEach(() => {
    // Create fresh test database for each test
    testDb = createTestDatabaseWithMigrations();

    // Seed user data for schedule generation
    const seedUsers = testDb.prepare(`
      INSERT INTO users (email, name, slack_user_id, notion_person_id, rotation, pod)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const users = [
      // AM rotation users
      ['alex@company.com', 'Alex Porras', null, null, 'AM', 'Swayze'],
      ['dave.cowart@company.com', 'Dave Cowart', null, null, 'AM', 'Blinky'],
      ['jason@company.com', 'Jason Sautieres', null, null, 'AM', 'Swayze'],
      ['jeffrey@company.com', 'Jeffrey Sun', null, null, 'AM', 'Zero'],
      ['jose.diaz@company.com', 'Jose Diaz', null, null, 'AM', 'Zero'],
      ['kai.yao@company.com', 'Kai Yao', null, null, 'AM', 'Blinky'],
      // PM rotation users
      ['bee.mcbride@company.com', 'Bee Mcbride', null, null, 'PM', 'Swayze'],
      ['cat.lee@company.com', 'Cat Lee', null, null, 'PM', 'Swayze'],
      ['eng.02@company.com', 'Engineer 2', null, null, 'PM', 'Zero'],
      ['frances.jurek@company.com', 'Frances Jurek', null, null, 'PM', 'Zero'],
      ['hamp.goodwin@company.com', 'Hamp Goodwin', null, null, 'PM', 'Blinky'],
      ['kelwen@company.com', 'Kelwen Peng', null, null, 'PM', 'Blinky'],
      ['manasa.tipparam@company.com', 'Manasa Tipparam', null, null, 'PM', 'Zero'],
      ['eng.03@company.com', 'Engineer 3', null, null, 'PM', 'Zero'],
      ['ryan.oillataguerre@company.com', 'Ryan Oillataguerre', null, null, 'PM', 'Blinky'],
      ['eng.01@company.com', 'Engineer 1', null, null, 'PM', 'Zero'],
    ];

    users.forEach((user) => seedUsers.run(...user));

    // Mock current time to make tests deterministic
    const mockDate = DateTime.fromISO('2025-07-26T12:00:00', { zone: 'America/Los_Angeles' });
    vi.useFakeTimers();
    vi.setSystemTime(mockDate.toJSDate());
  });

  afterEach(() => {
    cleanupTestDatabase(testDb);
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('runScheduleGeneration', () => {
    it('should complete the full generation workflow without errors', async () => {
      // Seed some historical data to make the algorithm more realistic
      seedTestData(testDb, {
        schedules: [
          {
            date: '2025-07-20',
            rotation: OncallRotationName.AM,
            engineer_email: 'engineer1@ghost.org',
          },
          {
            date: '2025-07-20',
            rotation: OncallRotationName.Core,
            engineer_email: 'engineer2@ghost.org',
          },
          {
            date: '2025-07-20',
            rotation: OncallRotationName.PM,
            engineer_email: 'engineer3@ghost.org',
          },
        ],
      });

      // This tests the integration of generation + notifications using real algorithm
      await expect(runScheduleGeneration()).resolves.not.toThrow();

      // Verify that notifications were attempted to be sent
      const { updateSlackWithScheduleChanges } = await import('./schedule.notifications.js');
      expect(updateSlackWithScheduleChanges).toHaveBeenCalledOnce();
    });

    it('should handle empty database state', async () => {
      // Test with no historical data - should still complete without errors
      await expect(runScheduleGeneration()).resolves.not.toThrow();

      // Verify that notifications were attempted to be sent even with empty state
      const { updateSlackWithScheduleChanges } = await import('./schedule.notifications.js');
      expect(updateSlackWithScheduleChanges).toHaveBeenCalled();
    });

    it('should capture current generation algorithm behavior in snapshot', async () => {
      // Seed consistent test data for reproducible results
      seedTestData(testDb, {
        schedules: [
          {
            date: '2025-07-20',
            rotation: OncallRotationName.AM,
            engineer_email: 'test1@ghost.org',
          },
          {
            date: '2025-07-21',
            rotation: OncallRotationName.Core,
            engineer_email: 'test2@ghost.org',
          },
          {
            date: '2025-07-22',
            rotation: OncallRotationName.PM,
            engineer_email: 'test3@ghost.org',
          },
        ],
      });

      await runScheduleGeneration();

      // Capture the complete schedule state to detect algorithm changes
      const generatedSchedule = testDb
        .prepare('SELECT date, rotation, engineer_email FROM oncall_schedule WHERE date > ? ORDER BY date, rotation')
        .all('2025-07-22'); // Only check newly generated entries

      // This snapshot will fail if the generation algorithm changes
      expect(generatedSchedule).toMatchSnapshot('generation-algorithm-baseline');
    });
  });

  describe('Database Integration', () => {
    it('should save generated schedule to database after running generation', async () => {
      await runScheduleGeneration();

      // Verify data was saved to database
      const savedSchedule = testDb.prepare('SELECT * FROM oncall_schedule ORDER BY date, rotation').all();

      expect(savedSchedule.length).toBeGreaterThan(0);

      // Each saved record should have the expected structure
      savedSchedule.forEach((record) => {
        expect(record).toHaveProperty('id');
        expect(record).toHaveProperty('date');
        expect(record).toHaveProperty('rotation');
        expect(record).toHaveProperty('engineer_email');
      });

      // Verify schedule extends into the future (14 day lookahead)
      const futureDates = (savedSchedule as OncallScheduleEntity[]).filter(
        (record) => new Date(record.date) > new Date('2025-07-26'),
      );
      expect(futureDates.length).toBeGreaterThan(0);
    });

    it('should use real database operations for characterization testing', async () => {
      // Verify we're using a real database with migrations
      const tables = testDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();

      expect((tables as TableInfo[]).map((t) => t.name)).toContain('oncall_schedule');
      expect((tables as TableInfo[]).map((t) => t.name)).toContain('oncall_schedule_overrides');

      // Run generation and verify real database interactions
      await runScheduleGeneration();

      // Check that actual data was inserted
      const scheduleCount = testDb.prepare('SELECT COUNT(*) as count FROM oncall_schedule').get() as { count: number };

      expect(scheduleCount.count).toBeGreaterThan(0);
    });
  });
});
