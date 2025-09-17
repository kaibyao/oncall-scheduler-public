import { DateTime } from 'luxon';

export function getOncallScheduleDates(startDate: DateTime, endDate: DateTime): DateTime[] {
  const dates: DateTime[] = [];
  let current = DateTime.fromJSDate(startDate.toJSDate());

  while (current < endDate) {
    if (current.weekday === 1) {
      // only schedule mondays, extrapolate to other weekdays later
      dates.push(current);
    }
    current = current.plus({ days: 1 });
  }

  return dates;
}

export function getWeekdaysInRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = DateTime.fromISO(startDate);
  const end = DateTime.fromISO(endDate);

  let current = start;

  while (current <= end) {
    // Only include weekdays (Monday = 1, Friday = 5)
    if (current.weekday >= 1 && current.weekday <= 5) {
      dates.push(current.toISODate()!);
    }
    current = current.plus({ days: 1 });
  }

  return dates;
}
