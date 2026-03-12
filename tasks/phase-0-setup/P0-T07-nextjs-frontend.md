# P0-T07: Next.js Frontend Setup

| Field | Value |
|-------|-------|
| Task ID | P0-T07 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 3 hours |
| Depends On | P0-T01 (Monorepo Init) |
| Phase | 0 — Project Setup |
| Assignee | Frontend developer |

---

## Objective

Set up the Next.js frontend (`apps/web`) with complete project structure, state management, API client, real-time WebSocket integration, and reusable component library. After this task, the frontend skeleton is ready for UI pages and features in Phase 1.

---

## Background

**Next.js** is a React framework that provides:
- App Router (file-based routing in `app/` directory)
- Server and Client Components
- Built-in optimization (image, font, code splitting)
- Full-stack capabilities (API routes, middleware)

The Hedera Social Frontend uses:
- **Zustand** for state management (lightweight, no Redux boilerplate)
- **TanStack Query** for server state management (caching, refetching)
- **Socket.io** for real-time features (typing indicators, new messages)
- **Tailwind CSS** for styling

---

## Pre-requisites

- P0-T01 complete (monorepo exists, pnpm works)
- Node.js v18+ and pnpm installed
- Basic React knowledge

---

## Step-by-Step Instructions

### Step 1: Create Next.js project with create-next-app

```bash
cd apps/web

# Generate Next.js project with TypeScript, Tailwind, App Router
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint

# When prompted:
# ✔ Would you like to use TypeScript? → Yes
# ✔ Would you like to use ESLint? → No (we'll configure it separately)
# ✔ Would you like to use Tailwind CSS? → Yes
# ✔ Would you like your code inside a `src/` directory? → Yes
# ✔ Would you like to use App Router? → Yes
# ✔ Would you like to use Turbopack? → No (experimental, skip for stability)
# ✔ Would you like to customize the import alias? → No (use default @/*)
```

### Step 2: Update package.json with all dependencies

Replace `apps/web/package.json` with:

```json
{
  "name": "@hedera-social/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@hookform/resolvers": "^3.3.4",
    "@tanstack/react-query": "^5.28.0",
    "class-validator": "^0.14.0",
    "clsx": "^2.1.0",
    "date-fns": "^3.0.0",
    "lucide-react": "^0.292.0",
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.50.0",
    "socket.io-client": "^4.7.2",
    "zustand": "^4.4.7"
  },
  "devDependencies": {
    "@types/node": "^20.10.6",
    "@types/react": "^18.2.46",
    "@types/react-dom": "^18.2.18",
    "autoprefixer": "^10.4.17",
    "postcss": "^8.4.33",
    "tailwindcss": "^3.4.1",
    "typescript": "^5.3.3"
  }
}
```

Install dependencies:

```bash
cd /sessions/exciting-sharp-mayer/mnt/social-platform  # go to repo root
pnpm install
```

### Step 3: Create tsconfig.json for web package

Create `apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "dom", "dom.iterable"],
    "jsx": "preserve",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "incremental": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@hedera-social/shared": ["../../packages/shared/src"],
      "@hedera-social/shared/*": ["../../packages/shared/src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### Step 4: Create environment template

Create `apps/web/.env.example`:

```env
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=ws://localhost:3002

# Hedera Network (for client-side reference)
NEXT_PUBLIC_HEDERA_NETWORK=testnet

# IPFS / Pinata
NEXT_PUBLIC_PINATA_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
```

Create `apps/web/.env.local` (for development):

```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=ws://localhost:3002
NEXT_PUBLIC_HEDERA_NETWORK=testnet
NEXT_PUBLIC_PINATA_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
```

### Step 5: Create the src directory structure

```bash
cd apps/web/src

