/**
 * Global test setup file for Vitest
 * This file runs before all tests and sets up the testing environment
 */

import { beforeAll, afterAll } from 'vitest';
import { cleanupTestDatabase, setupTestDatabase } from './utils/database.js';

// Global setup - runs once before all tests
beforeAll(async () => {
  // Initialize test database
  await setupTestDatabase();
});

// Global cleanup - runs once after all tests
afterAll(async () => {
  // Cleanup test database
  await cleanupTestDatabase();
});
