/**
 * On-call rotation types for schedule assignments.
 *
 * CRITICAL: Engineer Qualification Logic
 * - Engineers are assigned ONLY to AM or PM (never Core directly)
 * - AM engineers can work: AM shifts + Core shifts
 * - PM engineers can work: PM shifts + Core shifts
 * - Core shifts can be filled by ANY engineer (largest pool)
 *
 * Database Schema:
 * - users.rotation: Contains 'AM' or 'PM' ONLY
 * - oncall_schedule.rotation: Can contain 'AM' | 'Core' | 'PM'
 */
export enum OncallRotationName {
  AM = 'AM', // 9-12: Morning shift (can also work Core)
  Core = 'Core', // 12-18: Core business hours (AM or PM engineers can work)
  PM = 'PM', // 18-21: Evening shift (can also work Core)
}

export enum GhostEngPod {
  Blinky = 'Blinky',
  Swayze = 'Swayze',
  Zero = 'Zero',
}

export interface EngineerRotationHours {
  engineer_email: string;
  rotation: OncallRotationName;
  total_hours: number;
}

export interface EngineerRotationAssignment {
  engineer_email: string;
  engineer_name: string;
  rotation: OncallRotationName;
  date: string;
}
