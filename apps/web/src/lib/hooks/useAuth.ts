'use client';

import { useAuthStore } from '@/stores/auth.store';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const store = useAuthStore();
  const router = useRouter();

  const logout = () => {
    store.logout();
    router.push('/');
  };

  const setAuthToken = (token: string) => {
    store.setToken(token);
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', token);
    }
  };

  return {
    user: store.user,
    token: store.token,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    error: store.error,
    setUser: store.setUser,
    setToken: setAuthToken,
    setError: store.setError,
    setIsLoading: store.setIsLoading,
    logout,
  };
}
