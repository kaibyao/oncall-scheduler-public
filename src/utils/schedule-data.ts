import { DateTime } from 'luxon';
import { type EngineerRotationAssignment, OncallRotationName } from '../schedule/schedule.types.js';
import { getAllOverrides, getAllUsers, getWorkloadHistory } from '../database/queries.js';
import { getRotationHours } from '../schedule/schedule.utils.js';

/**
 * Extended schedule assignment interface that includes override information
 */
export interface ScheduleAssignmentWithOverride extends EngineerRotationAssignment {
  override_engineer_email?: string;
  override_engineer_name?: string;
  final_engineer_email: string;
  final_engineer_name: string;
}

/**
 * Date range filter options for schedule data
 */
export interface ScheduleDateRange {
  startDate: DateTime;
  endDate: DateTime;
}

/**
 * Rotation time range with start and end times
 */
export interface RotationTimeRange {
  startTime: string; // HH:mm format
  endTime: string; // HH:mm format
  hours: number;
}

/**
 * Schedule entry with datetime range for Notion integration
 */
export interface ScheduleEntryWithDateTime extends ScheduleAssignmentWithOverride {
  dateTimeRange: {
    start: DateTime;
    end: DateTime;
  };
}

/**
 * Gets all schedule data from the database using the standard lookback period
 * @returns Array of schedule assignments
 */
export function getAllScheduleData(): EngineerRotationAssignment[] {
  // Calculate workload history days back using database user data
  // This replaces the constant calculation: new Set(Object.values(rotationEmails).flat()).size * 7
  const allUsers = getAllUsers();
  const uniqueUserEmails = new Set(allUsers.map((user) => user.email));
  const workloadHistoryDaysBack = uniqueUserEmails.size * 7;

  return getWorkloadHistory(workloadHistoryDaysBack);
}

/**
 * Combines schedule assignments with any existing overrides
 * @param scheduleAssignments - Base schedule assignments
 * @returns Schedule assignments with override information included
 */
export function getScheduleDataWithOverrides(
  scheduleAssignments: EngineerRotationAssignment[],
): ScheduleAssignmentWithOverride[] {
  const overrides = getAllOverrides();

  // Create a lookup map for overrides by date + rotation
  const overrideMap = new Map<string, EngineerRotationAssignment>();
  overrides.forEach((override) => {
    const key = `${override.date}-${override.rotation}`;
    overrideMap.set(key, override);
  });

  return scheduleAssignments.map((assignment) => {
    const key = `${assignment.date}-${assignment.rotation}`;
    const override = overrideMap.get(key);

    return {
      ...assignment,
      override_engineer_email: override?.engineer_email,
      override_engineer_name: override?.engineer_name,
      final_engineer_email: override?.engineer_email || assignment.engineer_email,
      final_engineer_name: override?.engineer_name || assignment.engineer_name,
    };
  });
}

/**
 * Computes the final engineer assignment, applying override logic
 * @param originalEngineer - The originally scheduled engineer email
 * @param overrideEngineer - The override engineer email (if any)
 * @returns The final engineer who should be on call
 */
export function computeFinalEngineerAssignment(originalEngineer: string, overrideEngineer?: string): string {
  return overrideEngineer || originalEngineer;
}

/**
 * Gets the time range for a specific rotation
 * @param rotation - The rotation type
 * @returns Object with start/end times and total hours
 */
export function getRotationTimeRange(rotation: OncallRotationName): RotationTimeRange {
  const timeRanges = {
    [OncallRotationName.AM]: { startTime: '09:00', endTime: '12:00' },
    [OncallRotationName.Core]: { startTime: '12:00', endTime: '18:00' },
    [OncallRotationName.PM]: { startTime: '18:00', endTime: '21:00' },
  };

  const timeRange = timeRanges[rotation];
  const hours = getRotationHours(rotation);

  return {
    ...timeRange,
    hours,
  };
}

