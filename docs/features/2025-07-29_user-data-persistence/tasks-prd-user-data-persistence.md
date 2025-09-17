# Tasks: User Data Persistence Feature

Based on analysis of the PRD and existing codebase architecture, these tasks implement a centralized user data persistence system that leverages existing database patterns and refactors current Slack/Notion integrations for improved performance.

## Relevant Files

- `migrations/004_create_users_table.sql` - New migration to create the users table schema
- `seed-data/003_seed_users_from_constants.sql` - Migration to populate users table from existing rotationEmails constant
- `src/database/entities.ts` - Add UserEntity interface following existing patterns
- `src/database/queries.ts` - Add user CRUD operations using existing query patterns
- `src/database/queries.test.ts` - Unit tests for new user database operations
- `src/schedule/schedule.generation.ts` - Refactor to use database queries instead of rotationEmails constant
- `src/schedule/schedule.generation.test.ts` - Update tests to use database-seeded users
- `src/slack/slack.users.ts` - Refactor to implement platform ID caching in users table
- `src/slack/slack.users.test.ts` - Update tests for new caching behavior
- `src/notion/notion.sync.service.ts` - Refactor to cache notion_person_id in users table
- `src/notion/notion.sync.service.test.ts` - Update tests for new caching behavior
- `src/constants.ts` - Remove rotationEmails constant after migration complete
- `scripts/seed-users-migration.ts` - Optional helper script for data migration

### Notes

- Leverages existing SQLite migration system and database query patterns
- Implements incremental refactoring to minimize breaking changes
- Uses existing test infrastructure with in-memory database support
- Focuses on reusing existing logic where possible rather than creating from scratch

## Tasks

- [x] 1.0 Create Database Schema and Foundation
  - [x] 1.1 Create `migrations/004_create_users_table.sql` with users table schema (email PRIMARY KEY, name, slack_user_id, notion_person_id, rotations, timestamps)
  - [x] 1.2 Add indexes on slack_user_id and notion_person_id columns for efficient reverse lookups
  - [x] 1.3 Run migration to create users table in development database
  - [x] 1.4 Verify table creation and schema matches PRD requirements

- [x] 2.0 Implement User Data Layer
  - [x] 2.1 Add `UserEntity` interface to `src/database/entities.ts` following existing patterns
  - [x] 2.2 Add `getUserByEmail(email: string)` function to `src/database/queries.ts`
  - [x] 2.3 Add `getUsersByRotation(rotation: OncallRotationName)` function to return array of users for a rotation
  - [x] 2.4 Add `updateUser(email: string, data: Partial<UserEntity>)` function for updating user fields
  - [x] 2.5 Add `upsertUser(user: Upsertable<UserEntity>)` function following existing upsert patterns
  - [x] 2.6 Create comprehensive unit tests for all user query functions in `src/database/queries.test.ts`

- [x] 3.0 Migrate Data from Constants to Database (Simplified SQL Approach)
  - [x] 3.1 Create `seed-data/003_seed_users_from_constants.sql` with INSERT statements for AM and PM rotation users only (ignore Core rotation)
  - [x] 3.2 Derive user names from email prefixes (e.g., "dave.cowart@company.com" → "Dave Cowart")
  - [x] 3.3 Set rotation field to "AM" or "PM" respectively, platform IDs to NULL initially
  - [x] 3.4 Execute seed process and verify 16 users inserted correctly (6 AM + 10 PM)
  - [x] 3.5 Validate data integrity and ensure no data loss during migration
  - [x] 3.6 Update task documentation to reflect simplified approach (completed)

- [x] 4.0 Refactor Schedule Generation Logic
  - [x] 4.1 Add `getAllUsers()` function to database queries for efficient user fetching
  - [x] 4.2 Modify `generateScheduleUsingSmartRoundRobin` to fetch all users once and cache them by rotation
  - [x] 4.3 Update Core rotation logic to be union of AM + PM users (Core = AM + PM combined)
  - [x] 4.4 Replace `rotationEmails[rotation]` usage with cached `usersByRotation[rotation]`
  - [x] 4.5 Update WORKLOAD_HISTORY_DAYS_BACK calculation to use cached user data instead of constants
  - [x] 4.6 Update `src/schedule/schedule.generation.test.ts` to seed test database with users instead of relying on constants
  - [x] 4.7 Run integration tests to verify schedule generation produces identical results
  - [x] 4.8 Update any snapshot tests if needed due to logic changes

- [x] 5.0 Implement Platform ID Caching for Slack and Notion
  - [x] 5.1 Refactor `getSlackUserIdByEmail` in `src/slack/slack.users.ts` to implement caching pattern (check DB first, then API, then update DB)
  - [x] 5.2 Update Slack integration tests to verify new caching behavior and database updates
  - [x] 5.3 Refactor Notion user lookup methods in `src/notion/notion.sync.service.ts` to use same caching pattern for notion_person_id
  - [x] 5.4 Update Notion integration tests to verify platform ID caching behavior
  - [x] 5.5 Add error handling for database failures during platform ID updates (log warnings, don't fail operations)
  - [x] 5.6 Remove `rotationEmails` constant from `src/constants.ts` and update dependent calculations
  - [x] 5.7 Search codebase for any remaining references to rotationEmails and remove them
  - [x] 5.8 Run full test suite to ensure no regressions from constant removal
