import db from '../src/database/db.js';
import { Logger } from '../src/logger.js';
import { resetDatabase } from '../src/database/queries.js';
import { runMigrations } from '../src/database/migration-runner.js';
import { runSeedData } from '../src/database/seed-data-runner.js';

const logger = new Logger('SeedData');

export async function seedAllData(): Promise<void> {
  try {
    resetDatabase();
    seedNewData();
  } catch (error) {
    logger.error('Error during data seeding:', error);
    throw error;
  }
}

/**
 * Runs only new seed data files that haven't been applied yet.
 * Safe to run multiple times - uses tracking table to avoid re-execution.
 */
export function seedNewData() {
  try {
    logger.info('Starting incremental seed data process...');

    // Run migrations first to ensure seed_data_applied table exists
    runMigrations(db);

    // Run only new seed data files
    runSeedData(db);

    logger.info('Incremental seed data completed successfully');
  } catch (error) {
    logger.error('Error during incremental seed data:', error);
    throw error;
  }
}

// Allow running this script directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedAllData()
    .then(() => {
      logger.info('Seed data script completed');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Seed data script failed:', error);
      process.exit(1);
    });
}
