# Product Requirements Document (PRD)

# Engineering Manager Notion Sync Fix

**Date**: 2025-08-11
**Author**: Senior Product Manager
**Version**: 1.0
**Status**: Draft

---

## 1. Introduction/Overview

The Ghost on-call scheduler system currently experiences synchronization failures when engineering managers are assigned to on-call rotations. This occurs because engineering managers are defined as email constants in the codebase but do not exist as users with proper name mappings in the database. When syncing to Notion, their email addresses are used as display names, creating a mismatch between the email identifier used in application logic and the name stored in Notion. This inconsistency causes subsequent sync operations to fail and prevents proper schedule updates.

**Goal**: Establish a stable, maintainable solution for engineering manager name resolution that ensures consistent Notion synchronization without risking the core rotation logic stability.

---

## 2. Goals

1. **Resolve Notion sync failures** for engineering manager assignments within 1 sprint
2. **Maintain system stability** with zero regression in rotation logic
3. **Preserve type safety** throughout the implementation
4. **Enable consistent name display** across all platforms (Notion, Slack, etc.)
5. **Minimize deployment risk** through isolated, non-breaking changes
6. **Establish clear maintenance path** for future manager updates

---

## 3. User Stories

### US-1: As an Engineering Manager

- **I want** my name to display correctly in Notion schedules
- **So that** team members can easily identify who is on-call
- **Acceptance Criteria**:
  - Manager names appear as proper names (not emails) in Notion
  - Names are consistent across all sync operations
  - No manual intervention required for name resolution

### US-2: As a Schedule Administrator

- **I want** Notion sync operations to complete successfully
- **So that** the schedule remains accurate and up-to-date
- **Acceptance Criteria**:
  - All sync operations complete without errors
  - Manager assignments sync correctly on first attempt
  - No duplicate or conflicting entries created

### US-3: As a DevOps Engineer

- **I want** manager data updates to be simple and safe
- **So that** I can maintain the system without risk
- **Acceptance Criteria**:
  - Clear documentation for adding/updating managers
  - Type-safe implementation prevents runtime errors
  - Changes do not affect rotation logic

### US-4: As a Developer

- **I want** clear, type-safe interfaces for manager data
- **So that** I can work with the code confidently
- **Acceptance Criteria**:
  - TypeScript provides full type coverage
  - No `any` types used
  - Clear function signatures and return types

---

## 4. Functional Requirements

### 4.1 Manager Data Structure

1. **FR-1**: The system must maintain a mapping of engineering manager emails to their full names
2. **FR-2**: The system must provide a type-safe interface for manager data with the following structure:
   ```typescript
   interface EngineeringManager {
     email: string;
     name: string;
   }
   ```
3. **FR-3**: The system must define managers in a centralized constant that includes both email and name

### 4.2 Name Resolution

4. **FR-4**: The system must provide a function to retrieve a manager's name by email
5. **FR-5**: The system must return the email as fallback if no name mapping exists
6. **FR-6**: The name resolution must be case-insensitive for email matching
7. **FR-7**: The system must integrate manager name resolution into the existing COALESCE pattern

### 4.3 Database Query Updates

8. **FR-8**: The `getWorkloadHistory` query must resolve manager names using the new mapping
9. **FR-9**: The `getWorkloadHistoryHoursByEngineerRotation` query must include manager name resolution
10. **FR-10**: All schedule-related queries must consistently use the same name resolution logic

### 4.4 Notion Synchronization

11. **FR-11**: The system must use resolved names when creating Notion entries
12. **FR-12**: The system must use resolved names when comparing local and Notion entries
13. **FR-13**: The system must handle both email and name comparisons for backward compatibility
14. **FR-14**: The sync process must complete successfully for all manager assignments

### 4.5 Type Safety Requirements

15. **FR-15**: All new interfaces and types must be exported from appropriate type files
16. **FR-16**: No barrel imports (`index.ts` export files) may be created
17. **FR-17**: All functions must have explicit return type annotations
18. **FR-18**: The implementation must pass strict TypeScript compilation

### 4.6 Data Migration

19. **FR-19**: The system must handle existing Notion entries that use email as name
20. **FR-20**: The system must update existing entries to use proper names on next sync

---

## 5. Non-Goals (Out of Scope)

1. **Adding managers to the users table** - This approach risks breaking rotation logic
2. **Creating a separate managers table** - Unnecessary complexity for 3 entries
3. **Implementing role-based access control** - Beyond current requirements
4. **Modifying rotation assignment logic** - Must remain unchanged for stability
5. **Changing the database schema** - No migrations in this implementation
6. **Implementing manager-specific scheduling rules** - Managers follow standard rotation rules
7. **Creating UI for manager management** - Configuration remains code-based
8. **Integrating with HR systems** - Manual updates acceptable for small dataset

---

## 6. Design Considerations

### 6.1 Code Organization

- Manager data will be co-located with existing constants in `src/constants.ts`
- Type definitions will be added to the same file (no separate type file needed for 3 entries)
- Lookup functions will be pure functions with no side effects

### 6.2 Naming Conventions

