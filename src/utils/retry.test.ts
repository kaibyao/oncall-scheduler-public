import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retryWithExponentialBackoff, createRetryWrapper, retryWithResult, type RetryOptions } from './retry.js';

describe('retry utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('retryWithExponentialBackoff', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const promise = retryWithExponentialBackoff(mockFn);
      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
    });

    it('should retry with exponential backoff on failure', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('attempt 1'))
        .mockRejectedValueOnce(new Error('attempt 2'))
        .mockResolvedValue('success');

      const promise = retryWithExponentialBackoff(mockFn);

      // Don't await yet, advance timers first
      await vi.advanceTimersToNextTimerAsync(); // 2000ms delay
      await vi.advanceTimersToNextTimerAsync(); // 4000ms delay

      const result = await promise;

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should use correct exponential backoff delays', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('attempt 1'))
        .mockRejectedValueOnce(new Error('attempt 2'))
        .mockRejectedValueOnce(new Error('attempt 3'))
        .mockResolvedValue('success');

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const promise = retryWithExponentialBackoff(mockFn);

      // Advance through delays
      await vi.advanceTimersToNextTimerAsync(); // 2000ms
      await vi.advanceTimersToNextTimerAsync(); // 4000ms
      await vi.advanceTimersToNextTimerAsync(); // 8000ms

      await promise;

      // Check that setTimeout was called with correct delays
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 4000);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 8000);
    });

    it('should respect maxDelayMs cap', async () => {
      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('attempt 1'))
        .mockRejectedValueOnce(new Error('attempt 2'))
        .mockResolvedValue('success');

      const options: RetryOptions = {
        maxAttempts: 3,
        baseDelayMs: 5000,
        maxDelayMs: 8000,
      };

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      const promise = retryWithExponentialBackoff(mockFn, options);

      await vi.advanceTimersToNextTimerAsync(); // Should be 5000ms
      await vi.advanceTimersToNextTimerAsync(); // Should be capped at 8000ms, not 10000ms

      await promise;

      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 8000); // Capped
    });

    it('should fail after maxAttempts', async () => {
      // Use real timers for this test to avoid unhandled promise warnings
      vi.useRealTimers();

      const mockFn = vi.fn().mockRejectedValue(new Error('always fails'));

      const options: RetryOptions = { maxAttempts: 2, baseDelayMs: 1 }; // Very short delay for testing

      await expect(retryWithExponentialBackoff(mockFn, options)).rejects.toThrow('always fails');
      expect(mockFn).toHaveBeenCalledTimes(2);

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });

    it('should preserve error type', async () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = 'CustomError';
        }
      }

      const mockFn = vi.fn().mockRejectedValue(new CustomError('custom error'));

      const promise = retryWithExponentialBackoff(mockFn, { maxAttempts: 1 });

      await expect(promise).rejects.toThrow(CustomError);
    });

    it('should handle non-Error thrown values', async () => {
      const mockFn = vi.fn().mockRejectedValue('string error');

      const promise = retryWithExponentialBackoff(mockFn, { maxAttempts: 1 });

      await expect(promise).rejects.toThrow('string error');
    });
  });

  describe('createRetryWrapper', () => {
    it('should create a wrapped function with retry logic', async () => {
      const originalFn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValue('success');

      const wrappedFn = createRetryWrapper(originalFn, { maxAttempts: 2 });

      const promise = wrappedFn('arg1', 'arg2');
      await vi.advanceTimersToNextTimerAsync();
      const result = await promise;

      expect(result).toBe('success');
      expect(originalFn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(originalFn).toHaveBeenCalledTimes(2);
    });

    it('should preserve function arguments', async () => {
      const originalFn = vi.fn().mockResolvedValue('result');
      const wrappedFn = createRetryWrapper(originalFn);

      await wrappedFn(1, 'test', { key: 'value' });

      expect(originalFn).toHaveBeenCalledWith(1, 'test', { key: 'value' });
    });
  });

  describe('retryWithResult', () => {
    it('should return success result', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const result = await retryWithResult(mockFn);

      expect(result).toEqual({
        success: true,
        result: 'success',
        attempts: 1,
      });
    });

    it('should return failure result', async () => {
      const error = new Error('failed');
      const mockFn = vi.fn().mockRejectedValue(error);

      const promise = retryWithResult(mockFn, { maxAttempts: 2 });
      await vi.advanceTimersToNextTimerAsync();
      const result = await promise;

      expect(result).toEqual({
        success: false,
        error,
        attempts: 2,
      });
    });

    it('should handle non-Error thrown values in result', async () => {
      const mockFn = vi.fn().mockRejectedValue('string error');

      const result = await retryWithResult(mockFn, { maxAttempts: 1 });

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('string error');
    });
  });

  describe('default options', () => {
    it('should use default retry options when none provided', async () => {
      // Use real timers for this test to avoid unhandled promise warnings
      vi.useRealTimers();

      const mockFn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'))
        .mockRejectedValueOnce(new Error('fail'));

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      // Use short delays for real timer testing
      const options = { baseDelayMs: 1 }; // Very short delay for testing

      await expect(retryWithExponentialBackoff(mockFn, options)).rejects.toThrow('fail');

      expect(mockFn).toHaveBeenCalledTimes(4);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 1);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2);
      expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 4);

      // Restore fake timers for other tests
      vi.useFakeTimers();
    });
  });
});
