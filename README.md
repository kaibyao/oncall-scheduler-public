# Who-You-Gonna-Call

An on-call scheduler that generates optimized on-call schedules using a smart round-robin algorithm. The system balances fairness, workload distribution, and operational constraints across three rotation types (AM, Core, PM) for Ghost engineering teams.

This was a hack-week (that took a month because AWS configuration) project that allowed us to replace incident.io/google sheets/other 3rd party vendors subscriptions that we had.

## Overview

Who-You-Gonna-Call creates fair and balanced on-call schedules by:

- Using a smart round-robin algorithm with workload balancing
- Tracking historical data to ensure long-term fairness
- Supporting three rotation types with different time slots and engineer pools
- Generating schedules for 14-day lookahead periods (weekdays only)

### Rotation Types

- **AM**: 9:00-12:00 (3 hours)
- **Core**: 12:00-18:00 (6 hours)
- **PM**: 18:00-21:00 (3 hours)

## Prerequisites

- Node.js 24+
- pnpm package manager

## Getting Started

1. Clone the repository
2. Install [pnpm](https://pnpm.io/installation#on-posix-systems).
3. Copy `.env.development` to `.env`.
4. Install dependencies:

   ```bash
   pnpm install
   ```

5. Run the scheduler:
   ```bash
   pnpm start
   ```

## Development

### Available Scripts

- `pnpm start` - Run the script in development mode
- `pnpm tsc` - Run TypeScript type checking

### Code Quality

- `pnpm lint` - Run ESLint on TypeScript files
- `pnpm lint:fix` - Run ESLint with automatic fixes
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check formatting without changes

### Database

- `pnpm resetdb` - Reset the SQLite database
- Database file: `database/oncall_schedule.db`
- Uses SQLite with WAL mode for concurrent access

## Architecture

- **Smart Round-Robin**: Uses workload-balanced algorithm with constraint checking
- **Database**: SQLite with migration system for schema updates
- **Type Safety**: Comprehensive TypeScript types throughout
- **ES Modules**: Modern JavaScript module system with `.ts` extensions

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes following the existing code style
4. Run linting and type checking: `pnpm lint && pnpm type-check`
5. Format your code: `pnpm format`
6. Commit your changes with a descriptive message
7. Push to your fork and submit a pull request

### Code Style

- Follow TypeScript best practices
- Use existing patterns and conventions
- Maintain comprehensive type safety
- Add appropriate comments for complex logic
