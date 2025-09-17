import { describe, it, expect } from 'vitest';
import {
  ENGINEERING_MANAGERS,
  ENGINEERING_MANAGER_EMAILS,
  getEngineeringManagerName,
  isEngineeringManager,
} from './constants.js';

describe('Engineering Manager infrastructure', () => {
  it('ENGINEERING_MANAGERS contains the expected hard-coded data', () => {
    expect(ENGINEERING_MANAGERS).toHaveLength(3);
    expect(ENGINEERING_MANAGERS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ email: 'eng.director@company.com', name: 'Eng Director' }),
        expect.objectContaining({ email: 'zero-manager@company.com', name: 'Zero Manager' }),
        expect.objectContaining({ email: 'blinky-manager@company.com', name: 'Blinky Manager' }),
      ]),
    );
  });

  it('ENGINEERING_MANAGER_EMAILS is derived and in the same order', () => {
    const derived = ENGINEERING_MANAGERS.map((m) => m.email);
    expect(ENGINEERING_MANAGER_EMAILS).toEqual(derived);

    // Ensure immutability - attempting to modify should throw
    expect(() => {
      (ENGINEERING_MANAGER_EMAILS as unknown as string[]).push('test@example.com');
    }).toThrow();
  });

  it('getEngineeringManagerName resolves names case-insensitively', () => {
    expect(getEngineeringManagerName('Eng.Director@company.com')).toBe('Eng Director');
    expect(getEngineeringManagerName('zero-manager@company.com')).toBe('Zero Manager');
    expect(getEngineeringManagerName('blinky-manager@company.com')).toBe('Blinky Manager');
    expect(getEngineeringManagerName('blinky-manager@company.com')).toBe('Blinky Manager');
  });

  it('getEngineeringManagerName falls back to email when not found', () => {
    const unknown = 'someone@company.com';
    expect(getEngineeringManagerName(unknown)).toBe(unknown);
    expect(getEngineeringManagerName('nonexistent@example.com')).toBe('nonexistent@example.com');
  });

  it('getEngineeringManagerName handles edge cases gracefully', () => {
    expect(getEngineeringManagerName('')).toBe('');
    expect(getEngineeringManagerName('   ')).toBe('   ');
    expect(getEngineeringManagerName('invalid-email')).toBe('invalid-email');
  });

  it('isEngineeringManager correctly identifies managers (case-insensitive)', () => {
    expect(isEngineeringManager('zero-manager@company.com')).toBe(true);
    expect(isEngineeringManager('zero-manager@company.com')).toBe(true);
    expect(isEngineeringManager('Eng.Director@company.com')).toBe(true);
    expect(isEngineeringManager('blinky-manager@company.com')).toBe(true);
    expect(isEngineeringManager('not.a.manager@company.com')).toBe(false);
    expect(isEngineeringManager('someone@example.com')).toBe(false);
  });

  it('isEngineeringManager handles edge cases gracefully', () => {
    expect(isEngineeringManager('')).toBe(false);
    expect(isEngineeringManager('   ')).toBe(false);
    expect(isEngineeringManager('invalid-email')).toBe(false);
  });

  it('backward compatibility: ENGINEERING_MANAGER_EMAILS works as before', () => {
    // Verify the array contains all expected emails
    expect(ENGINEERING_MANAGER_EMAILS).toContain('eng.director@company.com');
    expect(ENGINEERING_MANAGER_EMAILS).toContain('zero-manager@company.com');
    expect(ENGINEERING_MANAGER_EMAILS).toContain('blinky-manager@company.com');

    // Verify filtering/mapping operations work
    const upperCaseEmails = ENGINEERING_MANAGER_EMAILS.map((email) => email.toUpperCase());
    expect(upperCaseEmails).toHaveLength(3);
  });

  it('internal Map provides O(1) look-ups (performance validation)', () => {
    const iterations = 100_000; // Reduced for CI stability
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      isEngineeringManager('eng.director@company.com');
      getEngineeringManagerName('zero-manager@company.com');
    }
    const duration = performance.now() - start;
    // Allow generous threshold (< 50ms for 100k lookups even on slow CI)
    expect(duration).toBeLessThan(50);
  });

  it('maintains data consistency between constants', () => {
    // Verify each email in ENGINEERING_MANAGER_EMAILS maps to a manager
    ENGINEERING_MANAGER_EMAILS.forEach((email) => {
      expect(isEngineeringManager(email)).toBe(true);
      expect(getEngineeringManagerName(email)).not.toBe(email); // Should resolve to name, not email
    });

    // Verify each manager in ENGINEERING_MANAGERS is in the email list
    ENGINEERING_MANAGERS.forEach((manager) => {
      expect(ENGINEERING_MANAGER_EMAILS).toContain(manager.email);
    });
  });

  it('ensures case normalization works correctly', () => {
    const testCases = ['eng.director@company.com', 'ENG.DIRECTOR@company.com', 'Eng.Director@company.com', 'eNg.DiReCtOr@company.com'];

    testCases.forEach((email) => {
      expect(isEngineeringManager(email)).toBe(true);
      expect(getEngineeringManagerName(email)).toBe('Eng Director');
    });
  });
});
