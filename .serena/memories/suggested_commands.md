# Suggested Commands

## Development Commands

- `pnpm start` - Run the scheduler in development mode
- `pnpm build` - Build production bundle to ./dist directory
- `pnpm type-check` - Run TypeScript type checking without emitting files

## Code Quality Commands

- `pnpm lint` - Run ESLint on TypeScript files
- `pnpm format` - Format code with Prettier
- `pnpm format:check` - Check code formatting without making changes
- `pnpm format:lefthook` - Format files via lefthook (used by git hooks)

## Testing Commands

- `pnpm test` - Run all tests with vitest
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:ui` - Run tests with Vitest UI
- `pnpm test:coverage` - Run tests with coverage report

## Database Commands

- `pnpm resetdb` - Reset the SQLite database (removes db files)
- `pnpm seed` - Seed database with initial data using tsx

## System Commands (Darwin/macOS)

- `ls` - List directory contents
- `cd` - Change directory
- `grep` - Search text patterns
- `find` - Find files and directories
- `git` - Version control operations

## Git Hooks

- **lefthook** automatically runs on pre-commit:
  - Lints staged TypeScript files
  - Formats staged files (ts, js, json, md, yml, yaml)
  - Stages fixed files automatically

## Important Notes

- Uses **tsx** for direct TypeScript execution (no build step in development)
- **vitest** for comprehensive testing with snapshots and coverage
- Package manager must be pnpm (specified as 10.13.1)
- Build step available for production deployment
- Test files include unit, integration, and snapshot testing
