import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { Logger } from '../logger.js';

const logger = new Logger('seed-data-runner');

/**
 * Runs seed data files from the seed-data directory, tracking which files have been applied
 * to avoid re-executing them. Similar to migration runner but for seed data.
 */
export function runSeedData(db: Database.Database, seedDataPath?: string): void {
  // Create seed data tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS seed_data_applied (
      name TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const seedDataDir = seedDataPath || path.join(process.cwd(), 'seed-data');

  // Get all .sql files from seed-data directory
  const seedFiles = fs
    .readdirSync(seedDataDir)
    .filter((file) => file.endsWith('.sql'))
    .sort(); // Ensure consistent ordering

  const appliedSeedData = new Set(
    (db.prepare('SELECT name FROM seed_data_applied').all() as { name: string }[]).map((row) => row.name),
  );

  logger.info(`Seed data already applied`, { appliedSeedData });

  logger.info(`Found ${seedFiles.length} seed data files`);

  for (const file of seedFiles) {
    const name = path.basename(file, '.sql');

    if (appliedSeedData.has(name)) {
      logger.info(`Skipping ${file} (already applied)`);
      continue;
    }

    logger.info(`Applying seed data: ${file}`);

    const seedFilePath = path.join(seedDataDir, file);
    const sql = fs.readFileSync(seedFilePath, 'utf8');

    try {
      // Execute the seed data in a transaction
      db.transaction(() => {
        db.exec(sql);
        db.prepare('INSERT INTO seed_data_applied (name) VALUES (?)').run(name);
      })();

      logger.info(`✓ Applied ${file}`);
    } catch (error) {
      logger.error(`✗ Failed to apply ${file}:`, error);
      throw error;
    }
  }

  logger.info('All seed data completed');
}
