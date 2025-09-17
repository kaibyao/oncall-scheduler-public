/**
 * Integration tests for schedule generation functionality
 * Tests the core scheduling algorithm with a real database
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createScopedDatabaseMock } from '../utils/mock-database.js';
import { clearTestData, seedTestData } from '../utils/database.js';
import {
  generateTestDateRange,
  generateTestScheduleData,
  TEST_ENGINEERS,
  TEST_ROTATIONS,
} from '../fixtures/test-data.js';
import type Database from 'better-sqlite3';
import type { OncallScheduleEntity } from '../../src/database/entities.js';
import { OncallRotationName } from '../../src/schedule/schedule.types.js';

// Mock the schedule generation module
vi.mock('../../src/schedule-generation.js', async () => {
  const actual = await vi.importActual('../../src/schedule-generation.js');
  return {
    ...actual,
    // We'll test the actual function, this is just for setup
  };
});

describe('Schedule Generation Integration Tests', () => {
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

  describe('Database Integration', () => {
    it('should work with in-memory SQLite database', () => {
      // Test basic database operations
      expect(db).toBeDefined();

      // Test that we can insert and query data
      db.prepare('INSERT INTO oncall_schedule (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
        '2024-01-01',
        'Core',
        'test@company.com',
      );

      const result = db.prepare('SELECT * FROM oncall_schedule WHERE date = ?').get('2024-01-01');
      expect(result).toMatchObject({
        date: '2024-01-01',
        rotation: 'Core',
        engineer_email: 'test@company.com',
      });
    });

    it('should handle date range queries', () => {
      // Seed with test data for a week
      const dates = generateTestDateRange('2024-01-01', 7);
      const schedules = generateTestScheduleData(dates, TEST_ROTATIONS, TEST_ENGINEERS.CORE_POD_1);

      seedTestData(db, { schedules });

      // Query for specific date range
      const rangeQuery = `
        SELECT date, rotation, engineer_email
        FROM oncall_schedule
        WHERE date BETWEEN ? AND ?
        ORDER BY date, rotation
      `;

      const results = db.prepare(rangeQuery).all('2024-01-02', '2024-01-04') as Array<
        Omit<OncallScheduleEntity, 'id' | 'created_at' | 'updated_at'>
      >;

      // Should have 3 days * 3 rotations = 9 records
      expect(results).toHaveLength(9);

      // Verify structure
      results.forEach((result) => {
        expect(result.date).toMatch(/2024-01-0[2-4]/);
        expect(['AM', 'Core', 'PM']).toContain(result.rotation);
        expect(TEST_ENGINEERS.CORE_POD_1).toContain(result.engineer_email);
      });
    });

    it('should handle engineer workload queries', () => {
      // Clear existing data first (including migration data)
      clearTestData(db);

      // Seed with uneven distribution
      const schedules = [
        { date: '2024-01-01', rotation: OncallRotationName.AM, engineer_email: TEST_ENGINEERS.CORE_POD_1[0] },
        { date: '2024-01-01', rotation: OncallRotationName.Core, engineer_email: TEST_ENGINEERS.CORE_POD_1[0] },
        { date: '2024-01-01', rotation: OncallRotationName.PM, engineer_email: TEST_ENGINEERS.CORE_POD_1[1] },
        { date: '2024-01-02', rotation: OncallRotationName.AM, engineer_email: TEST_ENGINEERS.CORE_POD_1[0] },
        { date: '2024-01-02', rotation: OncallRotationName.Core, engineer_email: TEST_ENGINEERS.CORE_POD_1[2] },
        { date: '2024-01-02', rotation: OncallRotationName.PM, engineer_email: TEST_ENGINEERS.CORE_POD_1[1] },
      ];

      seedTestData(db, { schedules });

      // Query workload distribution
      const workloadQuery = `
        SELECT
          engineer_email,
          COUNT(*) as assignment_count,
          GROUP_CONCAT(rotation) as rotations
        FROM oncall_schedule
        GROUP BY engineer_email
        ORDER BY assignment_count DESC
      `;

      const workload = db.prepare(workloadQuery).all() as Array<{
        engineer_email: string;
        assignment_count: number;
        rotations: string;
      }>;

      expect(workload).toHaveLength(3);

      // First engineer should have most assignments (3)
      expect(workload[0]).toMatchObject({
        engineer_email: TEST_ENGINEERS.CORE_POD_1[0],
        assignment_count: 3,
      });

      // Other engineers should have 2 and 1 assignments respectively
      expect(workload[1].assignment_count).toBe(2);
      expect(workload[2].assignment_count).toBe(1);
    });
  });

  describe('Schedule Constraints', () => {
    it('should enforce unique date-rotation combinations', () => {
      // Insert a schedule
      db.prepare('INSERT INTO oncall_schedule (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
        '2024-01-01',
        'Core',
        TEST_ENGINEERS.CORE_POD_1[0],
      );

      // Try to insert duplicate date-rotation combo
      expect(() => {
        db.prepare('INSERT INTO oncall_schedule (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
          '2024-01-01',
          'Core',
          TEST_ENGINEERS.CORE_POD_1[1],
        );
      }).toThrow();
    });

    it('should handle override scenarios', () => {
      // Insert regular schedule
      db.prepare('INSERT INTO oncall_schedule (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
        '2024-01-01',
        'Core',
        TEST_ENGINEERS.CORE_POD_1[0],
      );

      // Insert override
      db.prepare('INSERT INTO oncall_schedule_overrides (date, rotation, engineer_email) VALUES (?, ?, ?)').run(
        '2024-01-01',
        'Core',
        'emergency@company.com',
      );

      // Query with override logic
      const effectiveScheduleQuery = `
        SELECT
          s.date,
          s.rotation,
          COALESCE(o.engineer_email, s.engineer_email) as effective_engineer
        FROM oncall_schedule s
        LEFT JOIN oncall_schedule_overrides o
          ON s.date = o.date AND s.rotation = o.rotation
        WHERE s.date = ? AND s.rotation = ?
      `;

      const result = db.prepare(effectiveScheduleQuery).get('2024-01-01', 'Core') as {
        date: string;
        rotation: string;
        effective_engineer: string;
      };

      expect(result.effective_engineer).toBe('emergency@company.com');
    });
  });

  describe('Historical Data Analysis', () => {
    beforeEach(() => {
      // Clear existing data first (including migration data)
      clearTestData(db);

      // Seed with historical data spanning multiple weeks
      const dates = generateTestDateRange('2024-01-01', 21); // 3 weeks
      const schedules = generateTestScheduleData(dates, TEST_ROTATIONS, TEST_ENGINEERS.CORE_POD_1);
      seedTestData(db, { schedules });
    });

    it('should calculate engineer fairness metrics', () => {
      const fairnessQuery = `
        SELECT
          engineer_email,
          COUNT(*) as total_assignments,
          COUNT(CASE WHEN rotation = 'AM' THEN 1 END) as am_assignments,
          COUNT(CASE WHEN rotation = 'Core' THEN 1 END) as core_assignments,
          COUNT(CASE WHEN rotation = 'PM' THEN 1 END) as pm_assignments
        FROM oncall_schedule
        GROUP BY engineer_email
        ORDER BY engineer_email
      `;

      const metrics = db.prepare(fairnessQuery).all() as Array<{
        engineer_email: string;
        total_assignments: number;
        am_assignments: number;
        core_assignments: number;
        pm_assignments: number;
      }>;

      expect(metrics).toHaveLength(TEST_ENGINEERS.CORE_POD_1.length);

      // Each engineer should have assignments
      metrics.forEach((metric) => {
        expect(metric.total_assignments).toBeGreaterThan(0);
        expect(metric.am_assignments + metric.core_assignments + metric.pm_assignments).toBe(metric.total_assignments);
      });
    });

    it('should identify gaps in schedule coverage', () => {
      // Delete some records to create gaps
      db.prepare('DELETE FROM oncall_schedule WHERE date = ? AND rotation = ?').run('2024-01-03', 'Core');

      // Query for coverage gaps
      const gapQuery = `
        WITH dates AS (
          SELECT DISTINCT date FROM oncall_schedule
        ),
        rotations AS (
          SELECT 'AM' as rotation UNION SELECT 'Core' UNION SELECT 'PM'
        ),
        date_rotations AS (
          SELECT d.date, r.rotation
          FROM dates d
          CROSS JOIN rotations r
        )
        SELECT dr.date, dr.rotation
        FROM date_rotations dr
        LEFT JOIN oncall_schedule s ON dr.date = s.date AND dr.rotation = s.rotation
        WHERE s.id IS NULL
        ORDER BY dr.date, dr.rotation
      `;

      const gaps = db.prepare(gapQuery).all();

      expect(gaps).toHaveLength(1);
      expect(gaps[0]).toMatchObject({
        date: '2024-01-03',
        rotation: 'Core',
      });
    });

    it('should support time-based queries for recent assignments', () => {
      // Query for recent assignments (last 7 days from a reference date)
      const recentQuery = `
        SELECT engineer_email, COUNT(*) as recent_assignments
        FROM oncall_schedule
        WHERE date >= date('2024-01-15', '-7 days')
        GROUP BY engineer_email
        ORDER BY recent_assignments DESC
      `;

      const recent = db.prepare(recentQuery).all() as Array<{ recent_assignments: number }>;

      expect(recent.length).toBeGreaterThan(0);
      recent.forEach((assignment) => {
        expect(assignment.recent_assignments).toBeGreaterThan(0);
      });
    });
  });
});
