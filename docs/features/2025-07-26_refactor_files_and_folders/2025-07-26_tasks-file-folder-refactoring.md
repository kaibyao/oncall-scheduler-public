# File & Folder Refactoring Tasks

**Date:** 2025-07-26
**Project:** Who-You-Gonna-Call
**Author:** Claude Code
**Status:** In Progress

## Overview

Refactor the codebase to eliminate file organization issues and group modules by areas of concern using a pragmatic Modular Colocation approach.

## Problem Statement

**Current Issues:**

- Both `src/utils.ts` and `src/utils/` folder exist (confusing duplication)
- Schedule-related files scattered in root: `schedule-generation.ts`, `schedule-override.ts`, `schedule-notifications.ts`, `schedule.types.ts`
- Limited test coverage (only 3 test files, no core scheduling logic tests)

**What's Working Well:**

- `database/`, `slack/`, `notion/` folders are well-organized
- Clear dependency flow: generation → notifications, with override being independent

## Approach: Pragmatic Modular Colocation

**Why this approach:**

- Domain-Driven Architecture is overkill for a focused scheduling application
- Current codebase has one primary domain (scheduling) with clear integration points
- Lower risk, higher value approach that solves core problems without architectural overhead

## Implementation Tasks

### Phase 0: Safety Net (CRITICAL - Must Complete First)

**Purpose:** Create characterization tests to protect against regressions

- [x] **P0.1** Set up test database isolation in Vitest config for characterization tests ✅
- [x] **P0.2** Create `src/schedule-generation.test.ts` with database snapshots to test main generation function ✅
- [x] **P0.3** Create `src/schedule-override.test.ts` to test override scenarios ✅
- [x] **P0.4** Mock external integrations (Slack, Notion) in tests ✅

**Acceptance Criteria:**

- All existing schedule generation logic has test coverage
- Tests use isolated in-memory databases
- External integrations are properly mocked
- Tests pass consistently and capture current behavior

### Phase 1: Consolidate Schedule Domain

**Purpose:** Group all schedule-related files together

- [x] **P1.1** Create `src/schedule/` directory ✅
- [x] **P1.2** Move `schedule-generation.ts` → `src/schedule/schedule.generation.ts` ✅
- [x] **P1.3** Move `schedule-override.ts` → `src/schedule/schedule.overrides.ts` ✅
- [x] **P1.4** Move `schedule-notifications.ts` → `src/schedule/schedule.notifications.ts` ✅
- [x] **P1.5** Move `schedule.types.ts` → `src/schedule/schedule.types.ts` ✅
- [x] **P1.6** Move test files to `src/schedule/` with proper naming ✅
- [x] **P1.7** Update all import statements throughout codebase for schedule files ✅

**Acceptance Criteria:**

- [x] All schedule-related logic is co-located in `src/schedule/` ✅
- [x] All imports updated and working ✅
- [x] Characterization tests still pass ✅
- Note: Skipped barrel imports (index.ts) per user preference

### Phase 2: Rationalize Utils

**Purpose:** Eliminate utils.ts vs utils/ duplication

- [x] **P2.1** Move all functions from `src/utils.ts` into appropriate files in `src/utils/` ✅
- [x] **P2.2** Create logical groupings: `date.ts` (date utilities), `schedule.utils.ts` (schedule-specific) ✅
- [x] **P2.3** Move schedule-specific utilities to `src/schedule/schedule.utils.ts` ✅
- [x] **P2.4** ~~Create `src/utils/index.ts` to export shared utilities~~ (Removed per CLAUDE.md - no barrel imports) ✅
- [x] **P2.5** Delete `src/utils.ts` after moving all functions ✅
- [x] **P2.6** Update imports and run tests ✅

**Acceptance Criteria:**

- [x] No more `src/utils.ts` vs `src/utils/` confusion ✅
- [x] Clear separation between shared and domain-specific utilities ✅
- [x] All tests pass after refactoring ✅

### Phase 3: Minor Cleanup

**Purpose:** Move operational scripts out of src

- [x] **P3.1** Create top-level `scripts/` directory ✅
- [x] **P3.2** Move `src/seed-data.ts` → `scripts/seed-data.ts` ✅
- [x] **P3.3** Update package.json scripts to point to new locations ✅

**Acceptance Criteria:**

- [x] Operational scripts are outside of main source code ✅
- [x] Package.json scripts updated and working ✅
- [x] Clean separation between runtime and utility code ✅

## Final Target Structure

```text
src/
├── schedule/
│   ├── schedule.generation.ts
│   ├── schedule.overrides.ts
│   ├── schedule.notifications.ts
│   ├── schedule.types.ts
│   ├── schedule.generation.test.ts
│   └── schedule.overrides.test.ts
├── database/ (no change - already well organized)
├── slack/ (no change)
├── notion/ (no change)
├── utils/
│   ├── date.ts
│   └── schedule-data.ts
├── config.ts
├── logger.ts
├── constants.ts
├── aws.types.ts
└── index.ts
scripts/
├── seed-data.ts
└── debug/
```

## Risk Mitigation

- **Test coverage is critical** - Phase 0 must complete successfully before any file moves
- **Incremental approach** - each phase can be verified independently
- **Preserve working patterns** - keep database/, slack/, notion/ folders intact
- **IDE assistance** - use TypeScript compiler and IDE refactoring tools for import updates

## Success Metrics

- [x] ✅ Eliminates utils.ts/utils/ confusion (Phase 2 Complete)
- [x] ✅ Groups all schedule logic in one discoverable location (Phase 1 Complete)
- [x] ✅ Maintains clear separation between core logic and integrations (Phase 1 Complete)
- [x] ✅ Low risk, incremental implementation (Phase 1 Complete)
- [x] ✅ Establishes pattern for future feature modules (Phase 1 Complete)
- [x] ✅ Preserves what's already working well (Phase 1 Complete)

## Dependencies

**Key Dependencies Identified:**

- `schedule-generation.ts` → `schedule-notifications.ts` (generation calls notifications)
- `schedule-override.ts` is independent
- Both generation and override are called from `index.ts`

**External Dependencies:**

- Database queries (`src/database/queries.ts`)
- Slack integrations (`src/slack/`)
- Utilities (`src/utils.ts`, `src/utils/schedule-data.ts`)

## Notes

- The existing test infrastructure (in-memory SQLite, migrations) is already excellent
- Database folder is well-organized and should remain intact
- Integration folders (slack/, notion/) are already following good patterns
