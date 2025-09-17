/**
 * Integration tests for database operations
 * Tests the SQLite database setup, migrations, and basic operations
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createScopedDatabaseMock } from '../utils/mock-database.js';
import { seedTestData, clearTestData } from '../utils/database.js';
import { SAMPLE_SCHEDULE_DATA, SAMPLE_OVERRIDE_DATA } from '../fixtures/test-data.js';
import type Database from 'better-sqlite3';

describe('Database Integration Tests', () => {
  const { setup, cleanup } = createScopedDatabaseMock();
  let db: Database.Database;

  beforeEach(() => {
    db = setup();
  });

  afterEach(() => {
    // Clear data before cleanup to ensure clean state
    try {
      clearTestData(db);
    } catch {
      // Database might already be closed, that's ok
    }
    cleanup();
  });

  describe('Database Setup and Migrations', () => {
    it('should create database with proper schema', () => {
      // Test that migration tables exist
      const tables = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `,
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('schema_migrations');
      expect(tableNames).toContain('oncall_schedule');
      expect(tableNames).toContain('oncall_schedule_overrides');
      expect(tableNames).toContain('users');
    });

    it('should have proper indexes created', () => {
      const indexes = db
        .prepare(
          `
        SELECT name FROM sqlite_master
        WHERE type='index' AND name NOT LIKE 'sqlite_%'
        ORDER BY name
      `,
        )
        .all() as { name: string }[];

      const indexNames = indexes.map((i) => i.name);

      expect(indexNames).toContain('idx_oncall_schedule_engineer_email');
      expect(indexNames).toContain('idx_oncall_schedule_unique_date_rotation');
      expect(indexNames).toContain('idx_oncall_schedule_overrides_engineer_email');
      expect(indexNames).toContain('idx_oncall_schedule_overrides_unique_date_rotation');
      expect(indexNames).toContain('idx_users_slack_user_id');
      expect(indexNames).toContain('idx_users_notion_person_id');
      expect(indexNames).toContain('idx_users_rotation');
    });
  });

  describe('Schedule Data Operations', () => {
    beforeEach(() => {
      clearTestData(db);
    });

    it('should insert and retrieve schedule data', () => {
      // Seed test data
      seedTestData(db, { schedules: SAMPLE_SCHEDULE_DATA });

      // Query the data
      const schedules = db.prepare('SELECT * FROM oncall_schedule ORDER BY date, rotation').all();

      expect(schedules).toHaveLength(SAMPLE_SCHEDULE_DATA.length);
      expect(schedules[0]).toMatchObject({
        date: '2024-01-01',
        rotation: 'AM',
        engineer_email: SAMPLE_SCHEDULE_DATA[0].engineer_email,
      });
    });

    it('should enforce unique constraint on date and rotation', () => {
      // Insert first record
      db.prepare('INSERT INTO oncall_schedule (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
        '2024-01-01',
        'Core',
        'test@company.com',
      );

      // Try to insert duplicate date/rotation combo
      expect(() => {
        db.prepare('INSERT INTO oncall_schedule (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
          '2024-01-01',
          'Core',
          'another@company.com',
        );
      }).toThrow();
    });

    it('should allow querying by engineer email', () => {
      seedTestData(db, { schedules: SAMPLE_SCHEDULE_DATA });

      const engineerEmail = SAMPLE_SCHEDULE_DATA[0].engineer_email;
      const assignments = db
        .prepare('SELECT * FROM oncall_schedule WHERE engineer_email = ? ORDER BY date')
        .all(engineerEmail) as Array<{ engineer_email: string }>;

      expect(assignments.length).toBeGreaterThan(0);
      assignments.forEach((assignment) => {
        expect(assignment.engineer_email).toBe(engineerEmail);
      });
    });
  });

  describe('Override Data Operations', () => {
    beforeEach(() => {
      clearTestData(db);
    });

    it('should insert and retrieve override data', () => {
      seedTestData(db, { overrides: SAMPLE_OVERRIDE_DATA });

      const overrides = db.prepare('SELECT * FROM oncall_schedule_overrides ORDER BY date').all();

      expect(overrides).toHaveLength(SAMPLE_OVERRIDE_DATA.length);
      expect(overrides[0]).toMatchObject({
        date: '2024-01-03',
        rotation: 'Core',
        engineer_email: 'override.engineer@company.com',
      });
    });

    it('should enforce unique constraint on override date and rotation', () => {
      // Insert first override
      db.prepare('INSERT INTO oncall_schedule_overrides (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
        '2024-01-01',
        'Core',
        'test@company.com',
      );

      // Try to insert duplicate date/rotation combo
      expect(() => {
        db.prepare('INSERT INTO oncall_schedule_overrides (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
          '2024-01-01',
          'Core',
          'another@company.com',
        );
      }).toThrow();
    });
  });

  describe('Complex Queries', () => {
    beforeEach(() => {
      clearTestData(db);
      seedTestData(db, {
        schedules: SAMPLE_SCHEDULE_DATA,
        overrides: SAMPLE_OVERRIDE_DATA,
      });
    });

    it('should be able to join schedules with overrides', () => {
      const query = `
        SELECT
          s.date,
          s.rotation,
          s.engineer_email as scheduled_engineer,
          o.engineer_email as override_engineer
        FROM oncall_schedule s
        LEFT JOIN oncall_schedule_overrides o
          ON s.date = o.date AND s.rotation = o.rotation
        ORDER BY s.date, s.rotation
      `;

      const results = db.prepare(query).all() as Array<{ override_engineer: string | null }>;
      expect(results.length).toBeGreaterThan(0);

      // Should have some records with overrides
      const withOverrides = results.filter((r) => r.override_engineer !== null);
      expect(withOverrides.length).toBe(0); // No matching dates in our test data
    });

    it('should be able to count assignments per engineer', () => {
      const query = `
        SELECT
          engineer_email,
          COUNT(*) as assignment_count
        FROM oncall_schedule
        GROUP BY engineer_email
        ORDER BY assignment_count DESC
      `;

      const results = db.prepare(query).all() as { engineer_email: string; assignment_count: number }[];
      expect(results.length).toBeGreaterThan(0);

      results.forEach((result) => {
        expect(result.assignment_count).toBeGreaterThan(0);
        expect(typeof result.engineer_email).toBe('string');
      });
    });
  });

  describe('Database Performance', () => {
    it('should handle bulk inserts efficiently', () => {
      clearTestData(db);

      // Generate large dataset with unique date-rotation combinations
      const largeDataset = Array.from({ length: 1000 }, (_, i) => {
        const dayOffset = Math.floor(i / 3) + 1;
        const rotationIndex = i % 3;
        return {
          date: `2024-${String(Math.floor(dayOffset / 31) + 1).padStart(2, '0')}-${String((dayOffset % 31) + 1).padStart(2, '0')}`,
          rotation: ['AM', 'Core', 'PM'][rotationIndex],
          engineer_email: `engineer${i % 10}@company.com`,
        };
      });

      const startTime = Date.now();

      // Use transaction for bulk insert
      const insert = db.prepare('INSERT INTO oncall_schedule (date, rotation, engineer_email) VALUES (?, ?, ?)');
      const bulkInsert = db.transaction((schedules) => {
        for (const schedule of schedules) {
          insert.run(schedule.date, schedule.rotation, schedule.engineer_email);
        }
      });

      bulkInsert(largeDataset);

      const duration = Date.now() - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second

      // Verify data was inserted
      const count = db.prepare('SELECT COUNT(*) as count FROM oncall_schedule').get() as { count: number };
      expect(count.count).toBe(largeDataset.length);
    });
  });
});