- Use clear, descriptive names: `ENGINEERING_MANAGERS`, `getEngineeringManagerName()`
- Maintain consistency with existing codebase patterns
- Follow TypeScript naming conventions (PascalCase for types, camelCase for functions)

### 6.3 Error Handling

- Graceful fallback to email if name not found
- No throwing of exceptions for missing managers
- Logging of lookup failures for debugging

### 6.4 Performance Considerations

- Use Map for O(1) lookup performance
- Initialize lookup map once at module load
- No database queries for manager name resolution

---

## 7. Technical Considerations

### 7.1 Implementation Architecture

```
src/constants.ts
  ├── ENGINEERING_MANAGERS constant (email + name)
  ├── EngineeringManager interface
  ├── managerLookupMap initialization
  └── getEngineeringManagerName() function

src/database/queries.ts
  └── Updated COALESCE to include manager lookup

src/notion/notion.sync.service.ts
  └── Uses resolved names for all operations
```

### 7.2 Backward Compatibility

- Existing code using `ENGINEERING_MANAGER_EMAILS` remains functional
- Email-based lookups continue to work
- No breaking changes to public interfaces

### 7.3 Testing Requirements

- Unit tests for name resolution function
- Integration tests for Notion sync with managers
- Regression tests for rotation logic
- Edge case tests for missing/malformed data

### 7.4 Security Considerations

- No sensitive data exposed in constants
- Email addresses already visible in codebase
- No external API calls for name resolution

---

## 8. Dependencies & Assumptions

### Dependencies

1. **No external dependencies** - Implementation uses only existing packages
2. **TypeScript 5.0+** - For satisfies operator and strict type checking
3. **Node.js ES modules** - Existing module system
4. **SQLite with WAL mode** - Current database system

### Assumptions

1. **Manager list is stable** - Changes are infrequent (quarterly or less)
2. **Manager count remains small** - Less than 10 managers total
3. **Email format is consistent** - All use @company.com or @ghost.org domain
4. **Names follow standard format** - "FirstName LastName" pattern
5. **No internationalization required** - ASCII names only
6. **Notion API remains stable** - No breaking changes expected

---

## 9. Timeline & Milestones

### Phase 1: Implementation (Day 1-2)

- **M1.1**: Create manager data structure and lookup functions
- **M1.2**: Update database queries with name resolution
- **M1.3**: Integrate with Notion sync service
- **M1.4**: Add comprehensive logging

### Phase 2: Testing (Day 3-4)

- **M2.1**: Write unit tests for lookup functions
- **M2.2**: Create integration tests for sync flow
- **M2.3**: Perform manual testing with production data copy
- **M2.4**: Validate backward compatibility

### Phase 3: Deployment (Day 5)

- **M3.1**: Deploy to staging environment
- **M3.2**: Run full sync verification
- **M3.3**: Deploy to production
- **M3.4**: Monitor for 24 hours

### Total Timeline: 5 business days

---

## 10. Risk Assessment & Mitigation

### Risk 1: Rotation Logic Regression

- **Probability**: Low
- **Impact**: Critical
- **Mitigation**:
  - No changes to rotation assignment logic
  - Comprehensive test suite execution
  - Staged rollout with monitoring

### Risk 2: Notion Sync Failure

- **Probability**: Medium
- **Impact**: High
- **Mitigation**:
  - Extensive integration testing
  - Rollback plan prepared
  - Manual sync capability as backup

### Risk 3: Type Safety Violations

- **Probability**: Low
- **Impact**: Medium
- **Mitigation**:
  - Strict TypeScript configuration
  - Code review by senior developer
  - Pre-commit type checking

### Risk 4: Performance Degradation

- **Probability**: Very Low
- **Impact**: Low
- **Mitigation**:
  - Use efficient Map data structure
  - Performance testing with large datasets
  - Monitoring of sync execution time

### Risk 5: Future Scalability Issues

- **Probability**: Medium
- **Impact**: Medium
- **Mitigation**:
  - Document migration path to database solution
  - Keep implementation modular
  - Regular review of manager count

---

## 11. Success Metrics

### Immediate Success (Day 1 post-deployment)

1. **Zero Notion sync failures** related to manager names
2. **100% of manager assignments** display with proper names
3. **No rotation logic errors** in logs
4. **Type checking passes** without warnings

### Short-term Success (Week 1)

1. **Sync reliability**: 100% success rate over 7 days
2. **Performance maintained**: Sync time within 5% of baseline
3. **Zero rollbacks** required
4. **No manual interventions** needed

### Long-term Success (Month 1)

1. **Maintenance burden**: Less than 1 hour/month
2. **Zero regressions** in rotation logic
3. **Successful manager updates** (if any) without issues
4. **Team satisfaction**: Positive feedback on name display

### Key Performance Indicators

- **Sync Success Rate**: Target 100%
- **Mean Time Between Failures**: Target > 30 days
- **Name Resolution Performance**: Target < 1ms
- **Code Coverage**: Target > 90% for new code

---

## 12. Open Questions

1. **Q1**: Should we implement a configuration file (JSON/YAML) for manager data instead of hardcoding?
   - **Consideration**: Adds complexity but improves maintainability