/**
 * Formats a schedule assignment with full datetime range information
 * @param assignment - The schedule assignment
 * @param timezone - Timezone for the datetime calculation (defaults to America/Los_Angeles)
 * @returns Schedule entry with complete datetime range
 */
export function formatScheduleEntryWithDateTime(
  assignment: ScheduleAssignmentWithOverride,
  timezone: string = 'America/Los_Angeles',
): ScheduleEntryWithDateTime {
  const date = DateTime.fromFormat(assignment.date, 'yyyy-MM-dd', { zone: timezone });
  const timeRange = getRotationTimeRange(assignment.rotation);

  const [startHour, startMinute] = timeRange.startTime.split(':').map(Number);
  const [endHour, endMinute] = timeRange.endTime.split(':').map(Number);

  const startDateTime = date.set({ hour: startHour, minute: startMinute });
  const endDateTime = date.set({ hour: endHour, minute: endMinute });

  return {
    ...assignment,
    dateTimeRange: {
      start: startDateTime,
      end: endDateTime,
    },
  };
}

/**
 * Filters schedule data by a date range
 * @param scheduleData - Array of schedule assignments
 * @param dateRange - Start and end dates for filtering
 * @returns Filtered schedule assignments
 */
export function filterScheduleDataByDateRange(
  scheduleData: EngineerRotationAssignment[],
  dateRange: ScheduleDateRange,
): EngineerRotationAssignment[] {
  return scheduleData.filter((assignment) => {
    const assignmentDate = DateTime.fromFormat(assignment.date, 'yyyy-MM-dd');
    return assignmentDate >= dateRange.startDate && assignmentDate <= dateRange.endDate;
  });
}

/**
 * Gets the date range for the current business week (Monday-Friday)
 * @param timezone - Timezone for date calculations (defaults to America/Los_Angeles)
 * @returns Date range object for current week
 */
export function getCurrentWeekDateRange(timezone: string = 'America/Los_Angeles'): ScheduleDateRange {
  const now = DateTime.now().setZone(timezone);
  const startOfWeek = now.startOf('week'); // Monday
  const endOfWeek = startOfWeek.plus({ days: 4 }); // Friday

  return {
    startDate: startOfWeek,
    endDate: endOfWeek,
  };
}

/**
 * Gets the date range for the previous business week (Monday-Friday)
 * @param timezone - Timezone for date calculations (defaults to America/Los_Angeles)
 * @returns Date range object for previous week
 */
export function getPreviousWeekDateRange(timezone: string = 'America/Los_Angeles'): ScheduleDateRange {
  const now = DateTime.now().setZone(timezone);
  const startOfThisWeek = now.startOf('week');
  const startOfPreviousWeek = startOfThisWeek.minus({ weeks: 1 });
  const endOfPreviousWeek = startOfPreviousWeek.plus({ days: 4 }); // Friday

  return {
    startDate: startOfPreviousWeek,
    endDate: endOfPreviousWeek,
  };
}

/**
 * Checks if a given date is in the current business week
 * @param date - Date to check (string in yyyy-MM-dd format)
 * @param timezone - Timezone for date calculations (defaults to America/Los_Angeles)
 * @returns True if date is in current week
 */
export function isCurrentWeek(date: string, timezone: string = 'America/Los_Angeles'): boolean {
  const checkDate = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: timezone });
  const currentWeekRange = getCurrentWeekDateRange(timezone);
  return checkDate >= currentWeekRange.startDate && checkDate <= currentWeekRange.endDate;
}

/**
 * Checks if a given date is in the previous business week
 * @param date - Date to check (string in yyyy-MM-dd format)
 * @param timezone - Timezone for date calculations (defaults to America/Los_Angeles)
 * @returns True if date is in previous week
 */
export function isPreviousWeek(date: string, timezone: string = 'America/Los_Angeles'): boolean {
  const checkDate = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: timezone });
  const previousWeekRange = getPreviousWeekDateRange(timezone);
  return checkDate >= previousWeekRange.startDate && checkDate <= previousWeekRange.endDate;
}

