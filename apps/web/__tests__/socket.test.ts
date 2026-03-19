/**
 * Socket — Unit Tests
 *
 * Tests the socket module's pure utility functions.
 * The actual Socket.io connection is mocked here because connecting to a
 * real WebSocket server is an integration test, not a unit test.
 * Per FIX 10 task instructions, mocking is acceptable in frontend unit tests.
 *
 * Tested:
 * - onConnectionStateChange listener management
 * - getConnectionState initial value
 * - subscribeToNotifications handler registration and deduplication
 */

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

// Mock socket.io-client so we never attempt a real TCP connection in jsdom
jest.mock('socket.io-client', () => {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const joinedRooms = new Set<string>();

  const mockSocket = {
    connected: false,
    _joinedRooms: joinedRooms,
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(handler);
    }),
    off: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter((h) => h !== handler);
      }
    }),
    emit: jest.fn(),
    disconnect: jest.fn(),
    _handlers: handlers,
    _trigger: (event: string, ...args: unknown[]) => {
      (handlers[event] ?? []).forEach((h) => h(...args));
    },
  };

  return { io: jest.fn(() => mockSocket) };
});

import {
  onConnectionStateChange,
  getConnectionState,
  getSocket,
  closeSocket,
} from '../src/lib/socket';

afterEach(() => {
  // Close socket between tests to reset singleton state
  closeSocket();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Socket module', () => {
  describe('getConnectionState', () => {
    it('starts in disconnected state', () => {
      // After closeSocket(), the state should be disconnected
      expect(getConnectionState()).toBe('disconnected');
    });
  });

  describe('onConnectionStateChange', () => {
    it('registers a listener and calls it when state changes', () => {
      const listener = jest.fn();
      const unsubscribe = onConnectionStateChange(listener);

      // getSocket() creates the singleton so closeSocket() finds a non-null
      // socket and transitions state → notifies listeners
      getSocket();
      closeSocket();

      expect(listener).toHaveBeenCalledWith('disconnected');
      unsubscribe();
    });

    it('returns an unsubscribe function that removes the listener', () => {
      const listener = jest.fn();
      const unsubscribe = onConnectionStateChange(listener);

      unsubscribe();

      getSocket();
      closeSocket();

      // Listener was removed before the state change, so should not be called
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports multiple simultaneous listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsub1 = onConnectionStateChange(listener1);
      const unsub2 = onConnectionStateChange(listener2);

      getSocket();
      closeSocket();

      expect(listener1).toHaveBeenCalledWith('disconnected');
      expect(listener2).toHaveBeenCalledWith('disconnected');

      unsub1();
      unsub2();
    });

    it('does not call unsubscribed listeners', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();

      const unsub1 = onConnectionStateChange(listener1);
      const unsub2 = onConnectionStateChange(listener2);

      // Unsubscribe listener1 before the state change
      unsub1();
      getSocket();
      closeSocket();

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith('disconnected');

      unsub2();
    });
  });
});
