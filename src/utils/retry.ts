export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
}

export async function retryWithExponentialBackoff<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { maxAttempts = 4, baseDelayMs = 2000, maxDelayMs = 16000 } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on the last attempt
      if (attempt === maxAttempts) {
        break;
      }

      // Calculate delay: 2^(attempt-1) * baseDelayMs, capped at maxDelayMs
      const delay = Math.min(Math.pow(2, attempt - 1) * baseDelayMs, maxDelayMs);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // If we get here, all attempts failed
  throw lastError || new Error('Retry failed with unknown error');
}

export function createRetryWrapper<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options: RetryOptions = {},
) {
  return async (...args: TArgs): Promise<TReturn> => {
    return retryWithExponentialBackoff(() => fn(...args), options);
  };
}

export async function retryWithResult<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<RetryResult<T>> {
  const { maxAttempts = 4 } = options;

  try {
    const result = await retryWithExponentialBackoff(fn, options);
    return {
      success: true,
      result,
      attempts: 1, // We don't track exact attempts in the main function
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      attempts: maxAttempts,
    };
  }
}
