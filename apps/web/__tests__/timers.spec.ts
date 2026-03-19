/**
 * Timer Utilities — Unit Tests
 *
 * Tests all timer utility functions with REAL timers.
 * No jest.useFakeTimers, no mocking — real setTimeout/setInterval with
 * short durations.
 */
import { delay, createInterval, createTimeout, debounce } from '../src/lib/timers';

describe('Timer Utilities', () => {
  describe('delay', () => {
    it('should return a promise that resolves after the given milliseconds', async () => {
      const start = Date.now();
      await delay(50);
      const elapsed = Date.now() - start;

      // Should have waited at least 40ms (allowing some timer imprecision)
      expect(elapsed).toBeGreaterThanOrEqual(40);
    });

    it('should resolve with undefined', async () => {
      const result = await delay(10);
      expect(result).toBeUndefined();
    });

    it('should resolve for 0ms delay', async () => {
      const start = Date.now();
      await delay(0);
      const elapsed = Date.now() - start;

      // 0ms delay should resolve almost immediately
      expect(elapsed).toBeLessThan(50);
    });

    it('should allow multiple concurrent delays', async () => {
      const start = Date.now();
      await Promise.all([delay(30), delay(30), delay(30)]);
      const elapsed = Date.now() - start;

      // All three run concurrently, so total should be ~30ms not 90ms
      expect(elapsed).toBeLessThan(100);
      expect(elapsed).toBeGreaterThanOrEqual(25);
    });
  });

  describe('createInterval', () => {
    it('should call callback at regular intervals', async () => {
      let callCount = 0;
      const cleanup = createInterval(() => {
        callCount++;
      }, 30);

      // Wait enough time for a few ticks
      await delay(110);
      cleanup();

      // Should have been called at least 2 times (30ms interval over 110ms)
      expect(callCount).toBeGreaterThanOrEqual(2);
    });

    it('should return a cleanup function that stops the interval', async () => {
      let callCount = 0;
      const cleanup = createInterval(() => {
        callCount++;
      }, 20);

      await delay(70);
      cleanup();
      const countAfterCleanup = callCount;

      // Wait more time to ensure no more calls happen
      await delay(60);

      expect(callCount).toBe(countAfterCleanup);
    });

    it('should not call callback after cleanup', async () => {
      let callCount = 0;
      const cleanup = createInterval(() => {
        callCount++;
      }, 15);

      // Immediately clean up
      cleanup();

      await delay(50);

      // Should not have been called (or at most once if it squeezed in)
      expect(callCount).toBeLessThanOrEqual(1);
    });
  });

  describe('createTimeout', () => {
    it('should call callback after the specified delay', async () => {
      let called = false;
      createTimeout(() => {
        called = true;
      }, 30);

      // Before timeout
      expect(called).toBe(false);

      // Wait for timeout to fire
      await delay(60);
      expect(called).toBe(true);
    });

    it('should return a cleanup function that prevents the callback', async () => {
      let called = false;
      const cleanup = createTimeout(() => {
        called = true;
      }, 30);

      // Cancel before it fires
      cleanup();

      await delay(60);
      expect(called).toBe(false);
    });

    it('should not call callback when cleaned up immediately', async () => {
      let called = false;
      const cleanup = createTimeout(() => {
        called = true;
      }, 10);

      cleanup();
      await delay(30);
      expect(called).toBe(false);
    });

    it('should support 0ms timeout', async () => {
      let called = false;
      createTimeout(() => {
        called = true;
      }, 0);

      // 0ms timeout fires on next tick
      await delay(20);
      expect(called).toBe(true);
    });
  });

  describe('debounce', () => {
    it('should delay callback execution until after wait period', async () => {
      let callCount = 0;
      const { fn } = debounce(() => {
        callCount++;
      }, 50);

      fn();
      expect(callCount).toBe(0);

      await delay(70);
      expect(callCount).toBe(1);
    });

    it('should reset the timer on each call', async () => {
      let callCount = 0;
      const { fn } = debounce(() => {
        callCount++;
      }, 50);

      fn();
      await delay(30);
      fn(); // Reset the timer
      await delay(30);
      // Timer was reset, so callback should not have fired yet
      expect(callCount).toBe(0);

      await delay(40);
      // Now it should have fired once
      expect(callCount).toBe(1);
    });

    it('should only call callback once for rapid successive calls', async () => {
      let callCount = 0;
      const { fn } = debounce(() => {
        callCount++;
      }, 40);

      fn();
      fn();
      fn();
      fn();
      fn();

      await delay(70);
      expect(callCount).toBe(1);
    });

    it('should provide a cancel function that prevents the callback', async () => {
      let called = false;
      const { fn, cancel } = debounce(() => {
        called = true;
      }, 30);

      fn();
      cancel();

      await delay(60);
      expect(called).toBe(false);
    });

    it('should allow new calls after cancel', async () => {
      let callCount = 0;
      const { fn, cancel } = debounce(() => {
        callCount++;
      }, 30);

      fn();
      cancel();

      // Start a new debounced call
      fn();
      await delay(50);
      expect(callCount).toBe(1);
    });

    it('should cancel be idempotent when no pending timeout', () => {
      const { cancel } = debounce(() => {
        // no-op
      }, 30);

      // Should not throw when no pending timeout
      cancel();
      cancel();
    });

    it('should execute callback with correct arguments', async () => {
      let receivedArgs: [string, number] | null = null;
      const { fn } = debounce((...args: [string, number]) => {
        receivedArgs = args;
      }, 30);

      fn('hello', 42);

      await delay(50);
      expect(receivedArgs).toEqual(['hello', 42]);
    });

    it('should use the latest arguments when called multiple times', async () => {
      let receivedValue: string | null = null;
      const { fn } = debounce((...args: [string]) => {
        receivedValue = args[0];
      }, 30);

      fn('first');
      fn('second');
      fn('third');

      await delay(50);
      expect(receivedValue).toBe('third');
    });

    it('should allow multiple independent debounced functions', async () => {
      let count1 = 0;
      let count2 = 0;

      const debounced1 = debounce(() => {
        count1++;
      }, 30);

      const debounced2 = debounce(() => {
        count2++;
      }, 30);

      debounced1.fn();
      debounced2.fn();

      await delay(50);
      expect(count1).toBe(1);
      expect(count2).toBe(1);
    });
  });
});
