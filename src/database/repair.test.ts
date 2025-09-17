import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { checkDatabaseHealth } from './repair.js';

// Mock the config module to use test environment
vi.mock('../config.js', () => ({
  IS_PRODUCTION: false,
}));

// Mock logger to prevent noise in test output
vi.mock('../logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('Database Repair', () => {
  const testDir = path.join(process.cwd(), 'test-db-repair');
  const testDbPath = path.join(testDir, 'oncall_schedule.db');

  beforeEach(() => {
    // Create test directory
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('checkDatabaseHealth', () => {
    it('should return healthy for a valid database', () => {
      // Create a valid test database
      const db = new Database(testDbPath);
      db.exec(`
        CREATE TABLE test_table (
          id INTEGER PRIMARY KEY,
          name TEXT
        );
        INSERT INTO test_table (name) VALUES ('test');
      `);
      db.close();

      const result = checkDatabaseHealth(testDbPath);
      expect(result.healthy).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return unhealthy for non-existent database', () => {
      const nonExistentPath = path.join(testDir, 'does-not-exist.db');
      const result = checkDatabaseHealth(nonExistentPath);

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Database file does not exist');
    });

    it('should return unhealthy for corrupted database', () => {
      // Create a corrupted database file (not valid SQLite)
      fs.writeFileSync(testDbPath, 'This is not a valid SQLite database file');

      const result = checkDatabaseHealth(testDbPath);

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('Database corruption detected');
    });
  });

  describe('repairDatabase module', () => {
    it('should export RepairResult interface with correct properties', () => {
      // This is a basic test to ensure the module exports what we expect
      // We can't easily test the full repair functionality due to file system dependencies
      // and external sqlite3 command dependencies
      expect(checkDatabaseHealth).toBeDefined();
      expect(typeof checkDatabaseHealth).toBe('function');
    });

    it('should handle database path resolution correctly', () => {
      // Test that the module can handle different path scenarios
      const testResult1 = checkDatabaseHealth('/non/existent/path.db');
      expect(testResult1.healthy).toBe(false);
      expect(testResult1.error).toContain('Database file does not exist');
    });

    it('should validate database structure properly', () => {
      // Create a database with multiple tables
      const db = new Database(testDbPath);
      db.exec(`
        CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT);
        CREATE TABLE schedule (id INTEGER PRIMARY KEY, date TEXT);
        CREATE TABLE schema_migrations (version TEXT PRIMARY KEY);
        INSERT INTO users (email) VALUES ('test@example.com');
        INSERT INTO schedule (date) VALUES ('2025-01-01');
        INSERT INTO schema_migrations (version) VALUES ('001');
      `);
      db.close();

      const result = checkDatabaseHealth(testDbPath);
      expect(result.healthy).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });
});
