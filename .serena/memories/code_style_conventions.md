# Code Style and Conventions

## TypeScript Configuration

- **Target**: ES2022
- **Modules**: NodeNext with nodenext resolution
- **Strict Mode**: Enabled with comprehensive type checking
- **Import Extensions**: `.ts` extensions allowed and required
- **No Emit**: TypeScript used for type checking only

## Code Style (Prettier)

- **Quotes**: Single quotes
- **Print Width**: 120 characters
- **Tab Width**: 2 spaces (no tabs)
- **Trailing Commas**: Always

## Linting Rules (ESLint)

- TypeScript recommended rules
- No unused variables (error)
- No explicit any (warning)
- Prefer const over let (error)
- Use Logger instead of console

## Naming Conventions

- **Enums**: PascalCase (e.g., `GhostEngPod`, `OncallRotationName`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `LOOKAHEAD_NUMBER_DAYS`)
- **Functions**: camelCase
- **Types/Interfaces**: PascalCase

## File Organization

- ES modules with explicit `.ts` extensions in imports
- Separate directories for related functionality (database/, slack/, debug/)
- Entity definitions in dedicated files
- Clear separation of concerns

## Import Style

- Uses ES module imports
- Explicit file extensions required
- Type-only imports when appropriate
