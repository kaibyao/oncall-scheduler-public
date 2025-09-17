# PRD: Vacation Calendar Integration

## Introduction/Overview

The Who-You-Gonna-Call on-call scheduler currently generates schedules without considering engineer availability. Engineers use a dedicated Google Calendar to mark out-of-office (OOO) periods, but the scheduling algorithm doesn't check this calendar, potentially assigning on-call duties to unavailable engineers.

This feature integrates the existing vacation Google Calendar into the scheduling algorithm to automatically skip engineers who are out of office, ensuring that only available engineers are assigned to on-call rotations.

**Problem**: The scheduling system assigns on-call duties without checking engineer availability, leading to manual schedule adjustments when engineers are on vacation.

**Goal**: Automatically detect and skip engineers who are marked as out-of-office in the vacation calendar during schedule generation.

## Goals

1. **Prevent Invalid Assignments**: Never assign on-call duties to engineers who are marked as OOO
2. **Maintain Algorithm Integrity**: Preserve the smart round-robin algorithm's fairness while respecting availability
3. **Real-time Availability Checks**: Query the Google Calendar API during schedule generation for current OOO data
4. **Graceful Degradation**: Continue scheduling even if the calendar API is unavailable, with appropriate error logging
5. **Support Flexible OOO Formats**: Handle both single-day and multi-day OOO events

## User Stories

**As a scheduler administrator**, I want the system to automatically skip engineers on vacation so that I don't need to manually adjust schedules after generation.

**As an engineer**, I want my OOO calendar events to be respected by the scheduler so that I'm never assigned on-call duties while I'm away.

**As the scheduling algorithm**, I want to check engineer availability before assignment so that I can select the next available engineer in the rotation.

**As a system operator**, I want the scheduler to continue working even if the calendar is temporarily unavailable so that schedule generation isn't blocked by external service failures.

## Functional Requirements

### 1. Google Calendar API Integration

The system must integrate with Google Calendar API v3 to:

- Authenticate using a service account with read access to the vacation calendar
- Query calendar events within the scheduling window (14-day lookahead)
- Filter events by date range using `timeMin` and `timeMax` parameters
- Parse event data to extract engineer identification and OOO dates

### 2. Engineer Identification

The system must identify engineers from calendar events by:

- **Primary method**: Parse event title for pattern "<first name> OOO"
- **Fallback method**: Use event creator's email address if title parsing fails
- Map extracted identifiers (first name or email) to engineers in the system
- Handle name variations and maintain a clear audit trail of unmapped events

### 3. Availability Checking

The system must check engineer availability by:

- Creating an `isEngineerAvailable(email: string, date: Date)` function
- Querying OOO events for the specific date before each assignment
- Considering any OOO event on a date as making the engineer unavailable for all rotations that day
- Caching API responses within the scheduling run to minimize redundant calls

### 4. Schedule Generation Updates

The system must modify `generateScheduleUsingSmartRoundRobin()` to:

- Check each candidate engineer's availability before assignment
- Skip to the next engineer in rotation if current one is unavailable
- Maintain the rotation order and fairness metrics
- Log when engineers are skipped due to OOO status

### 5. Conflict Resolution

The system must handle post-generation conflicts by:

- Generating alerts when an engineer is newly marked as OOO after being scheduled
- Providing detailed conflict reports including affected dates and engineers
- Supporting manual intervention workflow for schedule adjustments
- Maintaining audit trail of all schedule modifications

### 6. Error Handling

The system must handle failures gracefully by:

- Continuing schedule generation if Calendar API is unavailable
- Logging specific error codes for troubleshooting (e.g., `CALENDAR_API_UNAVAILABLE`)
- Implementing exponential backoff for transient API failures
- Providing clear error messages in logs with context

### 7. Authentication

The system must authenticate with Google Calendar using:

- Service account credentials stored securely
- Appropriate OAuth scopes: `https://www.googleapis.com/auth/calendar.readonly`
- Environment-based credential management
- Automatic token refresh handling

## Non-Goals (Out of Scope)

1. **Creating or modifying calendar events** - The system will only read existing events
2. **Parsing complex event descriptions** - Only simple "<first name> OOO" format is supported
3. **Partial day availability** - Any OOO event disqualifies the entire day
4. **Historical OOO data import** - Only future events are considered
5. **Multi-calendar support** - Only one designated vacation calendar is checked
6. **Caching/pre-computation** - Availability is checked in real-time during generation
7. **Different leave types** - All OOO events are treated equally (vacation, sick leave, etc.)

## Technical Considerations

### API Integration

- Use `@googleapis/calendar` npm package for Node.js integration
- Implement service account authentication for server-to-server communication
- Set appropriate timeouts and retry logic for API calls
- Use `singleEvents: true` parameter to expand recurring events

### Performance

- Batch API requests where possible to reduce round trips
- Implement request queuing to respect API rate limits
- Consider pagination for large event lists
- Minimize API calls by querying date ranges rather than individual dates

### Data Mapping

- Maintain a mapping between calendar names and system emails
- Provide configuration for name variations (e.g., "John" vs "Johnny")
- Log unmapped events for manual review
- Support case-insensitive name matching

### Security

- Store service account credentials securely (environment variables or secret manager)
- Limit service account permissions to read-only calendar access
- Implement audit logging for all calendar queries
- Ensure no sensitive calendar data is exposed in logs

## Success Metrics

1. **Zero Invalid Assignments**: No engineers are scheduled while marked as OOO
2. **API Reliability**: Calendar API availability > 99.5% during schedule generation
3. **Performance Impact**: Schedule generation time increases by < 20%
4. **Mapping Success**: > 95% of OOO events are automatically mapped to engineers
5. **Error Recovery**: 100% of schedule generations complete even with API failures

## Open Questions

1. **Name Disambiguation**: How should the system handle multiple engineers with the same first name?
   - _Recommendation_: Log ambiguous events for manual review initially
2. **Grace Period**: Should there be a buffer period before/after OOO for travel days?
   - _Decision_: No buffer period in v1, can be added later if needed

3. **Notification Timeline**: How far in advance should conflict alerts be generated?
   - _Recommendation_: Generate alerts immediately when conflicts are detected

4. **Calendar Permissions**: Who manages service account access to the calendar?
   - _To be determined_: Coordinate with IT/Security team for credential management

5. **Performance Optimization**: Should we implement any caching strategy in the future?
   - _Future consideration_: Monitor API usage and implement if needed
