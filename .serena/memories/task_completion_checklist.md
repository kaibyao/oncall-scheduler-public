# Task Completion Checklist

When completing any coding task, follow these steps:

## Code Quality Checks

1. **Type Check**: Run `pnpm type-check` to ensure no TypeScript errors
2. **Lint**: Run `pnpm lint` to check for linting issues
3. **Format**: Run `pnpm format` to ensure consistent code formatting
4. **Tests**: Run `pnpm test` to verify all tests pass

## Testing Strategy

- **Unit Tests**: Test individual functions and components
- **Integration Tests**: Test database operations and service interactions
- **Snapshot Tests**: Verify consistent output for schedule generation
- **Coverage**: Use `pnpm test:coverage` to check test coverage

## Pre-commit Validation

- lefthook will automatically run on commit:
  - Lints staged TypeScript files
  - Formats staged files
  - Stages fixed files automatically

## Manual Verification

- Test the functionality with `pnpm start` if applicable
- Verify database operations don't break existing data
- Check Slack integration works if modified
- Test Notion sync functionality if modified

## Important Notes

- **Comprehensive test suite available** with vitest
- Write tests for new functionality following existing patterns
- Update snapshots when schedule generation logic changes
- Always run full test suite before considering task complete
- Follow existing code patterns and conventions
- Ensure ES module imports use `.ts` extensions
- Maintain strict TypeScript compliance

## Git Workflow

1. Make changes following code style
2. Run quality checks: `pnpm type-check`, `pnpm lint`, `pnpm test`
3. Stage changes with `git add`
4. Commit (lefthook handles pre-commit validation)
5. Push to appropriate branch

## Database Changes

- Update migrations if schema changes
- Run `pnpm seed` to test with sample data
- Verify no data corruption with existing schedules