# Create directory structure
mkdir -p app/{auth,app}
mkdir -p lib/{api,hooks,utils}
mkdir -p stores
mkdir -p components/{ui,auth,chat,feed,payments,profile,layout}
mkdir -p types
```

### Step 6: Create the API client

Create `apps/web/src/lib/api.ts`:

```typescript
/**
 * API Client for Hedera Social Platform
 * Handles all HTTP communication with the backend
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface RequestOptions extends RequestInit {
  params?: Record<string, string | number | boolean>;
}

class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Build a complete URL with query parameters
   */
  private buildUrl(path: string, params?: Record<string, unknown>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== null && value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    return url.toString();
  }

  /**
   * Get JWT token from localStorage
   */
  private getAuthToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('auth_token');
  }

  /**
   * Make an HTTP request with automatic JWT injection
   */
  private async request<T>(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const url = this.buildUrl(path, options.params);
    const token = this.getAuthToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      method,
      headers,
    });

    if (!response.ok) {
      throw new ApiError(
        `API error: ${response.status} ${response.statusText}`,
        response.status,
      );
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  // Auth endpoints
  async register(email: string) {
    return this.request<{
      registrationId: string;
      otpSent: boolean;
      expiresAt: string;
    }>('POST', '/auth/register', {
      body: JSON.stringify({ method: 'email', value: email }),
    });
  }

  async verifyOtp(registrationId: string, otp: string) {
    return this.request<{
      token: string;
      user: { id: string; hederaAccountId: string; status: string };
    }>('POST', '/auth/verify-otp', {
      body: JSON.stringify({ registrationId, otp }),
    });
  }

  async submitKyc(accountType: 'individual' | 'business', data: FormData) {
    const token = this.getAuthToken();
    const headers: HeadersInit = {};

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const url = this.buildUrl('/auth/kyc');
    data.append('accountType', accountType);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: data,
    });

    if (!response.ok) {
      throw new Error(`KYC submission failed: ${response.statusText}`);
    }

    return response.json();
  }

  async getKycStatus() {
    return this.request<{
      status: 'submitted' | 'approved' | 'rejected' | 'pending_review';
      kycLevel: string;
      didNftSerial: number;
      didNftMetadataCid: string;
    }>('GET', '/auth/kyc-status');
  }

  // Profile endpoints
  async getProfile(accountId: string) {
    return this.request('GET', `/profile/${accountId}`);
  }

  async updateProfile(data: {
    displayName?: string;
    bio?: string;
    avatar?: string;
  }) {
    return this.request('PUT', '/profile/me', {
      body: JSON.stringify(data),
    });
  }

  // Messaging endpoints
  async createConversation(
    type: 'direct' | 'group',
    participants: string[],
    groupName?: string,
  ) {
    return this.request('POST', '/conversations', {
      body: JSON.stringify({
        type,
        participants,
        groupName,
      }),
    });
  }

  async getConversations(limit = 20, cursor?: string) {
    return this.request('GET', '/conversations', {
      params: { limit, cursor },
    });
  }

  async getConversationMessages(topicId: string, limit = 50, before?: number) {
    return this.request('GET', `/conversations/${topicId}/messages`, {
      params: { limit, before },
    });
  }

  async sendMessage(topicId: string, encryptedPayload: string, nonce: string) {
    return this.request('POST', `/conversations/${topicId}/messages`, {
      body: JSON.stringify({ encryptedPayload, nonce }),
    });
  }

  async addConversationMember(topicId: string, accountId: string) {
    return this.request('POST', `/conversations/${topicId}/members`, {
      body: JSON.stringify({ accountId }),
    });
  }

  // Social endpoints
  async createPost(content: string, media?: string[]) {
    return this.request('POST', '/social/posts', {
      body: JSON.stringify({ content, media }),
    });
  }

  async getHomeFeed(limit = 20, cursor?: string) {
    return this.request('GET', '/social/feed', {
      params: { limit, cursor },
    });
  }

  async getUserFeed(accountId: string, limit = 20, cursor?: string) {
    return this.request('GET', `/social/feed/${accountId}`, {
      params: { limit, cursor },
    });
  }

  async followUser(accountId: string) {
    return this.request('POST', '/social/follows', {
      body: JSON.stringify({ accountId }),
    });
  }

  async unfollowUser(accountId: string) {
    return this.request('DELETE', `/social/follows/${accountId}`);
  }

  // Payments endpoints
  async sendPayment(topicId: string, recipientId: string, amount: number) {
    return this.request('POST', `/conversations/${topicId}/payments`, {
      body: JSON.stringify({ recipientId, amount }),
    });
  }

  async requestPayment(topicId: string, amount: number, note?: string) {
    return this.request('POST', `/conversations/${topicId}/payment-requests`, {
      body: JSON.stringify({ amount, note }),
    });
  }

  async getPaymentHistory(limit = 50, cursor?: string) {
    return this.request('GET', '/payments/history', {
      params: { limit, cursor },
    });
  }

  // Notifications endpoints
  async getNotifications(limit = 50, cursor?: string) {
    return this.request('GET', '/notifications', {
      params: { limit, cursor },
    });
  }

  async markNotificationAsRead(notificationId: string) {
    return this.request('PUT', `/notifications/${notificationId}`, {
      body: JSON.stringify({ read: true }),
    });
  }
}

