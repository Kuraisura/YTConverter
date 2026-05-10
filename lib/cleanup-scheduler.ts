import { Redis } from '@upstash/redis';
import { deleteObjectFromR2, deleteObjectsByPrefix } from './r2-storage';
import { logInfo, logWarning, logError, ErrorType, getErrorMessage } from './helpers';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export interface CleanupTask {
  jobId: string;
  scheduledFor: number; // timestamp
  attemptCount: number;
  lastError?: string;
}

/**
 * Schedule a cleanup task for a job
 * Called after job completion to delete R2 files after a grace period
 */
export async function scheduleCleanup(
  jobId: string,
  delayMs: number = 60000 // 1 minute default grace period
): Promise<void> {
  try {
    const scheduledFor = Date.now() + delayMs;
    const task: CleanupTask = {
      jobId,
      scheduledFor,
      attemptCount: 0,
    };

    // Add to cleanup queue (sorted set) - score is when to execute
    await redis.zadd('cleanup:queue', {
      score: scheduledFor,
      member: JSON.stringify(task),
    });

    logInfo('CLEANUP_SCHEDULER', `Job scheduled for cleanup`, {
      jobId,
      scheduledFor: new Date(scheduledFor).toISOString(),
      delayMs,
    });
  } catch (error) {
    logError(
      {
        type: ErrorType.CLEANUP,
        details: { jobId, delayMs },
        originalError: error instanceof Error ? error : undefined,
      },
      'Error scheduling cleanup task'
    );
    throw error;
  }
}

/**
 * Process a single cleanup task
 * Deletes R2 files and expires Redis job data
 */
export async function processCleanupTask(task: CleanupTask): Promise<boolean> {
  try {
    logInfo('CLEANUP_PROCESSOR', `Starting cleanup for job`, { jobId: task.jobId });

    // Clean up R2 files (delete full prefix conversions/{jobId}/)
    const prefix = `conversions/${task.jobId}/`;
    let deletedCount = 0;

    try {
      await deleteObjectsByPrefix(prefix);
      deletedCount = 1; // We don't get exact count easily from API
      logInfo('CLEANUP_PROCESSOR', `Deleted R2 objects under prefix`, { jobId: task.jobId, prefix });
    } catch (err) {
      // Fallback: try deleting individual known keys
      logWarning('CLEANUP_PROCESSOR', 'Prefix deletion failed, trying individual deletions', {
        jobId: task.jobId,
        error: getErrorMessage(err),
      });

      const r2Keys = [
        `conversions/${task.jobId}/result.mp3`,
        `conversions/${task.jobId}/result.mp4`,
        `conversions/${task.jobId}/result.zip`,
      ];

      for (const key of r2Keys) {
        try {
          await deleteObjectFromR2(key);
          deletedCount++;
          logInfo('CLEANUP_PROCESSOR', `Deleted individual R2 object`, { jobId: task.jobId, key });
        } catch (error) {
          // NoSuchKey is expected for keys that don't exist
          if (!getErrorMessage(error).includes('NoSuchKey')) {
            logWarning('CLEANUP_PROCESSOR', `Error deleting object`, {
              jobId: task.jobId,
              key,
              error: getErrorMessage(error),
            });
          }
        }
      }
    }

    // Optionally delete job data immediately or set to expire in 1 hour
    try {
      const deleteImmediate = (process.env.CLEANUP_DELETE_JOB_IMMEDIATE || 'false').toLowerCase() === 'true';
      if (deleteImmediate) {
        await redis.del(`job:${task.jobId}`);
        logInfo('CLEANUP_PROCESSOR', `Job data deleted immediately from Redis`, { jobId: task.jobId });
      } else {
        await redis.expire(`job:${task.jobId}`, 3600); // 1 hour TTL after cleanup
        logInfo('CLEANUP_PROCESSOR', `Job data set to expire in 1 hour`, { jobId: task.jobId });
      }
    } catch (error) {
      logWarning('CLEANUP_PROCESSOR', `Error setting expiration on job data`, {
        jobId: task.jobId,
        error: getErrorMessage(error),
      });
    }

    // Remove cleanup queue entry
    await redis.zrem('cleanup:queue', JSON.stringify(task));

    logInfo('CLEANUP_PROCESSOR', `Successfully cleaned up job`, {
      jobId: task.jobId,
      filesDeleted: deletedCount,
    });

    return true;
  } catch (error) {
    logError(
      {
        type: ErrorType.CLEANUP,
        details: { jobId: task.jobId, attemptCount: task.attemptCount },
        originalError: error instanceof Error ? error : undefined,
      },
      'Error processing cleanup task'
    );

    // Increment retry count and reschedule for later
    task.attemptCount++;
    task.lastError = error instanceof Error ? error.message : 'Unknown error';

    if (task.attemptCount < 3) {
      const retryDelay = Math.min(5 * 60 * 1000, task.attemptCount * 2 * 60 * 1000); // 5-10 min retry
      const newScheduledFor = Date.now() + retryDelay;

      await redis.zadd('cleanup:queue', {
        score: newScheduledFor,
        member: JSON.stringify(task),
      });

      logWarning('CLEANUP_PROCESSOR', `Rescheduled cleanup for retry`, {
        jobId: task.jobId,
        attempt: task.attemptCount,
        nextRetryMs: retryDelay,
      });
    } else {
      // Max retries exceeded
      logError(
        {
          type: ErrorType.CLEANUP,
          details: { jobId: task.jobId, maxAttempts: 3, lastError: task.lastError },
        },
        'Max retries exceeded for cleanup task'
      );

      await redis.zadd('cleanup:failed', {
        score: Date.now(),
        member: JSON.stringify(task),
      });
    }

    return false;
  }
}

