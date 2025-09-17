/**
 * Database utilities for testing
 * Provides functions to set up and tear down temporary SQLite databases for tests
 */

import Database from 'better-sqlite3';
import { Logger } from '../../src/logger.js';
import { runMigrations } from '../../src/database/migration-runner.js';
import type {
  OncallScheduleEntity,
  OncallScheduleOverrideEntity,
  UserEntity,
  Upsertable,
} from '../../src/database/entities.js';

const logger = new Logger('test-db');

// Store database instances for cleanup
const testDatabases = new Set<Database.Database>();

/**
 * Creates a new in-memory SQLite database for testing
 * @returns Database instance configured for testing
 */
export function createTestDatabase(): Database.Database {
  const db = new Database(':memory:');

  // Configure database for testing
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Track for cleanup
  testDatabases.add(db);

  logger.info('Created test database (in-memory)');
  return db;
}

/**
 * Runs all database migrations on a test database
 * Uses the shared migration logic from production
 * @param db - Database instance to run migrations on
 */
export function runTestMigrations(db: Database.Database): void {
  logger.info('Running test migrations...');
  runMigrations(db);
  logger.info('All test migrations completed');
}

/**
 * Creates a fully configured test database with migrations applied
 * @returns Database instance ready for testing
 */
export function createTestDatabaseWithMigrations(): Database.Database {
  const db = createTestDatabase();
  runTestMigrations(db);
  return db;
}

/**
 * Checks if a database connection is open
 * @param db - Database instance to check
 * @returns True if the database is open, false otherwise
 */
function isDatabaseOpen(db: Database.Database): boolean {
  try {
    // Try to execute a simple query to check if connection is open
    db.prepare('SELECT 1').get();
    return true;
  } catch {
    return false;
  }
}

/**
 * Closes and cleans up a test database
 * @param db - Database instance to cleanup
 */
export function cleanupTestDatabase(db?: Database.Database): void {
  if (db) {
    try {
      if (isDatabaseOpen(db)) {
        db.close();
        testDatabases.delete(db);
        logger.info('Cleaned up individual test database');
      } else {
        logger.info('Database already closed, removing from tracking');
        testDatabases.delete(db);
      }
    } catch (error) {
      logger.error('Error cleaning up test database:', error);
    }
  } else {
    // Cleanup all tracked databases
    let cleanedCount = 0;
    testDatabases.forEach((database) => {
      try {
        if (isDatabaseOpen(database)) {
          database.close();
          cleanedCount++;
        }
      } catch (error) {
        logger.error('Error cleaning up test database:', error);
      }
    });
    testDatabases.clear();
    logger.info(`Cleaned up ${cleanedCount} test databases`);
  }
}

/**
 * Sets up the global test database environment
 * Called once before all tests
 */
export async function setupTestDatabase(): Promise<void> {
  logger.info('Setting up global test database environment');
  // Any global setup can go here
}

/**
 * Helper function to seed test data into a database
 *
 * CRITICAL: User Rotation Data Requirements
 * - users.rotation MUST contain ONLY 'AM' or 'PM' (never 'Core')
 * - DO NOT assign engineers directly to 'Core' rotation
 * - AM engineers can work AM + Core shifts
 * - PM engineers can work PM + Core shifts
 *
 * ✅ CORRECT TEST DATA:
 * users: [
 *   { email: 'alice@ghost.org', rotation: 'AM' },  // Can work AM + Core
 *   { email: 'bob@ghost.org', rotation: 'PM' }     // Can work PM + Core
 * ]
 *
 * ❌ INCORRECT TEST DATA:
 * users: [
 *   { email: 'charlie@ghost.org', rotation: 'Core' },   // Invalid!
 *   { email: 'diana@ghost.org', rotation: 'AM,PM' }     // Invalid!
 * ]
 *
 * @param db - Database instance to seed
 * @param seedData - Object containing test data to insert
 */
export function seedTestData(
  db: Database.Database,
  seedData: {
    schedules?: Array<Upsertable<OncallScheduleEntity>>;
    overrides?: Array<Upsertable<OncallScheduleOverrideEntity>>;
    users?: Array<Upsertable<UserEntity>>;
  },
): void {
  if (!isDatabaseOpen(db)) {
    logger.error('Cannot seed data: database connection is not open');
    throw new Error('Database connection is not open');
  }

  logger.info('Seeding test data...');

  // Seed users data first (other tables reference users)
  if (seedData.users && seedData.users.length > 0) {
    const insertUser = db.prepare(`
      INSERT INTO users (email, name, slack_user_id, notion_person_id, rotation, pod)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        slack_user_id = EXCLUDED.slack_user_id,
        notion_person_id = EXCLUDED.notion_person_id,
        rotation = EXCLUDED.rotation,
        pod = EXCLUDED.pod,
        updated_at = CURRENT_TIMESTAMP
    `);

    const insertUsers = db.transaction((users) => {
      for (const user of users) {
        insertUser.run(user.email, user.name, user.slack_user_id, user.notion_person_id, user.rotation, user.pod);
      }
    });

    insertUsers(seedData.users);
    logger.info(`Inserted ${seedData.users.length} user records`);
  }

  // Seed oncall_schedule data
  if (seedData.schedules && seedData.schedules.length > 0) {
    const insertSchedule = db.prepare(`
      INSERT INTO oncall_schedule (date, rotation, engineer_email)
      VALUES (?, ?, ?)
    `);

    const insertSchedules = db.transaction((schedules) => {
      for (const schedule of schedules) {
        insertSchedule.run(schedule.date, schedule.rotation, schedule.engineer_email);
      }
    });

    insertSchedules(seedData.schedules);
    logger.info(`Inserted ${seedData.schedules.length} schedule records`);
  }

  // Seed oncall_schedule_overrides data
  if (seedData.overrides && seedData.overrides.length > 0) {
    const insertOverride = db.prepare(`
      INSERT INTO oncall_schedule_overrides (date, rotation, engineer_email)
      VALUES (?, ?, ?)
    `);

    const insertOverrides = db.transaction((overrides) => {
      for (const override of overrides) {
        insertOverride.run(override.date, override.rotation, override.engineer_email);
      }
    });

    insertOverrides(seedData.overrides);
    logger.info(`Inserted ${seedData.overrides.length} override records`);
  }

  logger.info('Test data seeding completed');
}

/**
 * Clears all data from test database tables
 * @param db - Database instance to clear
 */
export function clearTestData(db: Database.Database): void {
  if (!isDatabaseOpen(db)) {
    logger.error('Cannot clear data: database connection is not open');
    throw new Error('Database connection is not open');
  }

  logger.info('Clearing test data...');

  // Clear all tables in reverse dependency order
  db.exec('DELETE FROM oncall_schedule_overrides');
  db.exec('DELETE FROM oncall_schedule');

  logger.info('Test data cleared');
}
