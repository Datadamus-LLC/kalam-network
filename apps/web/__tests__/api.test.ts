/**
 * API Client — Unit Tests
 *
 * Tests the ApiClient class in isolation using fetch mocks.
 * Per FIX 10 task instructions, mocking fetch IS acceptable in frontend
 * browser unit tests. The no-mock rule applies only to backend integration tests.
 */

// Stub env before importing api so it can resolve
jest.mock('../src/lib/env', () => ({
  env: {
    NEXT_PUBLIC_API_URL: 'http://localhost:3001/api/v1',
    NEXT_PUBLIC_WS_URL: 'http://localhost:3001',
    NEXT_PUBLIC_HEDERA_NETWORK: 'testnet',
    NEXT_PUBLIC_HASHSCAN_URL: 'https://hashscan.io',
    NEXT_PUBLIC_ENABLE_CHAT: true,
    NEXT_PUBLIC_ENABLE_PAYMENTS: true,
  },
}));

// AbortSignal.timeout is not implemented in jsdom — polyfill it so the api
// client's timeout logic does not crash before reaching the fetch mock.
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms: number): AbortSignal => {
    const controller = new AbortController();
    setTimeout(() => {
      const err = new DOMException('The operation was aborted.', 'TimeoutError');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (controller.signal as any).reason = err;
      controller.abort(err);
    }, ms);
    return controller.signal;
  };
}

import { api, ApiError } from '../src/lib/api';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : String(status),
    json: () => Promise.resolve(body),
    headers: new Headers(),
    redirected: false,
    type: 'basic',
    url: '',
    body: null,
    bodyUsed: false,
    clone: () => makeResponse(body, status),
    text: () => Promise.resolve(JSON.stringify(body)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
  } as Response;
}

const originalFetch = global.fetch;

beforeEach(() => {
  // Reset localStorage between tests
  localStorage.clear();
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ApiClient', () => {
  describe('error envelope parsing', () => {
    it('throws ApiError with message from body.message string', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        makeResponse({ message: 'Invalid credentials' }, 400),
      );

      let caught: unknown;
      try {
        await api.login({ method: 'email', value: 'test@test.com' });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).message).toBe('Invalid credentials');
    });

    it('throws ApiError with joined message when body.message is an array', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        makeResponse({ message: ['Field A is required', 'Field B is required'] }, 400),
      );

      let caught: unknown;
      try {
        await api.getKycStatus();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).message).toBe('Field A is required; Field B is required');
    });

    it('falls back to status text when body is not parseable JSON', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ...makeResponse({}, 503),
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
        statusText: 'Service Unavailable',
      } as Response);

      let caught: unknown;
      try {
        await api.getKycStatus();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).message).toBe('503 Service Unavailable');
    });

    it('has correct status code on ApiError', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        makeResponse({ message: 'Not found' }, 404),
      );

      let caught: unknown;
      try {
        await api.getKycStatus();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).status).toBe(404);
    });
  });

  describe('401 handling — clears tokens and redirects', () => {
    it('clears token and refreshToken in localStorage on 401', async () => {
      // Set up stored auth state
      localStorage.setItem(
        'hedera-social-auth',
        JSON.stringify({
          state: {
            token: 'valid-jwt',
            refreshToken: 'valid-refresh',
            isAuthenticated: true,
          },
        }),
      );

      // Assign a no-op location mock before the call
      const originalLocation = window.location;
      Object.defineProperty(window, 'location', {
        value: { ...originalLocation, href: '' },
        writable: true,
        configurable: true,
      });

      global.fetch = jest.fn().mockResolvedValue(
        makeResponse({ message: 'Unauthorized' }, 401),
      );

      try {
        await api.getKycStatus();
      } catch {
        // Expected to throw
      }

      const stored = localStorage.getItem('hedera-social-auth');
      expect(stored).not.toBeNull();
      const parsed = JSON.parse(stored!);
      expect(parsed.state.token).toBeNull();
      expect(parsed.state.refreshToken).toBeNull();
      expect(parsed.state.isAuthenticated).toBe(false);

      // Restore original location
      Object.defineProperty(window, 'location', {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    });

    it('redirects to /login on 401', async () => {
      const mockLocation = { href: '' };
      Object.defineProperty(window, 'location', {
        value: mockLocation,
        writable: true,
        configurable: true,
      });

      global.fetch = jest.fn().mockResolvedValue(
        makeResponse({ message: 'Unauthorized' }, 401),
      );

      try {
        await api.getKycStatus();
      } catch {
        // Expected
      }

      expect(mockLocation.href).toBe('/login');

      // Restore
      Object.defineProperty(window, 'location', {
        value: window.location,
        writable: true,
        configurable: true,
      });
    });
  });

  describe('request timeout', () => {
    it('throws ApiError with 408 status when AbortSignal fires TimeoutError', async () => {
      global.fetch = jest.fn().mockImplementation(() => {
        const err = new DOMException('The operation was aborted.', 'TimeoutError');
        return Promise.reject(err);
      });

      let caught: unknown;
      try {
        await api.getKycStatus();
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(ApiError);
      expect((caught as ApiError).status).toBe(408);
      expect((caught as ApiError).message).toBe('Request timed out. Please try again.');
    });
  });

  describe('successful requests', () => {
    it('returns unwrapped data for getKycStatus', async () => {
      global.fetch = jest.fn().mockResolvedValue(
        makeResponse({
          success: true,
          data: { status: 'approved', kycLevel: 'basic', canResubmit: false },
        }),
      );

      const result = await api.getKycStatus();
      expect(result.status).toBe('approved');
      expect(result.kycLevel).toBe('basic');
      expect(result.canResubmit).toBe(false);
    });

    it('handles 204 No Content responses', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ...makeResponse(null, 204),
        ok: true,
        status: 204,
      } as Response);

      // removeMember returns the raw fetch result which can be undefined for 204
      // This tests the 204 handling path in the request method
      const result = await api.markNotificationsAsRead(['notif-1']);
      expect(result).toBeUndefined();
    });
  });
});
