# Product Requirements Document: Schedule Override Feature

## Introduction/Overview

The Schedule Override feature allows authorized users to manually override on-call assignments for specific dates and rotations through AWS Lambda invocations. This feature addresses the need for flexibility in the on-call schedule when engineers have unexpected absences, planned time off, special circumstances requiring specific expertise, or when team members need to swap shifts. The system will persist these overrides in the database and regenerate the affected portions of the schedule to ensure consistency with Notion.

## Goals

1. Enable programmatic override of on-call assignments via Lambda events
2. Persist override information in the `oncall_schedule_overrides` table
3. Regenerate the schedule for affected dates to apply the override
4. Ensure overrides are properly synced to Notion as "Override Engineer" assignments
5. Notify affected engineers (both the newly assigned and the replaced engineer)
6. Maintain data integrity by validating all override requests

## User Stories

1. **As a team manager**, I want to override on-call assignments via API calls so that I can quickly adjust the schedule when engineers are unavailable.

2. **As an engineer being assigned**, I want to be notified when I'm assigned to an override shift so that I'm aware of my new on-call responsibilities.

3. **As an engineer being replaced**, I want to be notified when my shift is overridden so that I know I'm no longer on-call for that period.

4. **As a system administrator**, I want the override process to validate inputs so that invalid overrides don't corrupt the schedule.

## Functional Requirements

1. **The system must accept `OverrideRotationAssignmentLambdaTask` events** containing:
   - `start_date`: Beginning date of the override period
   - `end_date`: End date of the override period (supporting multiple dates)
   - `rotation`: The rotation type (AM, Core, or PM)
   - `engineer_email`: Email of the engineer to assign

2. **The system must validate override requests** by:
   - Verifying the engineer exists in the users table
   - Checking that the engineer is qualified for the specified rotation type
   - Ensuring date ranges are valid (not in the past, within reasonable bounds)

3. **The system must persist overrides** by:
   - Inserting records into the `oncall_schedule_overrides` table using the `upsertOverrides` function
   - Creating one record per date within the date range for the specified rotation

4. **The system must regenerate the schedule** by:
   - Regenerating only the affected date range (from start_date to end_date)
   - Ensuring the override takes precedence over the regular schedule
   - Triggering a Notion sync for the affected dates

5. **The system must handle notifications** by:
   - Notifying the engineer being assigned to the override
   - Notifying the engineer being replaced (if applicable)

6. **The system must prevent past date overrides** by:
   - Validating that the start_date is not before the current date
   - Returning an appropriate error message for past date attempts

## Non-Goals (Out of Scope)

1. **Bulk override operations across multiple rotations** - Each Lambda invocation handles one rotation type only
2. **Override history or audit trail** - The system will not maintain historical records of override changes
3. **Recurring overrides** - The system will not support patterns like "every Monday" overrides
4. **UI for creating overrides** - This implementation focuses only on Lambda event processing
5. **Override conflict resolution UI** - Conflicts will be handled by the upsert operation (last write wins)

## Design Considerations

- The existing `upsertOverrides` function handles conflicts using "ON CONFLICT DO UPDATE"
- The system already has logic to apply overrides when generating schedules
- Notion sync already handles displaying override assignments appropriately
- The Lambda handler infrastructure is already in place in `index.ts`

## Technical Considerations

1. **Integration Points**:
   - AWS Lambda handler already routes to `overrideSchedule` function
   - Database queries module provides `upsertOverrides` for persistence
   - Schedule generation system needs to be called for affected dates only

2. **Dependencies**:
   - Users must exist in the database before being assigned
   - Notion API must be available for syncing (if enabled)
   - Database migrations must be up to date

3. **Error Handling**:
   - Invalid engineer emails should return descriptive errors
   - Past date validations should prevent data corruption
   - Failed Notion syncs should not prevent override persistence

## Success Metrics

1. **User satisfaction** with the override process (ease of use, reliability)
2. **Reduction in manual interventions** needed to correct schedules
3. **System reliability** - percentage of successful override operations
4. **Response time** - time to process override requests and update Notion

## Open Questions

1. Should we implement a dry-run mode for testing override requests?
2. What is the maximum reasonable date range for a single override request?
3. Should we log override requests for future audit trail implementation?
4. How should the system handle overrides that span non-working days (weekends)?
