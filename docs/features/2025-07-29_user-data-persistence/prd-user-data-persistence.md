# PRD: User Data Persistence Feature

## Introduction/Overview

The Who-You-Gonna-Call on-call scheduler currently stores engineer information as hardcoded email arrays in the `rotationEmails` constant. This approach creates data silos and prevents the system from efficiently managing cross-platform user data (Slack IDs, Notion person IDs, names, etc.).

This feature introduces a centralized user data persistence system that stores all user information in a database table, enabling real-time synchronization with external platforms and supporting future feature development that requires comprehensive user profiles.

**Problem**: Current system has no central user data store, leading to repeated API calls to Slack/Notion for user information and inability to maintain consistent user profiles across platforms.

**Goal**: Create a centralized, persistent user data system that serves as the single source of truth for all user information while enabling real-time synchronization with external platforms.

## Goals

1. **Centralize User Data**: Replace hardcoded `rotationEmails` constant with a database-backed user management system
2. **Enable Cross-Platform Sync**: Store and automatically update Slack user IDs and Notion person IDs when interacting with those platforms
3. **Improve Performance**: Reduce redundant API calls by caching platform-specific user identifiers
4. **Support Future Features**: Provide a foundation for user-centric features like preferences, notifications, and reporting
5. **Maintain Data Consistency**: Ensure user data remains synchronized across all platforms with automatic conflict resolution

## User Stories

**As a system administrator**, I want user data to be centrally managed so that I can easily maintain engineer information without modifying code.

**As a developer**, I want to access complete user profiles through database queries so that I don't need to make repeated API calls to external platforms.

**As the scheduling system**, I want to automatically update user platform IDs when interacting with Slack/Notion so that user data stays current without manual intervention.

**As a future feature developer**, I want a comprehensive user data model so that I can build user-centric functionality on top of a solid foundation.

## Functional Requirements

### 1. Database Schema

The system must create a new `users` table with the following structure:

- `email` (TEXT, PRIMARY KEY, NOT NULL) - User's primary email address
- `name` (TEXT, NOT NULL) - User's full name
- `slack_user_id` (TEXT, NULLABLE) - User's Slack user ID
- `notion_person_id` (TEXT, NULLABLE) - User's Notion person ID
- `rotations` (TEXT, NOT NULL) - Rotation name assigned to the user (AM or PM, we are ignoring core, as it's just a combination of both rotations)
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)
- `updated_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

### 2. Data Migration

The system must provide a migration script that:

- Creates the `users` table using the existing migration system
- Seeds initial data from the `rotationEmails` constant
- Maps email addresses to their respective rotations (AM, Core, PM)
- Sets placeholder names (derived from email prefixes) until real names are obtained
- Maintains referential integrity with existing schedule data

### 3. Database Operations

The system must provide functions for:

- **Create**: Insert new user records
- **Read**: Query users by email, rotation, or platform ID
- **Update**: Modify user information including platform IDs
- **Delete**: Remove user records (with cascade considerations)

### 4. Real-time Platform Sync

The system must automatically update user platform IDs when:

- `getSlackUserIdByEmail()` successfully retrieves a Slack user ID
- Notion sync operations identify user person IDs
- Any other platform integration discovers user identifiers

### 5. Integration Points

The system must integrate with existing services:

- **Slack Integration**: Update `src/slack/slack.users.ts` to check/update database
- **Notion Integration**: Update `src/notion/notion.sync.service.ts` to check/update database
- **Schedule Generation**: Update to query user data from database instead of constants

### 6. Error Handling

The system must handle error conditions gracefully:

- Log warnings when platform IDs cannot be retrieved (don't fail operations)
- Handle database connection failures with appropriate fallbacks
- Manage data conflicts using last-updated-wins strategy

### 7. Data Validation

The system must validate:

- Email addresses follow valid email format
- Rotation values are valid OncallRotationName enum values
- Platform IDs are non-empty strings when provided
- Names are non-empty strings

## Non-Goals (Out of Scope)

1. **User Management UI**: No web interface or admin panel for user management
2. **Batch Synchronization**: No scheduled batch sync processes (only real-time sync)
3. **Multiple Email Support**: Each user has exactly one primary email address
4. **User Authentication**: No login/logout or user session management
5. **Advanced Reporting**: No analytics or reporting features on user data
6. **External API**: No REST API endpoints for external system integration
7. **Data Export/Import**: No bulk data transfer capabilities beyond initial migration

## Technical Considerations

### Database Integration

- Extend existing SQLite database using established migration patterns
- Follow existing entity/query structure in `src/database/`
- Use existing database connection and transaction patterns

### Migration Strategy

- Create new migration file following `00X_description.sql` naming pattern
- Parse existing `rotationEmails` constant to determine user-rotation mappings
- Handle potential duplicate emails across rotations appropriately
- Provide rollback capability

### Type Safety

- Create new `UserEntity` interface following existing patterns
- Update existing types to reference user data instead of email strings where appropriate
- Maintain backward compatibility during transition period

### Performance Considerations

- Index email column for fast lookups
- Consider adding indexes on slack_user_id and notion_person_id for reverse lookups
- Minimize database queries through efficient query patterns

### Conflict Resolution

- Implement last-updated-wins strategy for platform ID conflicts
- Use database timestamps to determine most recent updates
- Log conflicts for monitoring and debugging

## Success Metrics

1. **Data Consistency**: 100% of user records have valid email and name fields
2. **Platform Coverage**: >80% of active users have both Slack and Notion IDs populated within 30 days
3. **Performance**: Database queries complete in <10ms for single user lookups
4. **Error Rate**: <1% of platform sync operations result in errors or warnings
5. **Migration Success**: Zero data loss during migration from `rotationEmails` constant

## Open Questions

1. **Performance Monitoring**: What monitoring should be added to track sync performance and error rates?
2. **Data Retention**: Should we maintain audit logs of user data changes?
3. **Platform ID Validation**: Should we validate Slack/Notion IDs against their respective APIs?
4. **Rollback Strategy**: What happens if we need to revert to the `rotationEmails` constant?
5. **User Deactivation**: How should we handle users who leave the company or change roles?
