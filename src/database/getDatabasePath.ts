import path from 'path';
import { IS_PRODUCTION } from '../config.js';

export function getDatabasePath(): string {
  if (IS_PRODUCTION) {
    return '/mnt/efs/oncall_schedule.db';
  } else {
    // Use the same path as db.ts for consistency
    const __dirname = path.dirname(new URL(import.meta.url).pathname);
    return path.join(__dirname, '../../database/oncall_schedule.db');
  }
}
