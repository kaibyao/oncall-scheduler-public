/**
 * Database mocking utilities for tests
 * Provides a way to replace the production database with a test database
 */

import { vi } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDatabaseWithMigrations, cleanupTestDatabase } from './database.js';

/**
 * Mocks the database module to use a test database instead of the production one
 * @returns Object containing the mocked database instance and cleanup function
 */
export function mockDatabase() {
  const testDb = createTestDatabaseWithMigrations();

  // Mock the database module
  vi.doMock('../../src/database/db.js', () => ({
    default: testDb,
  }));

  return {
    db: testDb,
    cleanup: () => cleanupTestDatabase(testDb),
  };
}

/**
 * Creates a scoped database mock for a specific test or test suite
 * Use this in beforeEach/afterEach hooks for test isolation
 */
export function createScopedDatabaseMock() {
  let testDb: Database.Database | null = null;
  let originalMock: unknown = null;

  const setup = () => {
    testDb = createTestDatabaseWithMigrations();

    // Store the original mock if it exists
    originalMock = null; // Simplified for now

    // Mock the database module
    vi.doMock('../../src/database/db.js', () => ({
      default: testDb,
    }));

    return testDb;
  };

  const cleanup = () => {
    if (testDb) {
      cleanupTestDatabase(testDb);
      testDb = null;
    }

    // Restore original mock or unmock
    if (originalMock) {
      vi.doMock('../../src/database/db.js', originalMock);
    } else {
      vi.doUnmock('../../src/database/db.js');
    }
  };

  return { setup, cleanup };
}

/**
 * Utility function to run a test with a fresh database
 * @param testFn - Test function that receives the database instance
 */
export async function withTestDatabase<T>(testFn: (db: Database.Database) => Promise<T> | T): Promise<T> {
  const testDb = createTestDatabaseWithMigrations();

  try {
    return await testFn(testDb);
  } finally {
    cleanupTestDatabase(testDb);
  }
}
