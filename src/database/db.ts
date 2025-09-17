import Database from 'better-sqlite3';
import fs from 'fs';
import { Logger } from '../logger.js';
import { getDatabasePath } from './getDatabasePath.js';

const logger = new Logger('db');

const dbPath = getDatabasePath();

logger.info('Connecting to database at: ', dbPath);
if (!fs.existsSync(dbPath)) {
  logger.info('Database file does not exist, creating...');
  fs.writeFileSync(dbPath, '');
  logger.info('Database file created at: ', dbPath);
} else {
  logger.info('Database file exists at: ', dbPath);
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;