export const api = new ApiClient();
```

### Step 7: Create the Socket.io client

Create `apps/web/src/lib/socket.ts`:

```typescript
/**
 * Socket.io client for real-time features
 * Singleton instance shared across the app
 */

import { io, Socket } from 'socket.io-client';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002';

let socket: Socket | null = null;

/**
 * Get or create the Socket.io connection
 */
export function getSocket(): Socket {
  if (socket) {
    return socket;
  }

  socket = io(WS_URL, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling'],
  });

  socket.on('connect', () => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const logger = console; // Use browser console in development only
      logger.log('WebSocket connected:', socket?.id);
    }
  });

  socket.on('disconnect', () => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const logger = console; // Use browser console in development only
      logger.log('WebSocket disconnected');
    }
  });

  socket.on('error', (error) => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      const logger = console; // Use browser console in development only
      logger.error('WebSocket error:', error);
    }
  });

  return socket;
}

/**
 * Close the Socket.io connection
 */
export function closeSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Subscribe to a conversation's messages
 */
export function subscribeToConversation(
  topicId: string,
  onMessage: (message: Record<string, unknown>) => void,
) {
  const s = getSocket();
  s.on(`conversation:${topicId}`, onMessage);

  // Return unsubscribe function
  return () => {
    s.off(`conversation:${topicId}`, onMessage);
  };
}

/**
 * Subscribe to typing indicators
 */
export function subscribeToTyping(
  topicId: string,
  onTyping: (data: { accountId: string; isTyping: boolean }) => void,
) {
  const s = getSocket();
  s.on(`typing:${topicId}`, onTyping);
  return () => {
    s.off(`typing:${topicId}`, onTyping);
  };
}

/**
 * Send a typing indicator
 */
export function sendTypingIndicator(topicId: string, isTyping: boolean) {
  const s = getSocket();
  s.emit('typing', { topicId, isTyping });
}

/**
 * Subscribe to notifications
 */
export function subscribeToNotifications(
  onNotification: (notification: Record<string, unknown>) => void,
) {
  const s = getSocket();
  s.on('notification', onNotification);
  return () => {
    s.off('notification', onNotification);
  };
}
```

### Step 8: Create Zustand stores

Create `apps/web/src/stores/auth.store.ts`:

```typescript
import { create } from 'zustand';

interface User {
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
    set({ user: null, token: null, isAuthenticated: false });
    localStorage.removeItem('auth_token');
  },
}));

// Hydrate auth store from localStorage on app start
if (typeof window !== 'undefined') {
  const token = localStorage.getItem('auth_token');
  if (token) {
    useAuthStore.setState({ token, isAuthenticated: true });
  }
}
```

Create `apps/web/src/stores/chat.store.ts`:

```typescript
import { create } from 'zustand';

interface Conversation {
  id: string;
  hcsTopicId: string;
  type: 'direct' | 'group';
  participants: Array<{ accountId: string; displayName?: string }>;
  lastMessage?: string;
  unreadCount: number;
}

