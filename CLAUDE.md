# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Who-You-Gonna-Call is a Ghost on-call scheduler that generates optimized on-call schedules using a smart round-robin algorithm. The system balances fairness, workload distribution, and operational constraints across three rotation types (AM, Core, PM) for Ghost engineering teams.

## Very important rules

- VERY IMPORTANT: NO BARREL IMPORTS! I do not want any other `index.ts` files whose sole purpose is to export other modules. This just opens up more ways to import modules and it leads to confusion.
- VERY IMPORTANT: When creating new types (using the `type`, `interface`, or `enum` keywords), check that those types don't already exist elsewhere in the codebase. Do a search for the properties you intend to write before actually creating a new type.
- VERY IMPORTANT: DO NOT USE THE `any` type unless there's no other option.

## Rotation System (CRITICAL UNDERSTANDING)

**VERY IMPORTANT**: This rotation logic has caused multiple bugs and test failures. Read carefully:

### Engineer Assignment Rules

- **Engineers can ONLY be assigned to AM or PM rotations** (never Core directly)
- Each engineer has a single `rotation` field containing either `'AM'` or `'PM'`
- **Core is NOT a direct engineer assignment** - it's a shift that can be filled by qualified engineers

### Rotation Qualification Logic

- **AM engineers** can work: AM shifts + Core shifts
- **PM engineers** can work: PM shifts + Core shifts
- **Core shifts** can be filled by ANY engineer (AM or PM qualified)

### Database Schema

- `users.rotation`: Contains `'AM'` or `'PM'` ONLY (never `'Core'`)
- `oncall_schedule.rotation`: Contains `'AM'`, `'Core'`, or `'PM'`
- `oncall_schedule_overrides.rotation`: Same as schedule table

### Test Data Requirements

```typescript
// ✅ CORRECT: Engineers have single rotation assignments
{ email: 'alice@ghost.org', rotation: 'AM' }     // Can work AM + Core
{ email: 'bob@ghost.org', rotation: 'PM' }       // Can work PM + Core

// ❌ WRONG: These will cause validation failures
{ email: 'charlie@ghost.org', rotation: 'Core' }     // Invalid - no direct Core assignment
{ email: 'diana@ghost.org', rotation: 'AM,PM' }      // Invalid - comma-separated values
```

### Common Mistakes to Avoid

1. **Test Data**: Never assign engineers directly to 'Core' rotation
2. **Validation**: Remember AM/PM engineers can override Core shifts
3. **Override Logic**: Core shifts have the largest pool of available engineers

## Key Commands

### Development

- `pnpm start` - Run in development mode
- `pnpm tsc` - Run TypeScript type checking without emitting files

### Code Quality

- `pnpm lint` - Run ESLint on TypeScript files
- `pnpm lint --fix` - Run ESLint with automatic fixes
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting without making changes

### Testing

- **Framework**: Vitest (not Jest)
- **Commands**:
  - `pnpm test` - Run all tests
  - `pnpm test:watch` - Run tests in watch mode
  - `pnpm test:ui` - Run tests with UI interface
  - `pnpm test:coverage` - Run tests with coverage report
- **Configuration**: `vitest.config.ts` with Node environment and ES modules support
- **Test Files**: `*.test.ts` files located alongside source code
- **Integration Tests**: Located in `test/integration/` directory

## Architecture

### Core Components

**Entry Point (index.ts)**

- Main scheduling logic using smart round-robin algorithm
- Generates optimized schedules for 14-day lookahead period
- Handles database migrations and historical data integration

**Scheduling Algorithm**

- Smart round-robin with workload balancing
- Constraint checking for fairness and operational requirements
- Historical data integration for long-term fairness
- Pod distribution and back-to-back assignment avoidance

**Database Layer (database/)**

- SQLite database with WAL mode for concurrent access
- Migration system for schema updates
- Historical assignment tracking and queries
- Entity definitions for schedule data

**Configuration (constants.ts)**

- Engineer assignments by rotation and pod
- Engineering manager data with name mappings and lookup functions
- Rotation time definitions (AM: 9-12, Core: 12-18, PM: 18-21)
- Schedule parameters (weekdays only, 14-day lookahead)

### Key Architecture Patterns

**Smart Round-Robin Approach**

- Uses workload-balanced algorithm with constraint checking
- Balances multiple objectives through historical data analysis
- Considers historical data to ensure long-term fairness

**Database Design**

- Simple SQLite schema with migrations
- Tracks historical assignments for fairness calculations
- Separate queries module for complex data operations

**Type Safety**

- Comprehensive TypeScript types for all entities
- Enum-based rotation and pod definitions
- Strict compiler settings with isolated modules

## Development Notes

- Uses ES modules with `.ts` extensions in imports
- No build output - runs TypeScript directly with Node.js
- Package manager: pnpm with workspace configuration
- Database file: `database/oncall_schedule.db`
- Schedule generates for weekdays only (Monday-Friday)
- Three rotation types with different time slots and engineer pools

### Engineering Manager Infrastructure

- **Current Status**: Manager data structure and lookup functions are implemented in `src/constants.ts`
- **Available Functions**: `getEngineeringManagerName()`, `isEngineeringManager()`
- **Test Coverage**: Comprehensive Vitest tests in `src/constants.test.ts`
- **Integration Needed**: Notion sync service needs to use manager name resolution
