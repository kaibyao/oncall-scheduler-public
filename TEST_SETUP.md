# Vitest Configuration for Who-You-Gonna-Call

This project has been successfully configured with Vitest for ES modules and SQLite integration testing.

## Configuration Overview

### Vitest Setup

- **Configuration File**: `vitest.config.ts` - Optimized for ES modules with Node.js environment
- **Test Scripts**: Added to `package.json` for running tests in various modes
- **TypeScript**: Updated `tsconfig.json` to include Vitest types and test files

### Database Testing

- **In-Memory SQLite**: Tests use `:memory:` databases for fast, isolated testing
- **Migration Support**: Automatically runs all migrations for each test database
- **Test Utilities**: Comprehensive utilities in `test/utils/` for database setup and mocking

## Key Features

### 1. ES Modules Support

- Full ES module compatibility with `.js` extensions in imports
- TypeScript configuration optimized for Node.js ES modules
- Vitest configured for ES module environments

### 2. SQLite Integration Testing

- **In-Memory Databases**: Each test gets a fresh SQLite database in memory
- **Migration Support**: Automatically applies all production migrations
- **Test Data Utilities**: Helper functions for seeding and clearing test data
- **Database Mocking**: Utilities to replace production database with test instances

### 3. Test Organization

```
test/
├── setup.ts                    # Global test setup
├── fixtures/
│   └── test-data.ts            # Test data fixtures and generators
├── utils/
│   ├── database.ts             # Database testing utilities
│   └── mock-database.ts        # Database mocking utilities
├── unit/
│   └── test-utils.test.ts      # Unit tests for test utilities
└── integration/
    ├── database.test.ts        # Database integration tests
    └── schedule-generation.test.ts # Schedule generation tests
```

## Available Test Scripts

```bash
# Run all tests once
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with UI
pnpm test:ui

# Run tests with coverage
pnpm test:coverage
```

## Test Utilities

### Database Utilities

- `createTestDatabase()` - Creates a new in-memory SQLite database
- `runTestMigrations(db)` - Runs all migrations on a test database
- `createTestDatabaseWithMigrations()` - Creates database with migrations applied
- `seedTestData(db, data)` - Seeds test data into database
- `clearTestData(db)` - Clears all data from test tables
- `cleanupTestDatabase(db)` - Closes and cleans up database

### Mocking Utilities

- `mockDatabase()` - Replaces production database with test database
- `createScopedDatabaseMock()` - Creates database mock for specific test scope
- `withTestDatabase(testFn)` - Runs test function with fresh database

### Test Data Generators

- `generateTestDateRange(start, days)` - Generates array of date strings
- `generateTestScheduleData(dates, rotations, engineers)` - Creates schedule test data
- Test fixtures with realistic engineer emails and rotation data

## Example Usage

### Basic Database Test

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createScopedDatabaseMock } from '../utils/mock-database.js';
import { seedTestData } from '../utils/database.js';

describe('My Database Test', () => {
  const { setup, cleanup } = createScopedDatabaseMock();
  let db: Database.Database;

  beforeEach(() => {
    db = setup();
  });

  afterEach(() => {
    cleanup();
  });

  it('should work with test data', () => {
    seedTestData(db, {
      schedules: [{ date: '2024-01-01', rotation: 'Core', engineer_email: 'test@company.com' }],
    });

    const result = db.prepare('SELECT * FROM oncall_schedule WHERE date = ?').get('2024-01-01');
    expect(result.engineer_email).toBe('test@company.com');
  });
});
```

### Integration Test with Mocked Database

```typescript
import { mockDatabase } from '../utils/mock-database.js';

describe('Schedule Generation', () => {
  const { db, cleanup } = mockDatabase();

  afterEach(() => {
    cleanup();
  });

  it('should generate schedule', async () => {
    // Your schedule generation code will now use the test database
    const result = await runScheduleGeneration();
    expect(result).toBeDefined();
  });
});
```

## Important Notes

1. **Migration Data**: The test database includes production migration data. Tests should account for existing data from `002_import_initial_data.sql`.

2. **Database Isolation**: Each test should use its own database instance or clear data between tests for proper isolation.

3. **ES Module Imports**: Always use `.js` extensions in import statements, even for TypeScript files.

4. **Async Support**: The testing setup fully supports async/await and top-level await in ES modules.

## Status

✅ **Vitest configured for ES modules**
✅ **SQLite in-memory database testing**
✅ **Migration support in tests**
✅ **Test utilities and fixtures**
✅ **Database mocking capabilities**
✅ **Example integration tests**
✅ **TypeScript configuration updated**
✅ **Package.json test scripts added**

The testing infrastructure is ready for development and can handle both unit tests and integration tests with real SQLite database operations.
