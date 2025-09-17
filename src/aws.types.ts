import type { OncallRotationName } from './schedule/schedule.types.js';

/** The types of tasks that the Lambda function can run. */
export enum LambdaTask {
  GENERATE_SCHEDULE = 'generate_schedule',
  OVERRIDE_ROTATION_ASSIGNMENT = 'override_rotation_assignment',
  // In case there's a need to re-generate the schedule
  RESET_SCHEDULE = 'reset_schedule',
  // Repair corrupt SQLite database
  REPAIR_DATABASE = 'repair_database',
}

/** Lets the Lambda function know to generate assignments. */
export interface GenerateScheduleLambdaTask {
  task: LambdaTask.GENERATE_SCHEDULE;
}

/** Object containing data necessary to create a rotation override. */
export interface OverrideRotationAssignmentLambdaTask {
  task: LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT;
  start_date: string;
  end_date: string;
  rotation: OncallRotationName;
  engineer_email: string;
}

export interface ResetScheduleLambdaTask {
  task: LambdaTask.RESET_SCHEDULE;
}

export interface RepairDatabaseLambdaTask {
  task: LambdaTask.REPAIR_DATABASE;
}

/** The required object necessary for the Lambda function to know what task to run. */
export type LambdaHandlerEvent =
  | GenerateScheduleLambdaTask
  | OverrideRotationAssignmentLambdaTask
  | ResetScheduleLambdaTask
  | RepairDatabaseLambdaTask;