interface ChatMessage {
  id: string;
  topicId: string;
  senderAccountId: string;
  encryptedPayload: string;
  nonce: string;
  timestamp: string;
}

interface ChatState {
  conversations: Conversation[];
  activeConversation: Conversation | null;
  messages: ChatMessage[];
  typingUsers: Set<string>;

  setConversations: (conversations: Conversation[]) => void;
  setActiveConversation: (conversation: Conversation | null) => void;
  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  addTypingUser: (accountId: string) => void;
  removeTypingUser: (accountId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversation: null,
  messages: [],
  typingUsers: new Set(),

  setConversations: (conversations) => set({ conversations }),
  setActiveConversation: (activeConversation) => set({ activeConversation }),
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  setMessages: (messages) => set({ messages }),
  addTypingUser: (accountId) =>
    set((state) => ({
      typingUsers: new Set(state.typingUsers).add(accountId),
    })),
  removeTypingUser: (accountId) =>
    set((state) => {
      const newTyping = new Set(state.typingUsers);
      newTyping.delete(accountId);
      return { typingUsers: newTyping };
    }),
}));
```

Create `apps/web/src/stores/feed.store.ts`:

```typescript
import { create } from 'zustand';

interface Post {
  id: string;
  authorAccountId: string;
  content: string;
  createdAt: string;
  likes?: number;
  replies?: number;
  media?: string[];
}

interface FeedState {
  posts: Post[];
  isLoading: boolean;
  hasMore: boolean;
  cursor?: string;

  setPosts: (posts: Post[]) => void;
  addPosts: (posts: Post[]) => void;
  setIsLoading: (loading: boolean) => void;
  setHasMore: (hasMore: boolean) => void;
  setCursor: (cursor: string | undefined) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  posts: [],
  isLoading: false,
  hasMore: true,
  cursor: undefined,

  setPosts: (posts) => set({ posts }),
  addPosts: (posts) => set((state) => ({ posts: [...state.posts, ...posts] })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setHasMore: (hasMore) => set({ hasMore }),
  setCursor: (cursor) => set({ cursor }),
}));
```

### Step 9: Create custom hooks

Create `apps/web/src/lib/hooks/useAuth.ts`:

```typescript
import { useAuthStore } from '@/stores/auth.store';
import { useRouter } from 'next/navigation';

export function useAuth() {
  const store = useAuthStore();
  const router = useRouter();

  const logout = () => {
    store.logout();
    router.push('/auth/login');
  };

  const setAuthToken = (token: string) => {
    store.setToken(token);
    localStorage.setItem('auth_token', token);
  };

  return {
    user: store.user,
    token: store.token,
    isAuthenticated: store.isAuthenticated,
    isLoading: store.isLoading,
    error: store.error,
    setUser: store.setUser,
    setToken: setAuthToken,
    logout,
  };
}
```

Create `apps/web/src/lib/hooks/useConversation.ts`:

```typescript
import { useChatStore } from '@/stores/chat.store';
import { subscribeToConversation, subscribeToTyping } from '@/lib/socket';
import { useEffect } from 'react';

export function useConversation(topicId?: string) {
  const store = useChatStore();

  useEffect(() => {
    if (!topicId) return;

    const unsubscribeMessages = subscribeToConversation(topicId, (message) => {
      store.addMessage(message);
    });

    const unsubscribeTyping = subscribeToTyping(
      topicId,
      ({ accountId, isTyping }) => {
        if (isTyping) {
          store.addTypingUser(accountId);
        } else {
          store.removeTypingUser(accountId);
        }
      },
    );

    return () => {
      unsubscribeMessages();
      unsubscribeTyping();
    };
  }, [topicId, store]);

  return {
    messages: store.messages,
    typingUsers: Array.from(store.typingUsers),
    addMessage: store.addMessage,
  };
}
```

Create `apps/web/src/lib/hooks/useSocket.ts`:

```typescript
import { useEffect } from 'react';
import { getSocket, closeSocket } from '@/lib/socket';

