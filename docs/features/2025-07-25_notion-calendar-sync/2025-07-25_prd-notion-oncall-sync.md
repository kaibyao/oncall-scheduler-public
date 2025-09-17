# PRD: Notion Oncall Schedule Synchronization

## Introduction/Overview

This feature will synchronize the Who-You-Gonna-Call oncall schedule data to specific Notion databases per environment (prod + non-prod). The primary problem this solves is that stakeholders need visibility into oncall schedules outside the current system and require centralized schedule management across teams. The goal is to enable engineers to plan for being on call and improve schedule visibility through Notion integration.

## Goals

1. **Improve schedule visibility for stakeholders** - Engineering managers, engineers, and external stakeholders can access oncall schedules through Notion
2. **Reduce manual work in schedule management** - Automated synchronization eliminates manual data entry and reduces inconsistencies
3. **Enable engineers to plan for being on call** - Clear visibility into upcoming and historical oncall assignments
4. **Integrate with existing Notion workflows** - Leverage existing Notion usage patterns within the organization

## User Stories

1. **As an engineering manager**, I want to review oncall schedules in Notion so that I can understand team workload distribution and plan accordingly.
2. **As an engineer**, I want to check my upcoming oncall assignments in Notion so that I can plan my personal schedule around my responsibilities.
3. **As an external stakeholder** (support, product, etc.), I want read-only access to current oncall schedules so that I know who to contact for specific rotations.
4. **As a team lead**, I want to perform historical analysis of past schedules so that I can ensure fair rotation distribution over time.
5. **As an engineer**, I want to see override information clearly displayed so that I understand who is actually on call during schedule changes.

## Functional Requirements

### Database Schema & Mapping

1. **Date Property**: Contains datetime range with start and end times for each rotation
   - Source: `oncall_schedule.date` combined with rotation-specific start/end times
   - Format: Notion date property with start datetime and end datetime
   - Example: 2024-01-15 09:00 AM - 12:00 PM for AM rotation

2. **Rotation Property**: Displays the rotation type
   - Source: Direct mapping from `oncall_schedule.rotation` column
   - Values: AM, Core, PM (matching existing enum values)
   - Format: Notion select or text property

3. **Orig. Engineer Property**: The originally scheduled engineer
   - Source: `oncall_schedule.engineer_email` mapped to Notion person
   - Mapping: Dynamic lookup via Notion API `users.list()` to find person by email
   - Format: Notion person property

4. **Override Property**: The override engineer if applicable
   - Source: `oncall_schedule_overrides.engineer_email` mapped to Notion person
   - Mapping: Dynamic lookup via Notion API `users.list()` to find person by email
   - Format: Notion person property (empty if no override)

5. **Final Engineer Property**: The actual person on call
   - Logic: Override person if exists, otherwise Orig. Engineer
   - Display: Person name for easy identification
   - Format: Computed field or formula in Notion

### Synchronization Logic

6. **Sync Trigger**: Synchronization occurs as part of the schedule generation process
   - Integration point: Called after schedule generation completes successfully
   - Frequency: Whenever schedules are regenerated (typically daily)

7. **Data Consistency**: Compare local database vs Notion database entries
   - Process: Iterate through both local tables and Notion database
   - Comparison: Match on date + rotation combination
   - Actions: Create, update, or delete entries as needed

8. **Email-to-Person Mapping**: Dynamic lookup via Notion API
   - Method: Use `notion.users.list()` to get all workspace users
   - Matching: Compare email addresses (case-insensitive)
   - Caching: Consider implementing lookup cache to reduce API calls

9. **Mapping Failure Handling**: Display email as text when person lookup fails
   - Fallback: Show email address as plain text in a text property
   - Logging: Log failed mappings for administrative review

10. **Data Cleanup**: Delete Notion entries that don't exist in local database
    - Rule: Notion database is secondary to local SQLite database
    - Process: Remove entries that no longer have corresponding local records

11. **Error Handling**: Automatic retry with exponential backoff, then alert administrators
    - First attempt: Immediate retry on failure
    - Subsequent attempts: Exponential backoff (2s, 4s, 8s, 16s)
    - Final action: Log error and alert administrators if all retries fail

