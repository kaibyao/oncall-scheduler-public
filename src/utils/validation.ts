import { DateTime } from 'luxon';
import { getUserByEmail, getUsersByRotation } from '../database/queries.js';
import { OncallRotationName } from '../schedule/schedule.types.js';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates if an engineer is qualified for a specific rotation.
 *
 * CRITICAL ROTATION LOGIC:
 * - Engineers are assigned to ONLY 'AM' or 'PM' in the database (users.rotation)
 * - AM engineers can work: AM shifts + Core shifts
 * - PM engineers can work: PM shifts + Core shifts
 * - Core shifts can be worked by ANY engineer (AM OR PM qualified)
 *
 * This function implements the qualification rules and has been a source of bugs
 * when test data incorrectly assigns engineers to 'Core' directly.
 */
export function validateEngineerForRotation(email: string, rotation: OncallRotationName): ValidationResult {
  if (!email || !email.trim()) {
    return { isValid: false, error: 'Engineer email is required' };
  }

  if (!email.includes('@')) {
    return { isValid: false, error: 'Engineer email must be a valid email address' };
  }

  const user = getUserByEmail(email);
  if (!user) {
    return { isValid: false, error: `Engineer with email ${email} not found in database` };
  }

  // CORE ROTATION LOGIC: Core can be filled by ANY engineer (AM or PM qualified)
  // This is the critical logic that allows maximum flexibility for core business hours
  let isQualified = false;
  if (rotation === OncallRotationName.Core) {
    const amUsers = getUsersByRotation(OncallRotationName.AM);
    const pmUsers = getUsersByRotation(OncallRotationName.PM);
    isQualified = amUsers.some((u) => u.email === email) || pmUsers.some((u) => u.email === email);
  } else {
    // AM/PM rotations require exact match with engineer's assigned rotation
    const usersInRotation = getUsersByRotation(rotation);
    isQualified = usersInRotation.some((u) => u.email === email);
  }

  if (!isQualified) {
    return { isValid: false, error: `Engineer ${email} is not qualified for ${rotation} rotation` };
  }

  return { isValid: true };
}

export function validateDateRange(startDate: string, endDate: string): ValidationResult {
  if (!startDate || !endDate) {
    return { isValid: false, error: 'Both start_date and end_date are required' };
  }

  const startDateTime = DateTime.fromISO(startDate);
  const endDateTime = DateTime.fromISO(endDate);

  if (!startDateTime.isValid) {
    return { isValid: false, error: `start_date "${startDate}" is not a valid date` };
  }

  if (!endDateTime.isValid) {
    return { isValid: false, error: `end_date "${endDate}" is not a valid date` };
  }

  const now = DateTime.now().startOf('day');

  if (startDateTime < now) {
    return { isValid: false, error: 'start_date cannot be in the past' };
  }

  if (endDateTime < startDateTime) {
    return { isValid: false, error: 'end_date must be on or after start_date' };
  }

  const maxFutureDate = now.plus({ days: 365 });
  if (endDateTime > maxFutureDate) {
    return { isValid: false, error: 'end_date cannot be more than 365 days in the future' };
  }

  return { isValid: true };
}

export function validateOverrideRequest(
  startDate: string,
  endDate: string,
  rotation: OncallRotationName,
  engineerEmail: string,
): ValidationResult {
  const dateValidation = validateDateRange(startDate, endDate);
  if (!dateValidation.isValid) {
    return dateValidation;
  }

  const engineerValidation = validateEngineerForRotation(engineerEmail, rotation);
  if (!engineerValidation.isValid) {
    return engineerValidation;
  }

  return { isValid: true };
}
