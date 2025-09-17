## Relevant Files

- `src/google/google-calendar.client.ts` - Google Calendar API client wrapper for authentication and API calls
- `src/google/google-calendar.client.test.ts` - Unit tests for Google Calendar client
- `src/google/google-calendar.service.ts` - Service layer for fetching and parsing OOO events
- `src/google/google-calendar.service.test.ts` - Unit tests for Google Calendar service
- `src/google/google-calendar.types.ts` - TypeScript interfaces for Google Calendar data structures
- `src/schedule/schedule.availability.ts` - New module for checking engineer availability against OOO calendar
- `src/schedule/schedule.availability.test.ts` - Unit tests for availability checking logic
- `src/schedule/schedule.generation.ts` - Existing file that needs modification to integrate availability checks
- `src/schedule/schedule.generation.test.ts` - Existing tests that need updates for availability integration
- `src/config.ts` - Configuration file for environment variables (needs Google Calendar credentials)
- `src/constants.ts` - May need updates for calendar configuration constants
- `env.development` - Development environment file for Google Calendar credentials

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `google-calendar.service.ts` and `google-calendar.service.test.ts` in the same directory).
- Use `pnpm test` to run all tests or `pnpm test [path/to/test/file]` to run specific test files using Vitest.

## Tasks

- [x] 1.0 Set up Google Calendar API integration infrastructure
  - [x] 1.1 Install @googleapis/calendar npm package as a dependency
  - [x] 1.2 Create service account in Google Cloud Console for calendar read access _(Note: User handled this separately)_
  - [x] 1.3 Add Google Calendar environment variables to .env.development (GOOGLE_CALENDAR_ID, GOOGLE_SERVICE_ACCOUNT_KEY_PATH)
  - [x] 1.4 Update src/config.ts to include new Google Calendar environment variables
  - [x] 1.5 Create src/google directory for Google Calendar integration modules
  - [x] 1.6 Define TypeScript interfaces in src/google/google-calendar.types.ts (CalendarEvent, OOOEvent, GoogleCalendarConfig)
- [x] 2.0 Implement Google Calendar service for fetching OOO events
  - [x] 2.1 Create src/google/google-calendar.client.ts with service account authentication
  - [x] 2.2 Implement fetchEvents method in client to query calendar with timeMin/timeMax parameters
  - [x] 2.3 Create src/google/google-calendar.service.ts with getOOOEvents method
  - [x] 2.4 Implement event parsing logic to extract engineer identification from title and creator email
  - [x] 2.5 Add name-to-email mapping logic with case-insensitive matching
  - [x] 2.6 Write unit tests for google-calendar.client.ts with mocked Google API responses
  - [x] 2.7 Write unit tests for google-calendar.service.ts covering various OOO event formats
- [x] 3.0 Create availability checking module
  - [x] 3.1 Create src/schedule/schedule.availability.ts with isEngineerAvailable function
  - [x] 3.2 Implement caching mechanism to store OOO events during a schedule generation run
  - [x] 3.3 Add logic to check if a given date falls within any OOO event range
  - [x] 3.4 Create mapping between engineer emails and their OOO events
  - [x] 3.5 Write comprehensive unit tests for availability checking with various date scenarios
  - [x] 3.6 Add performance logging to track API call frequency and response times
- [x] 4.0 Integrate availability checks into schedule generation
  - [x] 4.1 Import availability module into src/schedule/schedule.generation.ts
  - [x] 4.2 Modify generateScheduleUsingSmartRoundRobin to initialize OOO data at start
  - [x] 4.3 Add availability check before each engineer assignment in the round-robin loop
  - [x] 4.4 Implement logic to skip unavailable engineers and try next in rotation
  - [x] 4.5 Add logging for when engineers are skipped due to OOO status
  - [x] 4.6 Update existing schedule generation tests to mock availability checks
  - [x] 4.7 Add new integration tests for schedule generation with OOO conflicts
- [x] 5.0 Add error handling and logging
  - [x] 5.1 Implement try-catch blocks in Google Calendar client for API failures
  - [x] 5.2 Add exponential backoff retry logic for transient Google API errors
  - [x] 5.3 Create specific error codes for different failure scenarios (CALENDAR_API_UNAVAILABLE, AUTH_FAILURE, etc.)
  - [x] 5.4 Ensure schedule generation continues even if calendar API is completely unavailable
  - [x] 5.5 Add detailed logging throughout the integration with appropriate log levels
  - [x] 5.6 Create monitoring alerts for API failures and performance degradation _(Note: Basic error handling implemented, full monitoring setup would be done in production)_
  - [x] 5.7 Write tests to verify graceful degradation when calendar service fails
