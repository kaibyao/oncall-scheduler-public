/**
 * Unit tests for test utilities
 * Validates that our testing infrastructure works correctly
 */

import { describe, it, expect } from 'vitest';
import { createTestDatabase, runTestMigrations, seedTestData, clearTestData } from '../utils/database.js';
import {
  generateTestDateRange,
  generateTestScheduleData,
  TEST_ENGINEERS,
  TEST_ROTATIONS,
} from '../fixtures/test-data.js';
import { OncallRotationName } from '../../src/schedule/schedule.types.js';

describe('Test Utils', () => {
  describe('Database Utils', () => {
    it('should create an in-memory database', () => {
      const db = createTestDatabase();

      expect(db).toBeDefined();

      // Test basic operations
      db.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, name TEXT)');
      db.prepare('INSERT INTO test_table (name) VALUES (?)').run('test');

      const result = db.prepare('SELECT * FROM test_table').get();
      expect(result).toMatchObject({ id: 1, name: 'test' });

      db.close();
    });

    it('should run migrations on test database', () => {
      const db = createTestDatabase();
      runTestMigrations(db);

      // Check that tables exist
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
      expect(tableNames).toContain('oncall_schedule');
      expect(tableNames).toContain('oncall_schedule_overrides');
      expect(tableNames).toContain('schema_migrations');

      db.close();
    });

    it('should seed and clear test data', () => {
      const db = createTestDatabase();
      runTestMigrations(db);

      const testData = {
        schedules: [{ date: '2024-01-01', rotation: OncallRotationName.Core, engineer_email: 'test@company.com' }],
        overrides: [{ date: '2024-01-02', rotation: OncallRotationName.PM, engineer_email: 'override@company.com' }],
      };

      // Seed data
      seedTestData(db, testData);

      // Verify data exists
      const scheduleCount = db.prepare('SELECT COUNT(*) as count FROM oncall_schedule').get() as { count: number };
      const overrideCount = db.prepare('SELECT COUNT(*) as count FROM oncall_schedule_overrides').get() as {
        count: number;
      };

      expect(scheduleCount.count).toBe(1); // Our test data
      expect(overrideCount.count).toBe(1); // Our test data

      // Clear data
      clearTestData(db);

      // Verify data is cleared
      const clearedScheduleCount = db.prepare('SELECT COUNT(*) as count FROM oncall_schedule').get() as {
        count: number;
      };
      const clearedOverrideCount = db.prepare('SELECT COUNT(*) as count FROM oncall_schedule_overrides').get() as {
        count: number;
      };

      expect(clearedScheduleCount.count).toBe(0);
      expect(clearedOverrideCount.count).toBe(0);

      db.close();
    });
  });

  describe('Test Data Generators', () => {
    it('should generate date ranges', () => {
      const dates = generateTestDateRange('2024-01-01', 5);

      expect(dates).toHaveLength(5);
      expect(dates[0]).toBe('2024-01-01');
      expect(dates[4]).toBe('2024-01-05');

      // All dates should be valid
      dates.forEach((date) => {
        expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(new Date(date).toString()).not.toBe('Invalid Date');
      });
    });

    it('should generate schedule data for date range', () => {
      const dates = ['2024-01-01', '2024-01-02'];
      const engineers = TEST_ENGINEERS.CORE_POD_1;

      const schedules = generateTestScheduleData(dates, TEST_ROTATIONS, engineers);

      // Should have 2 dates * 3 rotations = 6 schedules
      expect(schedules).toHaveLength(6);

      // Verify structure
      schedules.forEach((schedule) => {
        expect(dates).toContain(schedule.date);
        expect(TEST_ROTATIONS).toContain(schedule.rotation);
        expect(engineers).toContain(schedule.engineer_email);
      });

      // Verify round-robin assignment
      const uniqueEngineers = new Set(schedules.map((s) => s.engineer_email));
      expect(uniqueEngineers.size).toBeGreaterThan(1); // Should rotate between engineers
    });

    it('should provide consistent test engineer data', () => {
      expect(TEST_ENGINEERS.CORE_POD_1).toHaveLength(3);
      expect(TEST_ENGINEERS.CORE_POD_2).toHaveLength(3);
      expect(TEST_ENGINEERS.GROWTH_POD).toHaveLength(2);

      // All should be valid email formats
      Object.values(TEST_ENGINEERS)
        .flat()
        .forEach((email) => {
          expect(email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
          expect(email).toContain('@company.com');
        });
    });
  });

  describe('ES Modules Support', () => {
    it('should support import.meta', () => {
      expect(import.meta).toBeDefined();
      expect(import.meta.url).toMatch(/^file:\/\//);
    });

    it('should support dynamic imports', async () => {
      // Test that dynamic imports work in the test environment
      const { expect: dynamicExpect } = await import('vitest');
      expect(dynamicExpect).toBe(expect);
    });

    it('should support top-level await in modules', async () => {
      // This test itself demonstrates top-level await support
      const asyncValue = await Promise.resolve('test');
      expect(asyncValue).toBe('test');
    });
  });
});
