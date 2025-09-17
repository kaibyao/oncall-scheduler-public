import 'dotenv/config';

import { validateEnvironmentVariables } from './config.js';

import db from './database/db.js';
import { runScheduleGeneration } from './schedule/schedule.generation.js';
import { Logger } from './logger.js';
import { LambdaTask, type LambdaHandlerEvent } from './aws.types.js';
import { overrideSchedule } from './schedule/schedule.overrides.js';
import { seedAllData, seedNewData } from '../scripts/seed-data.js';
import { runMigrations } from './database/migration-runner.js';
import { repairDatabase } from './database/repair.js';

const logger = new Logger('main');

// Lambda handler for AWS Lambda execution
export async function handler(event?: LambdaHandlerEvent) {
  if (!event) {
    logger.error('Required `event` parameter is missing (see `LambdaHandlerEvent` in the aws.types.ts file).');
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Required `event` parameter is missing (see `LambdaHandlerEvent` in the aws.types.ts file).',
      }),
    };
  }

  // Validate environment variables based on task type
  const requireNotion = event.task === LambdaTask.GENERATE_SCHEDULE;
  const envValidation = validateEnvironmentVariables(requireNotion);

  if (!envValidation.valid) {
    const errorMessage = `Missing required environment variables: ${envValidation.missing.join(', ')}`;
    logger.error(errorMessage);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Configuration error',
        details: errorMessage,
      }),
    };
  }

  try {
    // Skip migrations for repair task since database might be corrupt
    if (event.task !== LambdaTask.REPAIR_DATABASE) {
      seedNewData();
    }

    const result = await runTask(event);

    // Include task result in response body for better visibility
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Oncall task completed successfully',
        result,
      }),
    };
  } catch (error) {
    logger.error('Error running task:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Oncall task failed.',
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
}

// For direct execution (non-Lambda)
if (import.meta.url === new URL(process.argv[1], 'file://').href) {
  handler({ task: LambdaTask.GENERATE_SCHEDULE }).catch(logger.error);
}

// Main execution logic
async function runTask(event: LambdaHandlerEvent): Promise<unknown> {
  switch (event.task) {
    case LambdaTask.GENERATE_SCHEDULE:
      return runScheduleGeneration();
    case LambdaTask.OVERRIDE_ROTATION_ASSIGNMENT:
      return overrideSchedule(event);
    case LambdaTask.RESET_SCHEDULE:
      logger.info('Resetting schedule and seeding data...');
      await seedAllData();
      logger.info('Schedule reset completed');
      return { scheduleReset: true };
    case LambdaTask.REPAIR_DATABASE: {
      logger.info('Starting database repair...');
      const repairResult = await repairDatabase();
      if (repairResult.success) {
        logger.info('Database repair completed successfully');
        runMigrations(db);
      } else {
        logger.error('Database repair failed:', repairResult.errors);
      }
      return repairResult;
    }
    default:
      logger.error('Unhandled event `task`.', event);
      throw new Error(`Unhandled event task: ${(event as LambdaHandlerEvent).task}`);
  }
}
