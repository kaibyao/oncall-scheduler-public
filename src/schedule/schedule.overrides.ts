import { Logger } from '../logger.js';
import type { OverrideRotationAssignmentLambdaTask } from '../aws.types.js';
import { validateOverrideRequest } from '../utils/validation.js';
import { upsertOverrides } from '../database/queries.js';
import { getWeekdaysInRange } from '../utils/date.js';
import { regenerateScheduleForDateRange } from './schedule.generation.js';
import { findEngineersBeingReplaced } from '../database/queries.js';
import { notifyOverrideAssignment } from './schedule.notifications.js';

const logger = new Logger('schedule-override');

// Custom error classes for specific error handling
export class OverrideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OverrideValidationError';
  }
}

export class DatabaseOperationError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
  ) {
    super(message);
    this.name = 'DatabaseOperationError';
  }
}

export class ScheduleRegenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScheduleRegenerationError';
  }
}

export class NotionSyncError extends Error {
  constructor(
    message: string,
    public readonly notionDetails?: unknown,
  ) {
    super(message);
    this.name = 'NotionSyncError';
  }
}

export async function overrideSchedule(overrideRotationAssignment: OverrideRotationAssignmentLambdaTask) {
  logger.info('overrideRotationAssignment', overrideRotationAssignment);

  try {
    // Validate the override request
    let validationResult;
    try {
      validationResult = validateOverrideRequest(
        overrideRotationAssignment.start_date,
        overrideRotationAssignment.end_date,
        overrideRotationAssignment.rotation,
        overrideRotationAssignment.engineer_email,
      );
    } catch (error) {
      throw new OverrideValidationError(
        `Validation process failed: ${error instanceof Error ? error.message : 'Unknown validation error'}`,
      );
    }

    if (!validationResult.isValid) {
      logger.error('Validation failed:', validationResult.error);
      throw new OverrideValidationError(validationResult.error || 'Unknown validation error');
    }

    // Expand date range to individual dates (excluding weekends)
    let datesToOverride;
    try {
      datesToOverride = getWeekdaysInRange(overrideRotationAssignment.start_date, overrideRotationAssignment.end_date);
    } catch (error) {
      throw new OverrideValidationError(
        `Failed to process date range: ${error instanceof Error ? error.message : 'Unknown date processing error'}`,
      );
    }

    if (datesToOverride.length === 0) {
      throw new OverrideValidationError('No valid weekdays found in the specified date range');
    }

    // Find engineers who will be replaced (for notifications)
    let affectedEngineers;
    try {
      affectedEngineers = findEngineersBeingReplaced(datesToOverride, overrideRotationAssignment.rotation);
    } catch (error) {
      throw new DatabaseOperationError(
        `Failed to find affected engineers: ${error instanceof Error ? error.message : 'Unknown database error'}`,
        'findEngineersBeingReplaced',
      );
    }

    // Persist overrides to database
    const overrideRecords = datesToOverride.map((date) => ({
      date,
      rotation: overrideRotationAssignment.rotation,
      engineer_email: overrideRotationAssignment.engineer_email,
    }));

    try {
      await upsertOverrides(overrideRecords);
      logger.info(`Successfully persisted ${overrideRecords.length} override records`);
    } catch (error) {
      throw new DatabaseOperationError(
        `Failed to persist override records: ${error instanceof Error ? error.message : 'Unknown database error'}`,
        'upsertOverrides',
      );
    }

    // Regenerate schedule for affected date range
    try {
      await regenerateScheduleForDateRange(overrideRotationAssignment.start_date, overrideRotationAssignment.end_date);
    } catch (error) {
      // If schedule regeneration fails, we should still consider the override successful
      // since the overrides are already persisted, but we should log the error
      const scheduleError = new ScheduleRegenerationError(
        `Failed to regenerate schedule: ${error instanceof Error ? error.message : 'Unknown schedule error'}`,
      );
      logger.error('Schedule regeneration failed, but override was persisted:', scheduleError);

      // Continue with notifications even if schedule regeneration failed
    }

    // Send notifications to affected engineers
    try {
      const notificationResult = await notifyOverrideAssignment(
        overrideRotationAssignment.engineer_email,
        affectedEngineers,
        datesToOverride,
        overrideRotationAssignment.rotation,
      );

      logger.info('Notification result:', notificationResult);

      // Don't fail the entire operation if notifications fail
      if (!notificationResult.success) {
        logger.warn('Some notifications failed, but override was successful', {
          errors: notificationResult.errors,
        });
      }
    } catch (notificationError) {
      // Log the error but don't fail the override operation
      logger.error('Notification system encountered an unexpected error:', notificationError);
    }

    return {
      success: true,
      message: `Successfully overridden ${datesToOverride.length} dates for ${overrideRotationAssignment.rotation} rotation`,
      overridden_dates: datesToOverride,
      replaced_engineers: affectedEngineers,
    };
  } catch (error) {
    // Handle specific error types with appropriate responses
    if (error instanceof OverrideValidationError) {
      logger.error('Validation error:', error.message);
      return {
        success: false,
        error: error.message,
        error_type: 'VALIDATION_ERROR',
      };
    }

    if (error instanceof DatabaseOperationError) {
      logger.error(`Database operation error in ${error.operation}:`, error.message);
      return {
        success: false,
        error: `Database operation failed: ${error.message}`,
        error_type: 'DATABASE_ERROR',
        operation: error.operation,
      };
    }

    if (error instanceof ScheduleRegenerationError) {
      logger.error('Schedule regeneration error:', error.message);
      return {
        success: false,
        error: `Schedule regeneration failed: ${error.message}`,
        error_type: 'SCHEDULE_ERROR',
      };
    }

    if (error instanceof NotionSyncError) {
      logger.error('Notion sync error:', { message: error.message, notionDetails: error.notionDetails });
      return {
        success: false,
        error: `Notion sync failed: ${error.message}`,
        error_type: 'NOTION_ERROR',
        details: error.notionDetails,
      };
    }

    // Generic error handling for unexpected errors
    logger.error('Unexpected error processing override request:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
      error_type: 'UNKNOWN_ERROR',
    };
  }
}