export function useSocket() {
  useEffect(() => {
    // Connect socket on mount
    const socket = getSocket();

    return () => {
      // Don't disconnect on unmount (socket is global)
      // just remove listeners
    };
  }, []);

  return {
    socket: getSocket(),
  };
}
```

Create `apps/web/src/lib/hooks/index.ts`:

```typescript
export { useAuth } from './useAuth';
export { useConversation } from './useConversation';
export { useSocket } from './useSocket';
```

### Step 10: Create basic UI components

Create `apps/web/src/components/ui/Button.tsx`:

```typescript
import React from 'react';
import clsx from 'clsx';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(
        'font-medium rounded-lg transition-colors',
        {
          'bg-blue-600 hover:bg-blue-700 text-white': variant === 'primary',
          'bg-gray-200 hover:bg-gray-300 text-gray-800': variant === 'secondary',
          'bg-red-600 hover:bg-red-700 text-white': variant === 'danger',
          'px-3 py-1 text-sm': size === 'sm',
          'px-4 py-2 text-base': size === 'md',
          'px-6 py-3 text-lg': size === 'lg',
        },
        className,
      )}
      {...props}
    />
  );
}
```

Create `apps/web/src/components/ui/Input.tsx`:

```typescript
import React from 'react';
import clsx from 'clsx';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium mb-1">{label}</label>}
      <input
        className={clsx(
          'w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500',
          { 'border-red-500': error, 'border-gray-300': !error },
          className,
        )}
        {...props}
      />
      {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
    </div>
  );
}
```

Create `apps/web/src/components/ui/Avatar.tsx`:

```typescript
import React from 'react';
import Image from 'next/image';

interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Avatar({ src, alt, size = 'md' }: AvatarProps) {
  const sizeClass = {
    sm: 'w-8 h-8',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }[size];

  return (
    <div className={`${sizeClass} rounded-full bg-gray-200 overflow-hidden`}>
      {src ? (
        <Image src={src} alt={alt} width={64} height={64} />
      ) : (
        <div className="w-full h-full bg-blue-500 flex items-center justify-center text-white font-bold">
          {alt[0]?.toUpperCase()}
        </div>
      )}
    </div>
  );
}
```

### Step 11: Create layout components

Create `apps/web/src/components/layout/AppLayout.tsx`:

```typescript
'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/hooks';
import { Avatar } from '@/components/ui/Avatar';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 p-4 flex flex-col">
        <h1 className="text-2xl font-bold text-blue-600 mb-8">Social</h1>

        <nav className="flex-1 space-y-2">
          <NavLink href="/app/feed" label="Home" />
          <NavLink href="/app/messages" label="Messages" />
          <NavLink href="/app/discover" label="Discover" />
          <NavLink href="/app/payments" label="Payments" />
          <NavLink href="/app/notifications" label="Notifications" />
        </nav>

        {/* User menu */}
        <div className="pt-4 border-t border-gray-200">
          {user && (
            <div className="flex items-center space-x-3 mb-4">
              <Avatar alt={user.displayName || 'User'} size="md" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {user.displayName}
                </p>
                <p className="text-xs text-gray-500 truncate">
                  {user.hederaAccountId}
                </p>
              </div>
            </div>
          )}
          <button
            onClick={logout}
            className="w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
    >
      {label}
    </Link>
  );
}
```

### Step 12: Create app directory structure and pages

Create `apps/web/src/app/layout.tsx`:

```typescript
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hedera Social Platform',
  description: 'Blockchain-native social platform built on Hedera',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

Create `apps/web/src/app/(auth)/layout.tsx`:

```typescript
import { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-8">
        {children}
      </div>
    </div>
  );
}
```

Create `apps/web/src/app/(auth)/page.tsx`:

```typescript
'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

export default function AuthPage() {
  const router = useRouter();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Welcome</h1>
        <p className="text-gray-600 mt-2">
          Blockchain-native social platform on Hedera
        </p>
      </div>

      <div className="space-y-3">
        <Button
          onClick={() => router.push('/auth/register')}
          className="w-full"
        >
          Create Account
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.push('/auth/login')}
          className="w-full"
        >
          Sign In
        </Button>
      </div>

      <p className="text-center text-sm text-gray-500">
        Your Hedera wallet is your identity
      </p>
    </div>
  );
}
```

