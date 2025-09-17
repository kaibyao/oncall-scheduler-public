# Codebase Structure

## Root Level

- **src/**: Main source code directory
- **migrations/**: Database migration files
- **test/**: Test files with unit, integration, utils, and fixtures subdirectories
- **docs/**: Documentation with feature specifications and planning documents
- **scripts/**: Utility scripts (e.g., seed-data.ts)
- **seed-data/**: SQL files for database seeding
- **.github/**: GitHub workflows for CI/CD
- **package.json**: Project configuration and dependencies
- **tsconfig.json & tsconfig.build.json**: TypeScript configuration
- **vitest.config.ts**: Test configuration
- **eslint.config.js**: ESLint configuration
- **.prettierrc**: Prettier formatting rules
- **lefthook.yml**: Git hooks configuration
- **Dockerfile**: Container configuration

## Source Code Structure (`src/`)

### Core Files

- **index.ts**: Main entry point with Lambda handler and task routing
- **constants.ts**: Project constants (emails, timeframes, workload settings)
- **config.ts**: Environment configuration
- **logger.ts**: Centralized logging with Logger class
- **aws.types.ts**: AWS Lambda event types and task definitions

### Schedule Management (`src/schedule/`)

- **schedule.generation.ts**: Core scheduling algorithm with smart round-robin
- **schedule.types.ts**: TypeScript type definitions for scheduling
- **schedule.utils.ts**: Utility functions for schedule processing
- **schedule.overrides.ts**: Schedule override functionality
- **schedule.notifications.ts**: Slack notification handling
- **schedule.\*.test.ts**: Comprehensive test files with snapshots

### Database Layer (`src/database/`)

- **db.ts**: Database connection and setup
- **entities.ts**: Database entity definitions
- **queries.ts**: Database query functions
- **migration-runner.ts**: Migration management
- **oncall_schedule.db**: SQLite database file

### Slack Integration (`src/slack/`)

- **slack.client.ts**: Slack API client setup
- **slack.messages.ts**: Message handling
- **slack.canvas.ts**: Canvas operations
- **slack.channels.ts**: Channel management
- **slack.users.ts**: User operations
- **slack.user-groups.ts**: User group management

### Notion Integration (`src/notion/`)

- **notion.client.ts**: Notion API client setup
- **notion.types.ts**: Notion-specific type definitions
- **notion.databases.ts**: Database operations
- **notion.sync.ts**: Synchronization service
- **notion.\*.test.ts**: Test files for Notion functionality

### Utilities (`src/utils/`)

- **date.ts**: Date manipulation utilities
- **schedule-data.ts**: Schedule data processing utilities
- **retry.ts**: Retry mechanisms with exponential backoff
- **\*.test.ts**: Corresponding test files

## Key Patterns

- Clear separation of concerns with dedicated directories
- Database operations isolated in separate module
- Slack and Notion functionality modularized
- Comprehensive test coverage with unit and integration tests
- Type definitions distributed across relevant modules
- Constants and configuration centralized
- Utilities for common operations (date, retry, schedule data)
