import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../logger.js';
import Database from 'better-sqlite3';
import { getDatabasePath } from './getDatabasePath.js';

const logger = new Logger('db-repair');

export interface RepairResult {
  success: boolean;
  backupPath?: string;
  recoveredTables?: number;
  recoveredRows?: number;
  errors?: string[];
  warnings?: string[];
}

/**
 * Repairs a corrupt SQLite database using the SQLite recovery tool
 */
export function repairDatabase(): RepairResult {
  const dbPath = getDatabasePath();
  const result: RepairResult = {
    success: false,
    errors: [],
    warnings: [],
  };

  logger.info('Starting database repair process for:', dbPath);

  try {
    // Check if database file exists
    if (!fs.existsSync(dbPath)) {
      result.errors!.push('Database file does not exist');
      logger.error('Database file does not exist:', dbPath);
      return result;
    }

    // Create backup filename with today's date
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
    const backupPath = path.join(path.dirname(dbPath), `${today}_corrupt_db_before_repair.db`);
    result.backupPath = backupPath;

    logger.info('Creating backup at:', backupPath);

    // Step 1: Move the existing DB file to backup
    fs.copyFileSync(dbPath, backupPath);
    logger.info('✓ Database backed up successfully');

    // Step 2: Generate recovery SQL
    const recoveryPath = path.join(path.dirname(dbPath), 'recovery.sql');
    logger.info('Generating recovery SQL...');

    try {
      // Use sqlite3 .recover command to extract recoverable data
      const recoverCommand = `sqlite3 "${backupPath}" .recover`;
      const recoverySQL = execSync(recoverCommand, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large databases
      });

      // Write recovery SQL to file
      fs.writeFileSync(recoveryPath, recoverySQL);
      logger.info('✓ Recovery SQL generated');

      // Check if recovery SQL is not empty
      if (!recoverySQL.trim()) {
        result.warnings!.push('Recovery SQL is empty - database may be severely corrupted');
        logger.warn('Warning: Recovery SQL is empty');
      }
    } catch (error) {
      result.errors!.push(`Failed to generate recovery SQL: ${error}`);
      logger.error('Failed to generate recovery SQL:', error);
      return result;
    }

    // Step 3: Create new database from recovery SQL
    logger.info('Creating new database from recovery SQL...');

    try {
      // Remove the original corrupted database
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }

      // Create new database by running recovery SQL
      const restoreCommand = `sqlite3 "${dbPath}" < "${recoveryPath}"`;
      execSync(restoreCommand, {
        encoding: 'utf8',
        stdio: 'pipe', // Suppress output
      });

      logger.info('✓ New database created from recovery SQL');
    } catch (error) {
      result.errors!.push(`Failed to restore database: ${error}`);
      logger.error('Failed to restore database:', error);

      // Try to restore backup if restoration failed
      if (fs.existsSync(backupPath)) {
        logger.info('Attempting to restore from backup...');
        fs.copyFileSync(backupPath, dbPath);
        result.warnings!.push('Restoration failed, original database restored from backup');
      }

      return result;
    }

    // Step 4: Validate the recovered database
    logger.info('Validating recovered database...');

    try {
      const recoveredDb = new Database(dbPath, { readonly: true });

      // Check if essential tables exist
      const tables = recoveredDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
        name: string;
      }[];
      const tableNames = tables.map((t) => t.name);

      result.recoveredTables = tables.length;
      logger.info(`✓ Recovered ${tables.length} tables:`, tableNames.join(', '));

      // Count total rows across all tables
      let totalRows = 0;
      for (const table of tables) {
        if (table.name !== 'sqlite_sequence') {
          try {
            const count = recoveredDb.prepare(`SELECT COUNT(*) as count FROM "${table.name}"`).get() as {
              count: number;
            };
            totalRows += count.count;
          } catch (error) {
            logger.warn(`Could not count rows in table ${table.name}:`, error);
          }
        }
      }

      result.recoveredRows = totalRows;
      logger.info(`✓ Total recovered rows: ${totalRows}`);

      // Check for schema_migrations table (important for this application)
      if (!tableNames.includes('schema_migrations')) {
        result.warnings!.push('schema_migrations table not found - migrations may need to be re-run');
        logger.warn('Warning: schema_migrations table not found');
      }

      recoveredDb.close();
    } catch (error) {
      result.errors!.push(`Failed to validate recovered database: ${error}`);
      logger.error('Failed to validate recovered database:', error);
      return result;
    }

    // Step 5: Clean up temporary files
    try {
      if (fs.existsSync(recoveryPath)) {
        fs.unlinkSync(recoveryPath);
        logger.info('✓ Cleaned up temporary recovery file');
      }
    } catch (error) {
      result.warnings!.push(`Could not clean up temporary file: ${error}`);
      logger.warn('Could not clean up temporary file:', error);
    }

    result.success = true;
    logger.info('✓ Database repair completed successfully');

    return result;
  } catch (error) {
    result.errors!.push(`Unexpected error during repair: ${error}`);
    logger.error('Unexpected error during repair:', error);
    return result;
  }
}

/**
 * Checks if the database appears to be corrupt by attempting basic operations
 */
export function checkDatabaseHealth(dbPath?: string): { healthy: boolean; error?: string } {
  const targetPath = dbPath || getDatabasePath();

  try {
    if (!fs.existsSync(targetPath)) {
      return { healthy: false, error: 'Database file does not exist' };
    }

    // Try to open database and perform a simple query
    const db = new Database(targetPath, { readonly: true });

    try {
      // Try to read sqlite_master table
      db.prepare("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1").get();
      db.close();
      return { healthy: true };
    } catch (error) {
      db.close();
      return { healthy: false, error: `Database corruption detected: ${error}` };
    }
  } catch (error) {
    return { healthy: false, error: `Cannot access database: ${error}` };
  }
}
