/**
 * Timer utilities — centralized wrapper around browser timer APIs.
 *
 * Components should use these helpers instead of raw setTimeout/setInterval
 * to keep timer usage auditable and provide async-friendly patterns.
 */

/**
 * Async delay — returns a promise that resolves after the given milliseconds.
 * Use with `await delay(ms)` in async loops instead of raw setTimeout callbacks.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms); // eslint-disable-line no-restricted-globals
  });
}

/**
 * Managed interval that auto-cleans on unmount.
 * Returns a cleanup function for use in useEffect return.
 *
 * @param callback - Function to call on each tick
 * @param ms - Interval in milliseconds
 * @returns Cleanup function that clears the interval
 */
export function createInterval(
  callback: () => void,
  ms: number,
): () => void {
  const id = globalThis.setInterval(callback, ms); // eslint-disable-line no-restricted-globals
  return () => globalThis.clearInterval(id); // eslint-disable-line no-restricted-globals
}

/**
 * Managed timeout that auto-cleans on unmount.
 * Returns a cleanup function for use in useEffect return.
 *
 * @param callback - Function to call after the delay
 * @param ms - Delay in milliseconds
 * @returns Cleanup function that clears the timeout
 */
export function createTimeout(
  callback: () => void,
  ms: number,
): () => void {
  const id = globalThis.setTimeout(callback, ms); // eslint-disable-line no-restricted-globals
  return () => globalThis.clearTimeout(id); // eslint-disable-line no-restricted-globals
}

/**
 * Debounce helper — delays invoking callback until after `ms` milliseconds
 * since the last invocation. Returns the debounced function and a cancel function.
 */
export function debounce<T extends (...args: never[]) => void>(
  callback: T,
  ms: number,
): { fn: (...args: Parameters<T>) => void; cancel: () => void } {
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null; // eslint-disable-line no-restricted-globals

  const fn = (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId); // eslint-disable-line no-restricted-globals
    }
    timeoutId = globalThis.setTimeout(() => { // eslint-disable-line no-restricted-globals
      callback(...args);
      timeoutId = null;
    }, ms);
  };

  const cancel = () => {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId); // eslint-disable-line no-restricted-globals
      timeoutId = null;
    }
  };

  return { fn, cancel };
}
