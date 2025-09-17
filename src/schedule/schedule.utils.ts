import { DateTime } from 'luxon';
import { OncallRotationName, type EngineerRotationAssignment } from './schedule.types.js';
import { Logger } from '../logger.js';

const logger = new Logger('schedule-utils');

export function getRotationHours(rotation: OncallRotationName): number {
  // Hours per rotation (matching the service logic)
  const rotationHours = {
    [OncallRotationName.AM]: 3, // 9-12
    [OncallRotationName.Core]: 6, // 12-18
    [OncallRotationName.PM]: 3, // 18-21
  };
  return rotationHours[rotation];
}

export function printSolutionDiagnostics(solution: EngineerRotationAssignment[]): void {
  // Group assignments by engineer email
  const engineerStats = new Map<
    string,
    {
      rotationCounts: Record<OncallRotationName, number>;
      totalHours: number;
    }
  >();

  // Initialize stats for each engineer
  const allEngineers = new Set(solution.map((s) => s.engineer_email));
  for (const engineerEmail of allEngineers) {
    engineerStats.set(engineerEmail, {
      rotationCounts: {
        [OncallRotationName.AM]: 0,
        [OncallRotationName.Core]: 0,
        [OncallRotationName.PM]: 0,
      },
      totalHours: 0,
    });
  }

  // Count assignments and calculate hours
  for (const assignment of solution) {
    const stats = engineerStats.get(assignment.engineer_email)!;
    stats.rotationCounts[assignment.rotation]++;
    stats.totalHours += getRotationHours(assignment.rotation);
  }

  // Print stats for each engineer
  const logLines = ['=== ONCALL SCHEDULE DIAGNOSTICS ==='];
  for (const [email, stats] of engineerStats) {
    logLines.push(`📧 ${email}`);
    logLines.push(`  AM: ${stats.rotationCounts[OncallRotationName.AM]} assignments`);
    logLines.push(`  Core: ${stats.rotationCounts[OncallRotationName.Core]} assignments`);
    logLines.push(`  PM: ${stats.rotationCounts[OncallRotationName.PM]} assignments`);
    logLines.push(`  Total Hours: ${stats.totalHours}`);
    logLines.push('');
  }

  // Print summary statistics
  const totalAssignments = solution.length;
  const totalHours = Array.from(engineerStats.values()).reduce((sum, stats) => sum + stats.totalHours, 0);
  const avgHoursPerEngineer = totalHours / engineerStats.size;

  logLines.push('=== SUMMARY ===');
  logLines.push(`Total Assignments: ${totalAssignments}`);
  logLines.push(`Total Hours: ${totalHours}`);
  logLines.push(`Engineers: ${engineerStats.size}`);
  logLines.push(`Average Hours per Engineer: ${avgHoursPerEngineer.toFixed(1)}`);

  logger.info(logLines.join('\n'), { engineerStats });
}

export function extrapolateSolutionToAllDays(
  mondayAssignments: EngineerRotationAssignment[],
): EngineerRotationAssignment[] {
  // Because the solution only contains assignments for Mondays, we need to add the assignments for the rest of the days
  const solutionWithAllDaysInSchedule = [];
  for (const mondayAssignment of mondayAssignments) {
    let iterateThroughOtherWeekdaysDate = DateTime.fromFormat(mondayAssignment.date, 'yyyy-MM-dd', {
      zone: 'America/Los_Angeles',
    });

    // Iterate through the other weekdays of the week, stop after we reach Saturday
    while (iterateThroughOtherWeekdaysDate.weekday < 6) {
      solutionWithAllDaysInSchedule.push({
        engineer_email: mondayAssignment.engineer_email,
        engineer_name: mondayAssignment.engineer_name,
        date: iterateThroughOtherWeekdaysDate.toFormat('yyyy-MM-dd'),
        rotation: mondayAssignment.rotation,
      });
      iterateThroughOtherWeekdaysDate = iterateThroughOtherWeekdaysDate.plus({ days: 1 });
    }
  }

  return solutionWithAllDaysInSchedule;
}
