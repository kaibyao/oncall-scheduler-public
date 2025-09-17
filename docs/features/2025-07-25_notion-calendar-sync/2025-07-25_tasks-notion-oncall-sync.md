## Relevant Files

- `package.json` - Add @notionhq/client dependency for Notion API integration.
- `src/notion/notion.client.ts` - Notion API client configuration and authentication setup.
- `src/notion/notion.client.test.ts` - Unit tests for Notion client configuration.
- `src/notion/notion.sync.ts` - Main sync service implementation with person lookup and database operations.
- `src/notion/notion.sync.test.ts` - Unit tests for Notion sync service.
- `src/notion/notion.types.ts` - TypeScript type definitions for Notion API integration.
- `src/notion/notion.types.test.ts` - Unit tests for Notion type definitions and transformations.
- `src/utils/schedule-data.ts` - Extracted schedule processing logic refactored from schedule-generation.ts.
- `src/utils/schedule-data.test.ts` - Unit tests for schedule data processing utilities.
- `src/utils/retry.ts` - Retry utility with exponential backoff for API calls.
- `src/utils/retry.test.ts` - Unit tests for retry utility.
- `src/index.ts` - Modified to integrate sync into main process flow.
- `src/schedule-generation.ts` - Refactored to use extracted utilities for reusability.
- `src/notion/notion.databases.ts` - Extended with sync configuration and database management.

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `notion.sync.ts` and `notion.sync.test.ts` in the same directory).
- Use `pnpm test` to run tests. Currently shows "Error: no test specified" so a testing framework will need to be set up.
- Follow existing TypeScript patterns with ES modules and `.js` import extensions.
- Maintain existing error handling and logging patterns using the Logger class.

## Tasks

- [x] 1.0 Set up Notion API Integration Infrastructure
  - [x] 1.1 Install @notionhq/client SDK dependency via `pnpm add @notionhq/client`
  - [x] 1.2 Install @types/node if not already present for Node.js types
  - [x] 1.3 Create `src/notion/notion.client.ts` with Notion client configuration using NOTION_API_TOKEN environment variable
  - [x] 1.4 Add Notion client initialization following existing patterns (similar to Slack client setup)
  - [x] 1.5 Create `src/notion/notion.types.ts` with TypeScript interfaces for Notion database properties (Date, Rotation, Person fields)
  - [x] 1.6 Add Notion page property types for the oncall schedule database schema
  - [x] 1.7 Add error handling types for Notion API responses and rate limiting
  - [x] 1.8 Create unit tests for notion.client.ts covering initialization and configuration
  - [x] 1.9 Create unit tests for notion.types.ts covering type transformations

- [x] 2.0 Refactor Schedule Generation for Reusability
  - [x] 2.1 Create `src/utils/schedule-data.ts` and extract schedule data processing logic from schedule-generation.ts
  - [x] 2.2 Extract function to combine schedule assignments with overrides (using getCurrentOverrides() from queries.ts)
  - [x] 2.3 Extract function to compute final engineer assignments (Override person if exists, else Original)
  - [x] 2.4 Extract function to format datetime ranges using existing rotation hours logic from utils.ts
  - [x] 2.5 Create function to get all schedule data using getWorkloadHistory(WORKLOAD_HISTORY_DAYS_BACK)
  - [x] 2.6 Add function to filter schedule data by date ranges (current vs past week)
  - [x] 2.7 Refactor schedule-generation.ts to use the extracted utilities instead of inline logic
  - [x] 2.8 Ensure backwards compatibility - existing schedule generation should work unchanged
  - [x] 2.9 Create comprehensive unit tests for schedule-data.ts covering all extracted functions
  - [x] 2.10 Add integration tests to verify schedule-generation.ts still works with refactored code

- [x] 3.0 Implement Notion Sync Service Core Logic
  - [x] 3.1 Create `src/notion/notion.sync.ts` with main NotionSyncService class
  - [x] 3.2 Implement email-to-person mapping using notion.users.list() with case-insensitive email matching
  - [x] 3.3 Add person lookup caching to reduce API calls (use Map or simple object cache)
  - [x] 3.4 Implement person lookup fallback - return email as text when person not found
  - [x] 3.5 Create `src/utils/retry.ts` with exponential backoff retry logic (2s, 4s, 8s, 16s delays)
  - [x] 3.6 Add retry wrapper for all Notion API calls with configurable max attempts
  - [x] 3.7 Add comprehensive error handling with logging using existing Logger patterns
  - [x] 3.8 Implement environment detection and database ID selection using existing notion.databases.ts
  - [x] 3.9 Create unit tests for NotionSyncService covering person lookup, caching, and error scenarios
  - [x] 3.10 Create unit tests for retry utility covering backoff timing and failure scenarios

- [x] 4.0 Implement Data Synchronization Operations
  - [x] 4.1 Add function to query existing Notion database entries using notion.databases.query()
  - [x] 4.2 Implement data comparison logic - match on date + rotation combination
  - [x] 4.3 Add function to transform local schedule data to Notion page properties format
  - [x] 4.4 Implement create operation for new Notion database entries using notion.pages.create()
  - [x] 4.5 Implement update operation for changed entries using notion.pages.update()
  - [x] 4.6 Implement delete operation for entries that no longer exist locally using notion.pages.update() with archived: true
  - [x] 4.7 Add batch operations support to group multiple Notion API calls for efficiency
  - [x] 4.8 Implement historical data management - identify past week entries (Monday-Friday of previous calendar week)
  - [x] 4.9 Add function to move past entries to PAST_CALENDAR database using existing getNotionDatabaseId(true)
  - [x] 4.10 Create comprehensive unit tests covering all CRUD operations and data transformations
  - [ ] 4.11 Add integration tests with mock Notion API responses

- [x] 5.0 Integrate Sync with Main Process
  - [x] 5.1 Modify `src/index.ts` to add sync call after successful schedule generation (after updateSlackWithScheduleChanges)
  - [x] 5.2 Add try-catch wrapper around sync operation with proper error logging
  - [x] 5.3 Ensure sync failures don't break main schedule generation process
  - [ ] 5.4 Update Lambda handler to include sync status in response body
  - [x] 5.5 Add NOTION_API_TOKEN environment variable validation in config
  - [x] 5.6 Extend existing notion.databases.ts with any additional configuration needed for sync
  - [x] 5.7 Add comprehensive logging for sync operations (start, progress, completion, errors)
  - [ ] 5.8 Implement performance monitoring - track sync duration and Notion API call counts
  - [ ] 5.9 Add dry-run mode for testing sync operations without making actual Notion changes
  - [ ] 5.10 Create integration tests for the full flow: schedule generation -> sync -> Notion update
  - [x] 5.11 Update existing error handling to include Notion-specific error scenarios
