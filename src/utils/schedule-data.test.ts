import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DateTime } from 'luxon';
import {
  getAllScheduleData,
  getScheduleDataWithOverrides,
  computeFinalEngineerAssignment,
  getRotationTimeRange,
  formatScheduleEntryWithDateTime,
  filterScheduleDataByDateRange,
  getCurrentWeekDateRange,
  getPreviousWeekDateRange,
  isCurrentWeek,
  isPreviousWeek,
  getCompleteScheduleData,
  type ScheduleAssignmentWithOverride,
  type ScheduleDateRange,
} from './schedule-data.js';
import { type EngineerRotationAssignment, OncallRotationName, GhostEngPod } from '../schedule/schedule.types.js';

// Mock the database functions
vi.mock('../database/queries.js', () => ({
  getAllUsers: vi.fn(),
  getWorkloadHistory: vi.fn(),
  getCurrentOverrides: vi.fn(),
  getAllOverrides: vi.fn(),
}));

// Mock the utilities
vi.mock('../utils.js', () => ({
  getRotationHours: vi.fn((rotation: OncallRotationName) => {
    const hours = {
      [OncallRotationName.AM]: 3,
      [OncallRotationName.Core]: 6,
      [OncallRotationName.PM]: 3,
    };
    return hours[rotation];
  }),
}));

// Mock test users data (10 users = 70 days back)
const mockUsers = Array.from({ length: 10 }, (_, i) => ({
  email: `user${i + 1}@example.com`,
  name: `User ${i + 1}`,
  slack_user_id: null,
  notion_person_id: null,
  rotation: i < 5 ? 'AM' : 'PM',
  pod: GhostEngPod.Blinky, // Add missing pod field
  created_at: '2024-01-01 00:00:00',
  updated_at: '2024-01-01 00:00:00',
}));