### Environment & Database Management

12. **Environment Separation**: Separate Notion databases for prod vs non-prod
    - Configuration: Use existing `notion.databases.ts` configuration
    - Database IDs: Different database IDs per environment
    - Same sync logic: Identical synchronization process for both environments

13. **Environment-Aware Logic**: Sync logic adapts based on environment
    - Detection: Use environment variables or configuration
    - Database selection: Choose appropriate database ID based on environment

14. **Historical Data Management**: Move past week entries to PAST CALENDAR database
    - Criteria: Entries from previous business week (Monday-Friday of calendar week before current)
    - Destination: Move to `PAST_CALENDAR` database as defined in `notion.databases.ts#L14`
    - Timing: Execute during each sync cycle

## Non-Goals (Out of Scope)

1. **Manual override editing directly in Notion** - Changes must be made in the source system
2. **Real-time synchronization** - Sync only occurs during schedule generation
3. **Support for non-business days** - Current calendar only includes weekdays
4. **Custom notification systems** - Beyond standard error alerting to administrators
5. **Bidirectional sync** - Notion is read-only representation of source data
6. **Historical schedule modification** - Past schedules remain immutable once moved

## Technical Considerations

### API Integration

- **SDK**: Use `@notionhq/client` JavaScript SDK for all Notion interactions
- **Authentication**: Use `NOTION_API_TOKEN` environment variable for authentication
- **Person Lookup**: Implement via `notion.users.list()` with email matching logic
- **Database Operations**: Support query, create, update, and delete operations on database pages
- **Rate Limiting**: Handle Notion API rate limits with appropriate backoff strategies
- **Pagination**: Handle paginated responses when querying large datasets

### Data Flow Architecture

```
Local SQLite DB (oncall_schedule + oncall_schedule_overrides)
    ↓
Schedule Generation Process
    ↓
Notion Sync Service
    ├── Query existing Notion entries
    ├── Compare with local data
    ├── Execute CRUD operations
    └── Move past entries to PAST_CALENDAR
```

### Code Integration Points

- **Database Layer**: Integrate with existing database queries in `database/` directory
- **Notion Configuration**: Extend `src/notion/notion.databases.ts` for database management
- **Environment Configuration**: Use existing environment variable patterns
- **Error Handling**: Integrate with existing logging infrastructure

### Performance Considerations

- **Batch Operations**: Group multiple database operations for efficiency
- **Incremental Sync**: Only sync changed entries when possible
- **Connection Pooling**: Reuse Notion client connections
- **Timeout Handling**: Implement reasonable timeouts for API calls

## Success Metrics

1. **Schedule sync completion rate**: Target 99%+ successful sync operations
2. **Time to sync completion**: Target under 2 minutes for full sync cycle
3. **Stakeholder usage**: Track engagement metrics for Notion database access
4. **Manual inquiry reduction**: Measure decrease in schedule-related questions to engineering teams
5. **Data accuracy**: 100% consistency between source database and Notion representation
6. **System reliability**: <1% failed sync operations requiring manual intervention

## Open Questions

1. **Caching Strategy**: Should we implement caching for person ID lookups to reduce API calls and improve performance?

2. **Timezone Handling**: How should we handle timezone differences between schedule data storage and Notion display preferences?

3. **Audit Logging**: Do we need comprehensive audit logging for sync operations to track changes and troubleshoot issues?

4. **Notification Preferences**: Should we implement configurable notification preferences for sync failures beyond basic administrator alerting?

5. **Rollback Mechanism**: Do we need the ability to rollback Notion changes if sync errors are detected after completion?

6. **Schema Evolution**: How should we handle future changes to the database schema or Notion property requirements?

---

## Implementation Notes

This PRD assumes integration with the existing Who-You-Gonna-Call codebase architecture, including:

- TypeScript with ES modules
- SQLite database with WAL mode
- Existing error handling and logging patterns
- Current environment variable configuration
- Smart round-robin scheduling algorithm integration

The implementation should follow existing code style conventions and maintain backward compatibility with current schedule generation processes.
