/**
 * Frontend test setup for @hedera-social/web.
 *
 * Configures the jsdom test environment with browser API polyfills.
 * These are real (no-op) implementations, NOT jest.fn() mocks.
 *
 * Note: For API testing, the frontend connects to the REAL backend
 * which connects to REAL PostgreSQL, Redis, and Hedera.
 */

// Polyfill browser APIs not available in jsdom.
// These are real implementations (no-op where appropriate), NOT mocking.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {
      // Deprecated API — no-op is the correct real behavior
    },
    removeListener: () => {
      // Deprecated API — no-op is the correct real behavior
    },
    addEventListener: () => {
      // Real no-op: jsdom doesn't support media query change events
    },
    removeEventListener: () => {
      // Real no-op: jsdom doesn't support media query change events
    },
    dispatchEvent: () => false,
  }),
});

// Polyfill IntersectionObserver for components that use it
class IntersectionObserverPolyfill {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  observe(): void {
    // Real no-op: jsdom doesn't support layout
  }

  unobserve(): void {
    // Real no-op
  }

  disconnect(): void {
    // Real no-op
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  value: IntersectionObserverPolyfill,
});

// Polyfill ResizeObserver for components that use it
class ResizeObserverPolyfill {
  observe(): void {
    // Real no-op: jsdom doesn't support layout
  }

  unobserve(): void {
    // Real no-op
  }

  disconnect(): void {
    // Real no-op
  }
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverPolyfill,
});