/**
 * Checks if a given date is in the past (before today)
 * @param date - Date to check (string in yyyy-MM-dd format)
 * @param timezone - Timezone for date calculations (defaults to America/Los_Angeles)
 * @returns True if date is in the past
 */
export function isPastDate(date: string, timezone: string = 'America/Los_Angeles'): boolean {
  const checkDate = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: timezone });
  const today = DateTime.now().setZone(timezone).startOf('day');
  return checkDate < today;
}

export function isInCurrentBusinessWeek(date: string, timezone: string = 'America/Los_Angeles'): boolean {
  const checkDate = DateTime.fromFormat(date, 'yyyy-MM-dd', { zone: timezone });
  const now = DateTime.now().setZone(timezone);

  // Get the Monday of the current business week
  let currentBusinessWeekStart: DateTime;
  const currentDay = now.weekday; // 1 = Monday, 7 = Sunday

  if (currentDay === 6 || currentDay === 7) {
    // If today is Saturday (6) or Sunday (7), use the previous Monday as the current business week
    const daysFromPreviousMonday = currentDay === 6 ? 5 : 6; // Saturday: 5 days back, Sunday: 6 days back
    currentBusinessWeekStart = now.minus({ days: daysFromPreviousMonday }).startOf('day');
  } else {
    // For Monday-Friday, get the Monday of this week
    const daysFromMonday = currentDay - 1; // Monday = 0 days back, Tuesday = 1 day back, etc.
    currentBusinessWeekStart = now.minus({ days: daysFromMonday }).startOf('day');
  }

  // Calculate Friday of the current business week
  const currentBusinessWeekEnd = currentBusinessWeekStart.plus({ days: 4 }); // Friday

  // Check if the date falls within the current business week (Monday-Friday)
  return checkDate >= currentBusinessWeekStart && checkDate <= currentBusinessWeekEnd;
}

/**
 * Filters schedule data to exclude past entries
 * @param scheduleData - Array of schedule assignments
 * @param timezone - Timezone for date calculations (defaults to America/Los_Angeles)
 * @returns Filtered schedule assignments excluding past dates
 */
export function filterOutPastEntries<T extends { date: string }>(
  scheduleData: T[],
  timezone: string = 'America/Los_Angeles',
): T[] {
  return scheduleData.filter(
    (assignment) => !isPastDate(assignment.date, timezone) || isInCurrentBusinessWeek(assignment.date),
  );
}

/**
 * Filters schedule data to include only past entries
 * @param scheduleData - Array of schedule assignments
 * @param timezone - Timezone for date calculations (defaults to America/Los_Angeles)
 * @returns Filtered schedule assignments including only past dates
 */
export function filterOnlyPastEntries<T extends { date: string }>(
  scheduleData: T[],
  timezone: string = 'America/Los_Angeles',
): T[] {
  return scheduleData.filter((assignment) => isPastDate(assignment.date, timezone));
}

/**
 * Gets complete schedule data with overrides and datetime formatting
 * This is the main function that combines all the utilities for external consumption
 * @param timezone - Timezone for datetime calculations (defaults to America/Los_Angeles)
 * @param excludePastEntries - If true, excludes entries from past dates (defaults to false)
 * @returns Array of complete schedule entries with all information
 */
export function getCompleteScheduleData(
  timezone: string = 'America/Los_Angeles',
  excludePastEntries: boolean = false,
): ScheduleEntryWithDateTime[] {
  const scheduleData = getAllScheduleData();
  const scheduleWithOverrides = getScheduleDataWithOverrides(scheduleData);

  // Filter out past entries if requested
  const filteredData = excludePastEntries
    ? filterOutPastEntries(scheduleWithOverrides, timezone)
    : scheduleWithOverrides;

  return filteredData.map((assignment) => formatScheduleEntryWithDateTime(assignment, timezone));
}
