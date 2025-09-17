import db from './db.js';
import type { OncallScheduleEntity, OncallScheduleOverrideEntity, UserEntity, Upsertable } from './entities.js';
import type {
  EngineerRotationAssignment,
  EngineerRotationHours,
  OncallRotationName,
} from '../schedule/schedule.types.js';
import { Logger } from '../logger.js';
import { runMigrations } from './migration-runner.js';

const logger = new Logger('queries');

/** Returns the last date that an oncall rotation was scheduled. */
export async function getLastScheduledOncallDay(): Promise<OncallScheduleEntity | null> {
  const query = await db.prepare(`
    SELECT * FROM oncall_schedule
    ORDER BY date DESC
    LIMIT 1
  `);
  const results = (await query.get()) as OncallScheduleEntity | undefined;
  return results ?? null;
}

/** Save a generated schedule to the database. */
export async function saveSchedule(schedule: Upsertable<OncallScheduleEntity>[]): Promise<void> {
  if (schedule.length === 0) {
    logger.warn('No schedule entries to save');
    return;
  }

  // Insert all schedule entries
  for (const scheduleEntry of schedule) {
    const query = db.prepare(`
        INSERT INTO oncall_schedule (date, rotation, engineer_email) VALUES (
          ?, ?, ?
        )
        ON CONFLICT (date, rotation) DO UPDATE SET
          engineer_email = EXCLUDED.engineer_email
      `);
    query.run(scheduleEntry.date, scheduleEntry.rotation, scheduleEntry.engineer_email);
  }
}

/** Get workload history for the past N days to help with fair distribution. */
export function getWorkloadHistory(daysBack: number): EngineerRotationAssignment[] {
  /*service='oncall.data',function='getWorkloadHistory'*/

  const query = db.prepare(`
    SELECT
      os.date,
      os.rotation,
      os.engineer_email,
      COALESCE(u.name, os.engineer_email) as engineer_name
    FROM oncall_schedule os
    LEFT JOIN users u ON os.engineer_email = u.email
    WHERE os.date >= date('now', '-' || ? || ' days')
    ORDER BY os.date DESC
  `);

  return query.all(daysBack) as EngineerRotationAssignment[];
}

/** Get the total hours worked by each engineer for each rotation in the past N days. */
export function getWorkloadHistoryHoursByEngineerRotation(daysBack: number): EngineerRotationHours[] {
  const query = db.prepare(`
    WITH oncall_schedule_with_hours AS (
      SELECT
        *,
        CASE
          WHEN rotation = 'AM' THEN 3
          WHEN rotation = 'Core' THEN 6
          WHEN rotation = 'PM' THEN 3
        END AS hours
      FROM oncall_schedule
      WHERE date >= date('now', '-' || ? || ' days')
    )
    SELECT
      engineer_email,
      rotation,
      SUM(hours) as total_hours
    FROM
      oncall_schedule_with_hours
    GROUP BY
      engineer_email,
      rotation
    ORDER BY
      SUM(hours)
  `);

  return query.all(daysBack) as EngineerRotationHours[];
}

/** Get the current assignments for the next 7 days. */
export function getCurrentAssignments(): EngineerRotationAssignment[] {
  const query = db.prepare(`
    SELECT
      date,
      rotation,
      engineer_email
    FROM
      oncall_schedule
    WHERE
      date >= date('now')
      AND date < date('now', '+7 days')
    ORDER BY date ASC
  `);

  return query.all() as EngineerRotationAssignment[];
}

/** Get the current overrides for the next 7 days. */
export function getCurrentOverrides(): EngineerRotationAssignment[] {
  const query = db.prepare(`
      SELECT
        oso.date,
        oso.rotation,
        oso.engineer_email,
        COALESCE(u.name, oso.engineer_email) as engineer_name
      FROM
        oncall_schedule_overrides oso
        LEFT JOIN users u ON oso.engineer_email = u.email
      WHERE
        oso.date >= date('now')
        AND oso.date < date('now', '+7 days')
      ORDER BY oso.date ASC
    `);

  return query.all() as EngineerRotationAssignment[];
}

/**
 * Gets all schedule overrides regardless of date
 */
export function getAllOverrides(): EngineerRotationAssignment[] {
  const query = db.prepare(`
      SELECT
        oso.date,
        oso.rotation,
        oso.engineer_email,
        COALESCE(u.name, oso.engineer_email) as engineer_name
      FROM
        oncall_schedule_overrides oso
        LEFT JOIN users u ON oso.engineer_email = u.email
      ORDER BY oso.date ASC
    `);

  return query.all() as EngineerRotationAssignment[];
}

/** Upsert an override for a given date and rotation. */
export async function upsertOverrides(overrides: Upsertable<OncallScheduleOverrideEntity>[]): Promise<void> {
  for (const overrideToUpsert of overrides) {
    const query = db.prepare(`
        INSERT INTO oncall_schedule_overrides (date, rotation, engineer_email) VALUES (
          ?, ?, ?
        )
        ON CONFLICT (date, rotation) DO UPDATE SET
          engineer_email = EXCLUDED.engineer_email
      `);

    query.run(overrideToUpsert.date, overrideToUpsert.rotation, overrideToUpsert.engineer_email);
  }
}

