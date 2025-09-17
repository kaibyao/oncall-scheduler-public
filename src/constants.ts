/**
 * Core constants shared by the Ghost on-call scheduler.
 *
 * NOTE:
 *  • Keep this file free of side-effects – everything here must be
 *    deterministically initialised at module load.
 *  • Do NOT add barrel exports elsewhere in the project.
 */

export const LOOKAHEAD_NUMBER_DAYS = 14; // 2 weeks

/** The days of the week that the rotation occurs on (0 = Sunday, 6 = Saturday). */
export const ROTATION_DAYS_OF_WEEK = [1, 2, 3, 4, 5];

/* ====================================================================
 * Engineering Manager type-safe infrastructure
 * ==================================================================== */

/**
 * Immutable description of an Engineering Manager.
 */
export interface EngineeringManager {
  /** Manager's primary e-mail address (case-insensitive key) */
  email: string;
  /** Display name (used in Notion, Slack, etc.) */
  name: string;
}

/**
 * Hard-coded list of current Engineering Managers.
 * NOTE:  Keep the array `readonly` to guarantee immutability at runtime.
 */
export const ENGINEERING_MANAGERS: readonly EngineeringManager[] = [
  { email: 'eng.director@company.com', name: 'Eng Director' },
  { email: 'zero-manager@company.com', name: 'Zero Manager' },
  { email: 'blinky-manager@company.com', name: 'Blinky Manager' },
] as const;

/**
 * Legacy e-mail list kept for FULL backward compatibility.
 *
 * Any existing imports of `ENGINEERING_MANAGER_EMAILS` will continue
 * to function exactly as before.  Internally it is derived from the
 * new `ENGINEERING_MANAGERS` structure to avoid duplication.
 */
export const ENGINEERING_MANAGER_EMAILS: readonly string[] = Object.freeze(ENGINEERING_MANAGERS.map((m) => m.email));

/* --------------------------------------------------------------------
 * Internal look-up structures – initialised once per module-load
 * -------------------------------------------------------------------- */

/**
 * Map keyed by lowercase e-mail → manager name for O(1) look-ups.
 *
 * Initialising the map eagerly guarantees we only pay the cost once
 * and that subsequent calls to resolution helpers remain < 1 ms,
 * satisfying the PRD's performance KPI.
 */
const managerLookupMap: Map<string, string> = new Map(
  ENGINEERING_MANAGERS.map(({ email, name }) => [email.toLowerCase(), name]),
);

/* --------------------------------------------------------------------
 * Helper functions
 * -------------------------------------------------------------------- */

/**
 * Resolve an Engineering Manager's display name by e-mail.
 *
 * @param email – E-mail address to resolve (case-insensitive).
 * @returns Display name if found; otherwise the original e-mail
 *          (graceful fallback, no exceptions).
 */
export function getEngineeringManagerName(email: string): string {
  return managerLookupMap.get(email.toLowerCase()) ?? email;
}

/**
 * Determine whether an e-mail address belongs to an Engineering Manager.
 *
 * @param email – E-mail address to test (case-insensitive).
 * @returns `true` if the address is in `ENGINEERING_MANAGERS`.
 */
export function isEngineeringManager(email: string): boolean {
  return managerLookupMap.has(email.toLowerCase());
}
