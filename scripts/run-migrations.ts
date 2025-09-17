import db from '../src/database/db.js';
import { runMigrations } from '../src/database/migration-runner.js';

runMigrations(db);
