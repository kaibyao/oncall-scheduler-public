#!/usr/bin/env tsx

import 'dotenv/config';
import { repairDatabase, checkDatabaseHealth } from '../src/database/repair.js';
import { Logger } from '../src/logger.js';

const logger = new Logger('repair-script');

function main() {
  logger.info('=== SQLite Database Repair Tool ===');

  // First check if database appears to be corrupt
  logger.info('Checking database health...');
  const healthCheck = checkDatabaseHealth();

  if (healthCheck.healthy) {
    logger.info('✓ Database appears to be healthy. No repair needed.');
    logger.info('If you still want to force a repair, you can modify this script.');
    return;
  }

  logger.warn('⚠ Database health check failed:', healthCheck.error);
  logger.info('Proceeding with repair...');

  try {
    const result = repairDatabase();

    if (result.success) {
      logger.info('🎉 Database repair completed successfully!');

      if (result.backupPath) {
        logger.info(`📦 Backup created at: ${result.backupPath}`);
      }

      if (result.recoveredTables !== undefined) {
        logger.info(`📋 Tables recovered: ${result.recoveredTables}`);
      }

      if (result.recoveredRows !== undefined) {
        logger.info(`📊 Rows recovered: ${result.recoveredRows}`);
      }

      if (result.warnings && result.warnings.length > 0) {
        logger.warn('⚠ Warnings during repair:');
        result.warnings.forEach((warning) => logger.warn(`  - ${warning}`));
      }
    } else {
      logger.error('❌ Database repair failed!');

      if (result.errors && result.errors.length > 0) {
        logger.error('Errors encountered:');
        result.errors.forEach((error) => logger.error(`  - ${error}`));
      }

      if (result.backupPath) {
        logger.info(`📦 Original database backup is available at: ${result.backupPath}`);
      }

      process.exit(1);
    }
  } catch (error) {
    logger.error('💥 Unexpected error during repair:', error);
    process.exit(1);
  }
}

// Handle script arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  logger.info(`
SQLite Database Repair Tool

Usage: pnpm repair-db

This script will:
1. Check if the database appears to be corrupt
2. Create a backup of the current database
3. Use SQLite's recovery tool to extract recoverable data
4. Create a new database from the recovered data
5. Run migrations on the repaired database

Options:
  --help, -h    Show this help message

The original database will be backed up with today's date before any repair attempts.
`);
  process.exit(0);
}

// Run the repair
try {
  main();
} catch (error) {
  logger.error('Fatal error:', error);
  process.exit(1);
}
