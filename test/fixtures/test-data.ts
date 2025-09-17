import type { OncallScheduleOverrideEntity, Upsertable } from '../../src/database/entities.js';
import type { OncallScheduleEntity } from '../../src/database/entities.js';
import { OncallRotationName } from '../../src/schedule/schedule.types.js';

/**
 * Test fixture data for integration tests
 */

export const TEST_ENGINEERS = {
  CORE_POD_1: ['alice.engineer@company.com', 'bob.developer@company.com', 'charlie.coder@company.com'],
  CORE_POD_2: ['diana.dev@company.com', 'erik.engineer@company.com', 'fiona.fullstack@company.com'],
  GROWTH_POD: ['grace.growth@company.com', 'henry.hacker@company.com'],
} as const;

export const TEST_ROTATIONS = [OncallRotationName.AM, OncallRotationName.Core, OncallRotationName.PM];

export const SAMPLE_SCHEDULE_DATA: Array<Upsertable<OncallScheduleEntity>> = [
  {
    date: '2024-01-01',
    rotation: OncallRotationName.AM,
    engineer_email: TEST_ENGINEERS.CORE_POD_1[0],
  },
  {
    date: '2024-01-01',
    rotation: OncallRotationName.Core,
    engineer_email: TEST_ENGINEERS.CORE_POD_2[0],
  },
  {
    date: '2024-01-01',
    rotation: OncallRotationName.PM,
    engineer_email: TEST_ENGINEERS.GROWTH_POD[0],
  },
  {
    date: '2024-01-02',
    rotation: OncallRotationName.AM,
    engineer_email: TEST_ENGINEERS.CORE_POD_1[1],
  },
  {
    date: '2024-01-02',
    rotation: OncallRotationName.Core,
    engineer_email: TEST_ENGINEERS.CORE_POD_2[1],
  },
  {
    date: '2024-01-02',
    rotation: OncallRotationName.PM,
    engineer_email: TEST_ENGINEERS.GROWTH_POD[1],
  },
];

export const SAMPLE_OVERRIDE_DATA: Array<Upsertable<OncallScheduleOverrideEntity>> = [
  {
    date: '2024-01-03',
    rotation: OncallRotationName.Core,
    engineer_email: 'override.engineer@company.com',
  },
  {
    date: '2024-01-04',
    rotation: OncallRotationName.PM,
    engineer_email: 'emergency.oncall@company.com',
  },
];

/**
 * Creates a date range for testing
 * @param startDate - Start date (YYYY-MM-DD format)
 * @param days - Number of days to generate
 * @returns Array of date strings
 */
export function generateTestDateRange(startDate: string, days: number): string[] {
  const dates: string[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }

  return dates;
}

/**
 * Creates test schedule data for a date range
 * @param dates - Array of date strings
 * @param rotations - Array of rotation types
 * @param engineers - Array of engineer emails
 * @returns Array of schedule objects
 */
export function generateTestScheduleData(
  dates: string[],
  rotations: readonly OncallRotationName[] = TEST_ROTATIONS,
  engineers: readonly string[] = TEST_ENGINEERS.CORE_POD_1,
): Array<Upsertable<OncallScheduleEntity>> {
  const schedules: Array<Upsertable<OncallScheduleEntity>> = [];
  let engineerIndex = 0;

  for (const date of dates) {
    for (const rotation of rotations) {
      schedules.push({
        date,
        rotation,
        engineer_email: engineers[engineerIndex % engineers.length],
      });
      engineerIndex++;
    }
  }

  return schedules;
}
