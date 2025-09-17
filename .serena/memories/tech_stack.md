# Tech Stack

## Core Technologies

- **Node.js**: 24+ (specified in .nvmrc and Dockerfile)
- **TypeScript**: 5.8.3 with strict configuration
- **Package Manager**: pnpm 10.13.1

## Runtime Dependencies

- **Database**: better-sqlite3 12.1.1 (SQLite with WAL mode)
- **Slack Integration**: @slack/web-api 7.9.3
- **Notion Integration**: @notionhq/client 4.0.1
- **Date/Time**: luxon 3.6.1 for date manipulation
- **Environment**: dotenv 17.1.0 for configuration
- **Monitoring**:
  - Datadog Lambda: datadog-lambda-js 11.126.0
  - Datadog Tracing: dd-trace 5.58.0

## Development Tools

- **Runtime**: tsx 4.20.3 (TypeScript execution)
- **Testing**: vitest 3.2.4 with UI and coverage support
- **Linting**: ESLint 9.15.0 with typescript-eslint 8.15.0
- **Formatting**: Prettier 3.3.3
- **Git Hooks**: lefthook 1.11.16
- **Type Checking**: TypeScript compiler with noEmit

## Build & Development

- **Build System**: TypeScript compiler (tsc) with build configuration
- **Test Framework**: Vitest with snapshot testing, UI, and coverage
- **Scripts**: tsx for direct TypeScript execution
- **Database Seeding**: Custom scripts with tsx

## Module System

- ES Modules with `.ts` extensions in imports
- Node.js Next module resolution
- TypeScript execution via tsx (no build step for development)
- Separate build configuration for production

## Deployment

- Docker containerized with Alpine Linux base
- Datadog Lambda Extension integration
- AWS Lambda compatible with event-driven architecture
- Environment-based configuration (development/production)