/** Delete an override for a given date and rotation. */
export async function deleteOverride({
  startDate,
  endDate,
  rotation,
}: {
  startDate: string;
  endDate: string;
  rotation: OncallRotationName;
}): Promise<void> {
  const query = db.prepare(`
      DELETE FROM oncall_schedule_overrides
      WHERE date >= ?
        AND date <= ?
        AND rotation = ?
    `);
  query.run(startDate, endDate, rotation);
}

/** Get a user by email address. */
export function getUserByEmail(email: string): UserEntity | null {
  const query = db.prepare(`
    SELECT * FROM users
    WHERE email = ?
  `);

  const result = query.get(email) as UserEntity | undefined;
  return result ?? null;
}

/** Get all users for a specific rotation. */
export function getUsersByRotation(rotation: OncallRotationName): UserEntity[] {
  const query = db.prepare(`
    SELECT * FROM users
    WHERE rotation = ?
  `);

  return query.all(rotation) as UserEntity[];
}

export function getAllUsers(): UserEntity[] {
  const query = db.prepare(`
    SELECT *
    FROM users
    ORDER BY email
  `);

  return query.all() as UserEntity[];
}

/** Update user fields. */
export function updateUser(email: string, data: Partial<UserEntity>): void {
  const updateFields: string[] = [];
  const values: (string | null)[] = [];

  // Build dynamic UPDATE query based on provided fields
  Object.entries(data).forEach(([key, value]) => {
    if (key !== 'email' && key !== 'created_at') {
      // Don't allow updating email or created_at
      updateFields.push(`${key} = ?`);
      values.push(value);
    }
  });

  if (updateFields.length === 0) {
    logger.warn('No valid fields to update for user', { email });
    return;
  }

  // Always update the updated_at timestamp
  updateFields.push('updated_at = CURRENT_TIMESTAMP');
  values.push(email); // Add email for WHERE clause

  const query = db.prepare(`
    UPDATE users
    SET ${updateFields.join(', ')}
    WHERE email = ?
  `);

  query.run(...values);
}

/** Upsert user (insert or update). */
export function upsertUser(user: Upsertable<UserEntity>): void {
  const query = db.prepare(`
    INSERT INTO users (email, name, slack_user_id, notion_person_id, rotation, pod)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT (email) DO UPDATE SET
      name = EXCLUDED.name,
      slack_user_id = EXCLUDED.slack_user_id,
      notion_person_id = EXCLUDED.notion_person_id,
      rotation = EXCLUDED.rotation,
      pod = EXCLUDED.pod,
      updated_at = CURRENT_TIMESTAMP
  `);

  query.run(user.email, user.name, user.slack_user_id, user.notion_person_id, user.rotation, user.pod);
}

export function findEngineersBeingReplaced(dates: string[], rotation: string): string[] {
  const placeholders = dates.map(() => '?').join(',');

  // First check if there are existing overrides for these dates/rotation
  const overrideQuery = db.prepare(`
    SELECT DISTINCT engineer_email, date
    FROM oncall_schedule_overrides
    WHERE date IN (${placeholders})
      AND rotation = ?
  `);

  const existingOverrides = overrideQuery.all(...dates, rotation) as { engineer_email: string; date: string }[];
  const overriddenDates = new Set(existingOverrides.map((o) => o.date));

  // For dates that already have overrides, use those engineers
  const replacedEngineers: string[] = existingOverrides.map((o) => o.engineer_email);

  // For dates without existing overrides, check the original schedule
  const remainingDates = dates.filter((date) => !overriddenDates.has(date));

  if (remainingDates.length > 0) {
    const remainingPlaceholders = remainingDates.map(() => '?').join(',');
    const scheduleQuery = db.prepare(`
      SELECT DISTINCT engineer_email
      FROM oncall_schedule
      WHERE date IN (${remainingPlaceholders})
        AND rotation = ?
    `);

    const scheduledEngineers = scheduleQuery.all(...remainingDates, rotation) as { engineer_email: string }[];
    replacedEngineers.push(...scheduledEngineers.map((s) => s.engineer_email));
  }

  // Return unique engineers being replaced
  return [...new Set(replacedEngineers)];
}

export function resetDatabase(): void {
  const dropOverridesQuery = db.prepare(`
    DROP TABLE IF EXISTS oncall_schedule_overrides;
  `);
  dropOverridesQuery.run();

  const dropScheduleQuery = db.prepare(`
    DROP TABLE IF EXISTS oncall_schedule;
  `);
  dropScheduleQuery.run();

  const dropUsersQuery = db.prepare(`
    DROP TABLE IF EXISTS users;
  `);
  dropUsersQuery.run();

  const dropMigrationsQuery = db.prepare(`
    DROP TABLE IF EXISTS schema_migrations;
  `);
  dropMigrationsQuery.run();

  const dropSeedDataAppliedQuery = db.prepare(`
    DROP TABLE IF EXISTS seed_data_applied;
  `);
  dropSeedDataAppliedQuery.run();

  runMigrations(db);
}
