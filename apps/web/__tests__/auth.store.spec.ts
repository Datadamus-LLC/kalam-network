/**
 * Auth Store — Unit Tests
 *
 * Tests the Zustand auth store with real store operations.
 * No mocking — the store runs its actual logic.
 */
import { useAuthStore, type AuthUser } from '../src/stores/auth.store';

describe('Auth Store (Zustand)', () => {
  beforeEach(() => {
    // Reset store to initial state between tests
    useAuthStore.setState({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
      onboardingStep: 'idle',
      registrationId: null,
      registrationMethod: null,
      registrationValue: null,
      screeningId: null,
    });
  });

  describe('setUser', () => {
    it('should set user and mark as authenticated', () => {
      const testUser: AuthUser = {
        id: '123',
        hederaAccountId: '0.0.12345',
        displayName: 'Test User',
        status: 'active',
      };

      useAuthStore.getState().setUser(testUser);

      const state = useAuthStore.getState();
      expect(state.user).toEqual(testUser);
      expect(state.isAuthenticated).toBe(true);
    });

    it('should clear authentication when user is set to null', () => {
      // First set a user
      useAuthStore.getState().setUser({
        id: '123',
        hederaAccountId: '0.0.12345',
        status: 'active',
      });
      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Then clear it
      useAuthStore.getState().setUser(null);

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });

  describe('setTokens', () => {
    it('should store access and refresh tokens', () => {
      useAuthStore.getState().setTokens('jwt-token-value', 'refresh-token-value');
      const state = useAuthStore.getState();
      expect(state.token).toBe('jwt-token-value');
      expect(state.refreshToken).toBe('refresh-token-value');
    });
  });

  describe('setIsLoading', () => {
    it('should toggle loading state', () => {
      useAuthStore.getState().setIsLoading(true);
      expect(useAuthStore.getState().isLoading).toBe(true);

      useAuthStore.getState().setIsLoading(false);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      useAuthStore.getState().setError('Authentication failed');
      expect(useAuthStore.getState().error).toBe('Authentication failed');
    });

    it('should clear error when set to null', () => {
      useAuthStore.getState().setError('Some error');
      useAuthStore.getState().setError(null);
      expect(useAuthStore.getState().error).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear user, token, and authentication state', () => {
      // Set up authenticated state
      useAuthStore.getState().setUser({
        id: '123',
        hederaAccountId: '0.0.12345',
        status: 'active',
      });
      useAuthStore.getState().setTokens('jwt-token', 'refresh-token');

      expect(useAuthStore.getState().isAuthenticated).toBe(true);

      // Logout
      useAuthStore.getState().logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.token).toBeNull();
      expect(state.refreshToken).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });
  });
});