Create `apps/web/src/app/(app)/layout.tsx`:

```typescript
'use client';

import { useAuth } from '@/lib/hooks';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { ReactNode } from 'react';

export default function AppLayoutWrapper({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/auth');
    }
  }, [isAuthenticated, router]);

  if (!isAuthenticated) {
    return <div>Redirecting...</div>;
  }

  return <AppLayout>{children}</AppLayout>;
}
```

Create `apps/web/src/app/(app)/feed/page.tsx`:

```typescript
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export default function FeedPage() {
  const { data: posts, isLoading } = useQuery({
    queryKey: ['feed'],
    queryFn: () => api.getHomeFeed(),
  });

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Home Feed</h1>

      {isLoading && <p className="text-gray-500">Loading posts...</p>}

      {posts && posts.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No posts yet. Follow users to see their posts.
        </p>
      )}

      {posts && (
        <div className="space-y-4">
          {posts.map((post: Post) => (
            <div
              key={post.id}
              className="bg-white rounded-lg p-4 border border-gray-200"
            >
              <p className="text-gray-900">{post.content}</p>
              <p className="text-sm text-gray-500 mt-2">
                {new Date(post.createdAt).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

Create placeholder pages:

```bash
touch apps/web/src/app/'(app)'/messages/page.tsx
touch apps/web/src/app/'(app)'/discover/page.tsx
touch apps/web/src/app/'(app)'/payments/page.tsx
touch apps/web/src/app/'(app)'/notifications/page.tsx
touch apps/web/src/app/'(auth)'/register/page.tsx
touch apps/web/src/app/'(auth)'/login/page.tsx
```

For each placeholder page, use:

```typescript
'use client';

export default function Page() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Page Under Construction</h1>
    </div>
  );
}
```

### Step 13: Install dependencies and verify build

```bash
cd /sessions/exciting-sharp-mayer/mnt/social-platform
pnpm install
pnpm build
```

Expected output: Build succeeds for all packages.

### Step 14: Start the development server

```bash
cd apps/web
pnpm dev
```

Expected output:
```
  ▲ Next.js 14.1.0

  ▶ Local:        http://localhost:3000
  ▶ Environments: .env.local

  ✓ Ready in 2.5s
