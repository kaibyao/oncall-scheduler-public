/**
 * Database migration runner - isolated from the main database instance
 * This module contains the core migration logic that can be used with any database instance
 */

import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import { Logger } from '../logger.js';

const logger = new Logger('migration-runner');

/**
 * Runs all database migrations on the provided database instance
 * @param db - Database instance to run migrations on
 * @param migrationsPath - Optional path to migrations directory (defaults to 'migrations' in cwd)
 */
export function runMigrations(db: Database.Database, migrationsPath?: string): void {
  // Create migrations tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const migrationsDir = migrationsPath || path.join(process.cwd(), 'migrations');

  // Get all .sql files from migrations directory
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort(); // Ensure consistent ordering

  const appliedMigrations = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as { version: string }[]).map((row) => row.version),
  );

  logger.info(`Found ${migrationFiles.length} migration files`);

  for (const file of migrationFiles) {
    const version = path.basename(file, '.sql');

    if (appliedMigrations.has(version)) {
      logger.info(`Skipping ${file} (already applied)`);
      continue;
    }

    logger.info(`Applying migration: ${file}`);

    const migrationPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    try {
      // Execute the migration in a transaction
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO schema_migrations (version) VALUES (?)').run(version);
      })();

      logger.info(`✓ Applied ${file}`);
    } catch (error) {
      logger.error(`✗ Failed to apply ${file}:`, error);
      throw error;
    }
  }

  logger.info('All migrations completed');
}