describe('schedule-data utilities', () => {
  const mockScheduleData: EngineerRotationAssignment[] = [
    {
      engineer_email: 'alice@example.com',
      engineer_name: 'Alice',
      rotation: OncallRotationName.AM,
      date: '2024-01-15',
    },
    {
      engineer_email: 'bob@example.com',
      engineer_name: 'Bob',
      rotation: OncallRotationName.Core,
      date: '2024-01-15',
    },
    {
      engineer_email: 'charlie@example.com',
      engineer_name: 'Charlie',
      rotation: OncallRotationName.PM,
      date: '2024-01-15',
    },
  ];

  const mockOverrides: EngineerRotationAssignment[] = [
    {
      engineer_email: 'dave@example.com',
      engineer_name: 'Dave',
      rotation: OncallRotationName.AM,
      date: '2024-01-15',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAllScheduleData', () => {
    it('should call getWorkloadHistory with calculated parameters based on user count', async () => {
      const { getAllUsers, getWorkloadHistory } = await import('../database/queries.js');
      vi.mocked(getAllUsers).mockReturnValue(mockUsers);
      vi.mocked(getWorkloadHistory).mockReturnValue(mockScheduleData);

      const result = getAllScheduleData();

      // Should calculate: 10 unique users * 7 days = 70 days back
      expect(getWorkloadHistory).toHaveBeenCalledWith(70);
      expect(result).toEqual(mockScheduleData);
    });
  });

  describe('getScheduleDataWithOverrides', () => {
    it('should combine schedule data with overrides correctly', async () => {
      const { getCurrentOverrides, getAllOverrides } = await import('../database/queries.js');
      vi.mocked(getCurrentOverrides).mockReturnValue(mockOverrides);
      vi.mocked(getAllOverrides).mockReturnValue(mockOverrides);

      const result = getScheduleDataWithOverrides(mockScheduleData);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        ...mockScheduleData[0],
        override_engineer_email: 'dave@example.com',
        override_engineer_name: 'Dave',
        final_engineer_email: 'dave@example.com',
        final_engineer_name: 'Dave',
      });
      expect(result[1]).toEqual({
        ...mockScheduleData[1],
        override_engineer_email: undefined,
        override_engineer_name: undefined,
        final_engineer_email: 'bob@example.com',
        final_engineer_name: 'Bob',
      });
    });

    it('should handle empty overrides', async () => {
      const { getCurrentOverrides, getAllOverrides } = await import('../database/queries.js');
      vi.mocked(getCurrentOverrides).mockReturnValue([]);
      vi.mocked(getAllOverrides).mockReturnValue([]);

      const result = getScheduleDataWithOverrides(mockScheduleData);

      expect(result).toHaveLength(3);
      result.forEach((assignment, index) => {
        expect(assignment.override_engineer_email).toBeUndefined();
        expect(assignment.final_engineer_email).toBe(mockScheduleData[index].engineer_email);
      });
    });
  });

  describe('computeFinalEngineerAssignment', () => {
    it('should return override engineer when provided', () => {
      const result = computeFinalEngineerAssignment('alice@example.com', 'dave@example.com');
      expect(result).toBe('dave@example.com');
    });

    it('should return original engineer when no override', () => {
      const result = computeFinalEngineerAssignment('alice@example.com');
      expect(result).toBe('alice@example.com');
    });

    it('should return original engineer when override is undefined', () => {
      const result = computeFinalEngineerAssignment('alice@example.com', undefined);
      expect(result).toBe('alice@example.com');
    });
  });

  describe('getRotationTimeRange', () => {
    it('should return correct time ranges for each rotation', () => {
      const amRange = getRotationTimeRange(OncallRotationName.AM);
      expect(amRange).toEqual({
        startTime: '09:00',
        endTime: '12:00',
        hours: 3,
      });

      const coreRange = getRotationTimeRange(OncallRotationName.Core);
      expect(coreRange).toEqual({
        startTime: '12:00',
        endTime: '18:00',
        hours: 6,
      });

      const pmRange = getRotationTimeRange(OncallRotationName.PM);
      expect(pmRange).toEqual({
        startTime: '18:00',
        endTime: '21:00',
        hours: 3,
      });
    });
  });

  describe('formatScheduleEntryWithDateTime', () => {
    it('should format schedule entry with correct datetime range', () => {
      const assignment: ScheduleAssignmentWithOverride = {
        engineer_email: 'alice@example.com',
        engineer_name: 'Alice',
        rotation: OncallRotationName.AM,
        date: '2024-01-15',
        final_engineer_email: 'alice@example.com',
        final_engineer_name: 'Alice',
      };

      const result = formatScheduleEntryWithDateTime(assignment, 'America/Los_Angeles');

      expect(result.dateTimeRange.start.toFormat('yyyy-MM-dd HH:mm')).toBe('2024-01-15 09:00');
      expect(result.dateTimeRange.end.toFormat('yyyy-MM-dd HH:mm')).toBe('2024-01-15 12:00');
      expect(result.dateTimeRange.start.zoneName).toBe('America/Los_Angeles');
    });
  });

  describe('filterScheduleDataByDateRange', () => {
    it('should filter schedule data within date range', () => {
      const testData: EngineerRotationAssignment[] = [
        {
          engineer_email: 'alice@example.com',
          engineer_name: 'Alice',
          rotation: OncallRotationName.AM,
          date: '2024-01-14',
        },
        {
          engineer_email: 'bob@example.com',
          engineer_name: 'Bob',
          rotation: OncallRotationName.AM,
          date: '2024-01-15',
        },
        {
          engineer_email: 'charlie@example.com',
          engineer_name: 'Charlie',
          rotation: OncallRotationName.AM,
          date: '2024-01-16',
        },
        {
          engineer_email: 'dave@example.com',
          engineer_name: 'Dave',
          rotation: OncallRotationName.AM,
          date: '2024-01-17',
        },
      ];

      const dateRange: ScheduleDateRange = {
        startDate: DateTime.fromISO('2024-01-15'),
        endDate: DateTime.fromISO('2024-01-16'),
      };

      const result = filterScheduleDataByDateRange(testData, dateRange);

      expect(result).toHaveLength(2);
      expect(result[0].date).toBe('2024-01-15');
      expect(result[1].date).toBe('2024-01-16');
    });
  });

  describe('date range functions', () => {
    // Note: These tests use fixed dates to ensure consistency
    it('should get current week date range', () => {
      // Mock the current date to Monday, January 15, 2024
      const mockNow = DateTime.fromISO('2024-01-15T10:00:00', { zone: 'America/Los_Angeles' }) as DateTime<true>;
      vi.spyOn(DateTime, 'now').mockReturnValue(mockNow);

      const result = getCurrentWeekDateRange('America/Los_Angeles');

      expect(result.startDate.toFormat('yyyy-MM-dd')).toBe('2024-01-15'); // Monday
      expect(result.endDate.toFormat('yyyy-MM-dd')).toBe('2024-01-19'); // Friday
    });

    it('should get previous week date range', () => {
      // Mock the current date to Monday, January 15, 2024
      const mockNow = DateTime.fromISO('2024-01-15T10:00:00', { zone: 'America/Los_Angeles' }) as DateTime<true>;
      vi.spyOn(DateTime, 'now').mockReturnValue(mockNow);

      const result = getPreviousWeekDateRange('America/Los_Angeles');

      expect(result.startDate.toFormat('yyyy-MM-dd')).toBe('2024-01-08'); // Previous Monday
      expect(result.endDate.toFormat('yyyy-MM-dd')).toBe('2024-01-12'); // Previous Friday
    });
  });

  describe('week checking functions', () => {
    it('should correctly identify current week dates', () => {
      // Mock the current date to Wednesday, January 17, 2024
      const mockNow = DateTime.fromISO('2024-01-17T10:00:00', { zone: 'America/Los_Angeles' }) as DateTime<true>;
      vi.spyOn(DateTime, 'now').mockReturnValue(mockNow);

      expect(isCurrentWeek('2024-01-15', 'America/Los_Angeles')).toBe(true); // Monday of current week
      expect(isCurrentWeek('2024-01-19', 'America/Los_Angeles')).toBe(true); // Friday of current week
      expect(isCurrentWeek('2024-01-08', 'America/Los_Angeles')).toBe(false); // Previous week
      expect(isCurrentWeek('2024-01-22', 'America/Los_Angeles')).toBe(false); // Next week
    });

    it('should correctly identify previous week dates', () => {
      // Mock the current date to Wednesday, January 17, 2024
      const mockNow = DateTime.fromISO('2024-01-17T10:00:00', { zone: 'America/Los_Angeles' }) as DateTime<true>;
      vi.spyOn(DateTime, 'now').mockReturnValue(mockNow);

      expect(isPreviousWeek('2024-01-08', 'America/Los_Angeles')).toBe(true); // Monday of previous week
      expect(isPreviousWeek('2024-01-12', 'America/Los_Angeles')).toBe(true); // Friday of previous week
      expect(isPreviousWeek('2024-01-15', 'America/Los_Angeles')).toBe(false); // Current week
      expect(isPreviousWeek('2024-01-01', 'America/Los_Angeles')).toBe(false); // Earlier week
    });
  });

  describe('integration functions', () => {
    it('should get complete schedule data with all transformations', async () => {
      const { getAllUsers, getWorkloadHistory, getCurrentOverrides, getAllOverrides } = await import(
        '../database/queries.js'
      );
      vi.mocked(getAllUsers).mockReturnValue(mockUsers);
      vi.mocked(getWorkloadHistory).mockReturnValue(mockScheduleData);
      vi.mocked(getCurrentOverrides).mockReturnValue(mockOverrides);
      vi.mocked(getAllOverrides).mockReturnValue(mockOverrides);

      const result = getCompleteScheduleData('America/Los_Angeles');

      expect(result).toHaveLength(3);
      expect(result[0]).toHaveProperty('dateTimeRange');
      expect(result[0]).toHaveProperty('final_engineer_email');
      expect(result[0].final_engineer_email).toBe('dave@example.com'); // Override applied
    });
  });
});