2. **Q2**: Should manager names be validated against a specific format?
   - **Consideration**: Ensures consistency but may be over-engineering

3. **Q3**: Should we add a CLI command for updating manager information?
   - **Consideration**: Helpful for ops but increases scope

4. **Q4**: How should we handle manager name changes (marriage, etc.)?
   - **Consideration**: Rare but needs documented process

5. **Q5**: Should we implement caching for Notion person IDs for managers?
   - **Consideration**: Could improve performance but adds complexity

---

## 13. Future Considerations

### Near-term Enhancements (3-6 months)

1. **Migration to database storage** when manager count exceeds 10
2. **Configuration file support** for easier updates
3. **Admin UI** for manager management
4. **Audit logging** for manager data changes

### Long-term Evolution (6-12 months)

1. **Role-based system** supporting multiple manager types
2. **Integration with HR systems** for automatic updates
3. **Historical tracking** of manager assignments
4. **Reporting capabilities** for manager on-call metrics

### Technical Debt Considerations

1. **Document migration path** from constants to database
2. **Create abstraction layer** for easier future refactoring
3. **Establish clear interfaces** for manager data access
4. **Plan for internationalization** if global expansion occurs

---

## 14. Implementation Checklist

### Code Changes Required

#### File: `src/constants.ts`

- [ ] Define `EngineeringManager` interface
- [ ] Create `ENGINEERING_MANAGERS` array with email and name
- [ ] Implement `getEngineeringManagerName(email: string): string` function
- [ ] Create `managerEmailSet` for quick lookups
- [ ] Add JSDoc documentation for all new exports

#### File: `src/database/queries.ts`

- [ ] Import `getEngineeringManagerName` function
- [ ] Update `getWorkloadHistory` query COALESCE statement
- [ ] Update other relevant queries with manager name resolution
- [ ] Add inline comments explaining the resolution logic

#### File: `src/notion/notion.sync.service.ts`

- [ ] Ensure manager names are used in all Notion operations
- [ ] Update comparison logic to handle name resolution
- [ ] Add debug logging for manager name resolution

#### File: `src/utils/schedule-data.ts`

- [ ] Verify manager name resolution in schedule data processing
- [ ] Update any name-related utility functions

### Testing Requirements

- [ ] Unit tests for `getEngineeringManagerName`
- [ ] Integration tests for database queries with managers
- [ ] End-to-end tests for Notion sync with manager assignments
- [ ] Regression tests for rotation logic
- [ ] Manual testing checklist completed

### Documentation Updates

- [ ] Update CLAUDE.md with manager configuration section
- [ ] Add inline code comments for manager resolution
- [ ] Create runbook for updating manager information
- [ ] Document rollback procedure

### Deployment Steps

- [ ] Code review completed
- [ ] TypeScript compilation successful
- [ ] All tests passing
- [ ] Staging deployment successful
- [ ] Production deployment approved
- [ ] Monitoring alerts configured
- [ ] Success metrics tracking enabled

---

## 15. Appendix: Sample Implementation

### Sample Code Structure

```typescript
// src/constants.ts

export interface EngineeringManager {
  email: string;
  name: string;
}

export const ENGINEERING_MANAGERS: readonly EngineeringManager[] = [
  { email: 'eng.director@company.com', name: 'Eng Director' },
  { email: 'zero-manager@company.com', name: 'Zero Manager' },
  { email: 'blinky-manager@company.com', name: 'Blinky Manager' },
] as const;

// Keep backward compatibility
export const ENGINEERING_MANAGER_EMAILS = ENGINEERING_MANAGERS.map((m) => m.email);

// Create lookup map for O(1) performance
const managerLookupMap = new Map(ENGINEERING_MANAGERS.map((m) => [m.email.toLowerCase(), m.name]));

export function getEngineeringManagerName(email: string): string {
  return managerLookupMap.get(email.toLowerCase()) ?? email;
}

export function isEngineeringManager(email: string): boolean {
  return managerLookupMap.has(email.toLowerCase());
}
```

### Sample Query Update

```typescript
// src/database/queries.ts
import { getEngineeringManagerName } from '../constants.js';

export function getWorkloadHistory(daysBack: number): EngineerRotationAssignment[] {
  const query = db.prepare(`
    SELECT
      os.date,
      os.rotation,
      os.engineer_email,
      COALESCE(u.name, os.engineer_email) as engineer_name
    FROM oncall_schedule os
    LEFT JOIN users u ON os.engineer_email = u.email
    WHERE os.date >= date('now', '-' || ? || ' days')
    ORDER BY os.date DESC
  `);

  const results = query.all(daysBack) as EngineerRotationAssignment[];

  // Apply manager name resolution
  return results.map((r) => ({
    ...r,
    engineer_name: r.engineer_name.includes('@') ? getEngineeringManagerName(r.engineer_name) : r.engineer_name,
  }));
}
```

---

**END OF PRD**

_This document serves as the authoritative specification for implementing the engineering manager synchronization fix. Any deviations from these requirements must be documented and approved by the product owner._