/**
 * Process all pending cleanup tasks (call this periodically)
 * Designed to be called by a Cron trigger or scheduled endpoint
 */
export async function processPendingCleanups(): Promise<{ processed: number; failed: number }> {
  try {
    const now = Date.now();
    logInfo('CLEANUP_SCHEDULER', `Processing pending cleanups`, {
      timestamp: new Date(now).toISOString(),
    });

    // Get all tasks scheduled for now or earlier (up to 100)
    const tasks = await redis.zrange('cleanup:queue', 0, now, {
      byScore: true,
      limit: { offset: 0, count: 100 },
    } as any);

    let processed = 0;
    let failed = 0;

    for (const taskStr of tasks) {
      try {
        const task: CleanupTask = JSON.parse(taskStr as string);
        const success = await processCleanupTask(task);
        if (success) {
          processed++;
        } else {
          failed++;
        }
      } catch (error) {
        logError(
          {
            type: ErrorType.CLEANUP,
            originalError: error instanceof Error ? error : undefined,
          },
          'Error parsing cleanup task'
        );
        failed++;
      }
    }

    logInfo('CLEANUP_SCHEDULER', `Cleanup processing complete`, {
      processed,
      failed,
      total: tasks.length,
    });

    return { processed, failed };
  } catch (error) {
    logError(
      {
        type: ErrorType.CLEANUP,
        originalError: error instanceof Error ? error : undefined,
      },
      'Error in pending cleanups processor'
    );
    return { processed: 0, failed: 0 };
  }
}

/**
 * Get pending cleanup tasks (for monitoring)
 */
export async function getPendingCleanups(): Promise<CleanupTask[]> {
  try {
    const tasks = await redis.zrange('cleanup:queue', 0, -1);
    return tasks.map((task) => JSON.parse(task as string) as CleanupTask);
  } catch (error) {
    console.error('[Cleanup Scheduler] Error getting pending cleanups:', error);
    return [];
  }
}

/**
 * Get failed cleanup tasks (for monitoring/debugging)
 */
export async function getFailedCleanups(): Promise<CleanupTask[]> {
  try {
    const tasks = await redis.zrange('cleanup:failed', 0, -1);
    return tasks.map((task) => JSON.parse(task as string) as CleanupTask);
  } catch (error) {
    console.error('[Cleanup Scheduler] Error getting failed cleanups:', error);
    return [];
  }
}

/**
 * Retry a failed cleanup task
 */
export async function retryFailedCleanup(jobId: string): Promise<void> {
  try {
    const tasks = await redis.zrange('cleanup:failed', 0, -1);
    const task = tasks.find((t) => {
      const parsed = JSON.parse(t as string) as CleanupTask;
      return parsed.jobId === jobId;
    });

    if (!task) {
      throw new Error(`Failed cleanup task not found for job ${jobId}`);
    }

    const parsedTask: CleanupTask = JSON.parse(task as string);
    await redis.zrem('cleanup:failed', task as string);

    // Reschedule with attempt count reset
    parsedTask.attemptCount = 0;
    parsedTask.scheduledFor = Date.now() + 30000; // 30 sec

    await redis.zadd('cleanup:queue', {
      score: parsedTask.scheduledFor,
      member: JSON.stringify(parsedTask),
    });

    console.log(`[Cleanup Scheduler] Retried cleanup for job ${jobId}`);
  } catch (error) {
    console.error('[Cleanup Scheduler] Error retrying cleanup:', error);
    throw error;
  }
}