```

Visit http://localhost:3000 in your browser. You should see the auth page.

---

## Verification Steps

Run each of these and confirm the expected output:

| # | Command | Expected |
|---|---------|----------|
| 1 | `ls apps/web/src/` | Shows: app, lib, stores, components, types directories |
| 2 | `ls apps/web/src/lib/` | Shows: api.ts, socket.ts, hooks/  |
| 3 | `ls apps/web/src/stores/` | Shows: auth.store.ts, chat.store.ts, feed.store.ts |
| 4 | `ls apps/web/src/components/` | Shows: ui/, layout/ directories |
| 5 | `grep -c "create<.*State>" apps/web/src/stores/*.ts` | 3 (three Zustand stores) |
| 6 | `cd apps/web && pnpm build` | Build succeeds with no errors |
| 7 | `cd apps/web && pnpm dev` | Dev server starts on port 3000 |
| 8 | `curl http://localhost:3000` | Returns HTML with "Welcome" text |
| 9 | `grep -c "useQuery\|useMutation" apps/web/src/**/*.tsx` | At least 1 (TanStack Query used) |
| 10 | `ls apps/web/.env.local` | File exists |

---

## Definition of Done

- [ ] Next.js project created with App Router in `apps/web/`
- [ ] TypeScript configured with path aliases (`@/*`)
- [ ] Tailwind CSS configured and working
- [ ] API client created in `lib/api.ts` with all endpoints
- [ ] Socket.io client created in `lib/socket.ts` with subscription functions
- [ ] Three Zustand stores created: auth, chat, feed
- [ ] Custom hooks created: useAuth, useConversation, useSocket
- [ ] UI components created: Button, Input, Avatar, AppLayout
- [ ] Route groups created: (auth) and (app)
- [ ] Auth pages created: register, login
- [ ] App pages created: feed, messages, discover, payments, notifications
- [ ] `.env.local` created with API_URL and WS_URL
- [ ] `pnpm build` succeeds with no TypeScript errors
- [ ] `pnpm dev` starts dev server on port 3000
- [ ] Frontend loads at http://localhost:3000
- [ ] All imports resolve correctly (no module not found errors)

---

## Troubleshooting

**Problem:** "Cannot find module '@/*'"
**Fix:** Ensure `tsconfig.json` has `"paths": { "@/*": ["./src/*"] }`

**Problem:** "Module not found: @hedera-social/shared"
**Fix:** Make sure P0-T01 monorepo setup is complete and `pnpm install` has run.

**Problem:** "Port 3000 already in use"
**Fix:** Kill the process or specify a different port: `pnpm dev -- -p 3001`

**Problem:** "Tailwind CSS not styling anything"
**Fix:** Ensure `tailwind.config.ts` has correct content paths:
```typescript
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // ...
};
```

**Problem:** "Next.js can't find .next directory"
**Fix:** Run `pnpm build` first, or use `pnpm dev` which builds on start.

---

## Files Created in This Task

```
apps/web/
├── package.json                           (updated with all deps)
├── tsconfig.json
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── .env.local                             (development variables)
├── .env.example
├── public/                                (static assets)
├── src/
│   ├── app/
│   │   ├── layout.tsx                     (root layout)
│   │   ├── globals.css
│   │   ├── (auth)/                        (auth route group)
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx               (placeholder)
│   │   │   └── login/
│   │   │       └── page.tsx               (placeholder)
│   │   └── (app)/                         (authenticated route group)
│   │       ├── layout.tsx                 (auth guard)
│   │       ├── feed/
│   │       │   └── page.tsx
│   │       ├── messages/
│   │       │   └── page.tsx               (placeholder)
│   │       ├── discover/
│   │       │   └── page.tsx               (placeholder)
│   │       ├── payments/
│   │       │   └── page.tsx               (placeholder)
│   │       └── notifications/
│   │           └── page.tsx               (placeholder)
│   ├── lib/
│   │   ├── api.ts                         (API client with all endpoints)
│   │   ├── socket.ts                      (Socket.io client singleton)
│   │   └── hooks/
│   │       ├── index.ts
│   │       ├── useAuth.ts
│   │       ├── useConversation.ts
│   │       └── useSocket.ts
│   ├── stores/
│   │   ├── auth.store.ts                  (Zustand auth store)
│   │   ├── chat.store.ts                  (Zustand chat store)
│   │   └── feed.store.ts                  (Zustand feed store)
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Button.tsx
│   │   │   ├── Input.tsx
│   │   │   └── Avatar.tsx
│   │   └── layout/
│   │       └── AppLayout.tsx
│   └── types/                             (empty, for future type defs)
└── .gitignore
```

---

## What Happens Next

After this task is complete:
- **Phase 1 features** (P1-T01 through P1-T06) — implement pages and features using this scaffold
- Register/login flow — will use /api/auth/register and /api/auth/verify-otp endpoints
- Messaging feature — will use Socket.io subscriptions and the chat store
- Feed feature — will use TanStack Query for pagination
- All API calls are type-safe and use JWT authentication automatically

---

## Additional Notes

### Environment Variables

**For Development:**
```
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_WS_URL=ws://localhost:3002
```

**For Production:**
```
NEXT_PUBLIC_API_URL=https://api.hedera-social.com/api
NEXT_PUBLIC_WS_URL=wss://api.hedera-social.com
```

### TanStack Query Setup

For advanced usage, you may want to add a QueryClientProvider in `app/layout.tsx`:

```typescript
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactNode } from 'react';

const queryClient = new QueryClient();

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <html lang="en">
        <body>{children}</body>
      </html>
    </QueryClientProvider>
  );
}
```

This is recommended for better query caching behavior across the app.
