import { create } from 'zustand';

export interface User {
  id: string;
  hederaAccountId: string;
  displayName?: string;
  accountType?: 'individual' | 'business';
  status: string;
  kycLevel?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  setUser: (user: User | null) => void;
  setToken: (token: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setToken: (token) => set({ token }),
  setIsLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth_token');
    }
    set({ user: null, token: null, isAuthenticated: false });
  },
}));

// Hydrate auth store from localStorage on app start
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('auth_token');
  if (token) {
    useAuthStore.setState({ token, isAuthenticated: true });
  }
}
