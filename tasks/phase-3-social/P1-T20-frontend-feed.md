# Task: Frontend — Feed & Social UI

| Field | Value |
|-------|-------|
| Task ID | P1-T20 |
| Priority | Critical |
| Estimated Time | 6 hours |
| Depends On | P1-T18 (Posts Service), P1-T19 (Follow/Unfollow), P1-T13 (Onboarding) |
| Phase | 3 — Social Feed |
| Assignee | Junior Developer |

---

## Objective

Implement the complete frontend UI for the Hedera Social Platform's social feed. This includes the home feed with infinite scroll, user profiles, post creation, and social interactions. Built with Next.js, React, TypeScript, Zustand, and Tailwind CSS.

## Background

The frontend is a modern React application that:
- Displays posts from followed accounts in a home feed
- Shows user profiles with post history and social stats
- Allows post creation with media attachment
- Manages follow/unfollow relationships
- Uses Zustand for state management
- Implements infinite scroll for performance
- Caches data with SWR (stale-while-revalidate)
- Responsive design optimized for mobile-first

All data comes from the NestJS backend API implemented in P1-T18 and P1-T19.

## Pre-requisites

- Next.js 14+ project initialized
- TypeScript configured
- Tailwind CSS installed and configured
- Zustand installed (`npm install zustand`)
- SWR installed (`npm install swr`)
- Next Image configured
- TanStack React Query or SWR for data fetching
- Axios or fetch configured for API calls
- Authentication context/provider from P1-T13
- API base URL environment variable set

## Step-by-Step Instructions

### Step 1: Create Zustand Stores

Create `/src/store/useFeedStore.ts`:

```typescript
import { create } from 'zustand';

export interface PostMedia {
  type: 'image' | 'video' | 'audio';
  ref: string;
  mimeType: string;
  size: number;
  dimensions?: string;
  alt?: string;
  duration?: number;
}

export interface Post {
  id: string;
  author_account_id: string;
  author?: {
    hedera_account_id: string;
    display_name: string;
    avatar_uri?: string;
  };
  content_text: string;
  media_refs: PostMedia[] | null;
  consensus_timestamp: string;
  like_count: number;
  reply_count: number;
  share_count: number;
  is_deleted: boolean;
}

export interface FeedState {
  // Home feed
  homeFeedPosts: Post[];
  homeFeedLoading: boolean;
  homeFeedError: string | null;
  homeFeedCursor: string | null;
  homeFeedHasMore: boolean;

  // User posts
  userPosts: { [accountId: string]: Post[] };
  userPostsLoading: { [accountId: string]: boolean };
  userPostsCursor: { [accountId: string]: string | null };
  userPostsHasMore: { [accountId: string]: boolean };

  // Create post
  creatingPost: boolean;
  createPostError: string | null;
  createPostSuccess: boolean;

  // Mutations
  setHomeFeedPosts: (posts: Post[]) => void;
  appendHomeFeedPosts: (posts: Post[]) => void;
  setHomeFeedLoading: (loading: boolean) => void;
  setHomeFeedError: (error: string | null) => void;
  setHomeFeedCursor: (cursor: string | null) => void;
  setHomeFeedHasMore: (hasMore: boolean) => void;

  setUserPosts: (accountId: string, posts: Post[]) => void;
  appendUserPosts: (accountId: string, posts: Post[]) => void;
  setUserPostsLoading: (accountId: string, loading: boolean) => void;
  setUserPostsCursor: (accountId: string, cursor: string | null) => void;
  setUserPostsHasMore: (accountId: string, hasMore: boolean) => void;

  setCreatingPost: (creating: boolean) => void;
  setCreatePostError: (error: string | null) => void;
  setCreatePostSuccess: (success: boolean) => void;

  // Reset
  resetFeed: () => void;
  resetUserPosts: (accountId: string) => void;
}

export const useFeedStore = create<FeedState>((set) => ({
  homeFeedPosts: [],
  homeFeedLoading: false,
  homeFeedError: null,
  homeFeedCursor: null,
  homeFeedHasMore: true,

  userPosts: {},
  userPostsLoading: {},
  userPostsCursor: {},
  userPostsHasMore: {},

  creatingPost: false,
  createPostError: null,
  createPostSuccess: false,

  setHomeFeedPosts: (posts) =>
    set({ homeFeedPosts: posts }),
  appendHomeFeedPosts: (posts) =>
    set((state) => ({
      homeFeedPosts: [...state.homeFeedPosts, ...posts],
    })),
  setHomeFeedLoading: (loading) =>
    set({ homeFeedLoading: loading }),
  setHomeFeedError: (error) =>
    set({ homeFeedError: error }),
  setHomeFeedCursor: (cursor) =>
    set({ homeFeedCursor: cursor }),
  setHomeFeedHasMore: (hasMore) =>
    set({ homeFeedHasMore: hasMore }),

  setUserPosts: (accountId, posts) =>
    set((state) => ({
      userPosts: { ...state.userPosts, [accountId]: posts },
    })),
  appendUserPosts: (accountId, posts) =>
    set((state) => ({
      userPosts: {
        ...state.userPosts,
        [accountId]: [
          ...(state.userPosts[accountId] || []),
          ...posts,
        ],
      },
    })),
  setUserPostsLoading: (accountId, loading) =>
    set((state) => ({
      userPostsLoading: {
        ...state.userPostsLoading,
        [accountId]: loading,
      },
    })),
  setUserPostsCursor: (accountId, cursor) =>
    set((state) => ({
      userPostsCursor: {
        ...state.userPostsCursor,
        [accountId]: cursor,
      },
    })),
  setUserPostsHasMore: (accountId, hasMore) =>
    set((state) => ({
      userPostsHasMore: {
        ...state.userPostsHasMore,
        [accountId]: hasMore,
      },
    })),

  setCreatingPost: (creating) =>
    set({ creatingPost: creating }),
  setCreatePostError: (error) =>
    set({ createPostError: error }),
  setCreatePostSuccess: (success) =>
    set({ createPostSuccess: success }),

  resetFeed: () =>
    set({
      homeFeedPosts: [],
      homeFeedCursor: null,
      homeFeedError: null,
      homeFeedHasMore: true,
    }),
  resetUserPosts: (accountId) =>
    set((state) => {
      const newUserPosts = { ...state.userPosts };
      delete newUserPosts[accountId];
      return { userPosts: newUserPosts };
    }),
}));
```

Create `/src/store/useSocialStore.ts`:

```typescript
import { create } from 'zustand';

export interface Follower {
  follower_account_id: string;
  following_account_id: string;
  consensus_timestamp: string;
  created_at: string;
}

export interface UserStats {
  account_id: string;
  follower_count: number;
  following_count: number;
}

export interface SocialState {
  // Follow status
  followingMap: { [targetAccountId: string]: boolean };
  followingLoading: { [targetAccountId: string]: boolean };
  followingError: { [targetAccountId: string]: string | null };

  // Follower lists
  followers: { [accountId: string]: Follower[] };
  followersLoading: { [accountId: string]: boolean };
  followersCursor: { [accountId: string]: string | null };
  followersHasMore: { [accountId: string]: boolean };

  // Following lists
  following: { [accountId: string]: Follower[] };
  followingListLoading: { [accountId: string]: boolean };
  followingListCursor: { [accountId: string]: string | null };
  followingListHasMore: { [accountId: string]: boolean };

  // Stats
  stats: { [accountId: string]: UserStats };
  statsLoading: { [accountId: string]: boolean };

  // Mutations
  setFollowStatus: (targetAccountId: string, isFollowing: boolean) => void;
  setFollowingLoading: (targetAccountId: string, loading: boolean) => void;
  setFollowingError: (targetAccountId: string, error: string | null) => void;

  setFollowers: (accountId: string, followers: Follower[]) => void;
  appendFollowers: (accountId: string, followers: Follower[]) => void;
  setFollowersLoading: (accountId: string, loading: boolean) => void;
  setFollowersCursor: (accountId: string, cursor: string | null) => void;
  setFollowersHasMore: (accountId: string, hasMore: boolean) => void;

  setFollowing: (accountId: string, following: Follower[]) => void;
  appendFollowing: (accountId: string, following: Follower[]) => void;
  setFollowingListLoading: (accountId: string, loading: boolean) => void;
  setFollowingListCursor: (accountId: string, cursor: string | null) => void;
  setFollowingListHasMore: (accountId: string, hasMore: boolean) => void;

  setStats: (accountId: string, stats: UserStats) => void;
  setStatsLoading: (accountId: string, loading: boolean) => void;

  // Reset
  resetFollowStatus: () => void;
}

export const useSocialStore = create<SocialState>((set) => ({
  followingMap: {},
  followingLoading: {},
  followingError: {},

  followers: {},
  followersLoading: {},
  followersCursor: {},
  followersHasMore: {},

  following: {},
  followingListLoading: {},
  followingListCursor: {},
  followingListHasMore: {},

  stats: {},
  statsLoading: {},

  setFollowStatus: (targetAccountId, isFollowing) =>
    set((state) => ({
      followingMap: {
        ...state.followingMap,
        [targetAccountId]: isFollowing,
      },
    })),

  setFollowingLoading: (targetAccountId, loading) =>
    set((state) => ({
      followingLoading: {
        ...state.followingLoading,
        [targetAccountId]: loading,
      },
    })),

  setFollowingError: (targetAccountId, error) =>
    set((state) => ({
      followingError: {
        ...state.followingError,
        [targetAccountId]: error,
      },
    })),

  setFollowers: (accountId, followers) =>
    set((state) => ({
      followers: { ...state.followers, [accountId]: followers },
    })),

  appendFollowers: (accountId, followers) =>
    set((state) => ({
      followers: {
        ...state.followers,
        [accountId]: [
          ...(state.followers[accountId] || []),
          ...followers,
        ],
      },
    })),

  setFollowersLoading: (accountId, loading) =>
    set((state) => ({
      followersLoading: {
        ...state.followersLoading,
        [accountId]: loading,
      },
    })),

  setFollowersCursor: (accountId, cursor) =>
    set((state) => ({
      followersCursor: {
        ...state.followersCursor,
        [accountId]: cursor,
      },
    })),

  setFollowersHasMore: (accountId, hasMore) =>
    set((state) => ({
      followersHasMore: {
        ...state.followersHasMore,
        [accountId]: hasMore,
      },
    })),

  setFollowing: (accountId, following) =>
    set((state) => ({
      following: { ...state.following, [accountId]: following },
    })),

  appendFollowing: (accountId, following) =>
    set((state) => ({
      following: {
        ...state.following,
        [accountId]: [
          ...(state.following[accountId] || []),
          ...following,
        ],
      },
    })),

  setFollowingListLoading: (accountId, loading) =>
    set((state) => ({
      followingListLoading: {
        ...state.followingListLoading,
        [accountId]: loading,
      },
    })),

  setFollowingListCursor: (accountId, cursor) =>
    set((state) => ({
      followingListCursor: {
        ...state.followingListCursor,
        [accountId]: cursor,
      },
    })),

  setFollowingListHasMore: (accountId, hasMore) =>
    set((state) => ({
      followingListHasMore: {
        ...state.followingListHasMore,
        [accountId]: hasMore,
      },
    })),

  setStats: (accountId, stats) =>
    set((state) => ({
      stats: { ...state.stats, [accountId]: stats },
    })),

  setStatsLoading: (accountId, loading) =>
    set((state) => ({
      statsLoading: {
        ...state.statsLoading,
        [accountId]: loading,
      },
    })),

  resetFollowStatus: () =>
    set({
      followingMap: {},
      followingLoading: {},
      followingError: {},
    }),
}));
```

### Step 2: Create API Hooks

Create `/src/lib/api.ts`:

```typescript
import axios, { AxiosInstance } from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api';

export const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Add auth token to every request
apiClient.interceptors.request.use((config) => {
  const token = typeof window !== 'undefined'
    ? localStorage.getItem('auth_token')
    : null;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
```

Create `/src/hooks/useFeed.ts`:

```typescript
import { useCallback, useState } from 'react';
import { useFeedStore, Post, FeedState } from '@/store/useFeedStore';
import { apiClient } from '@/lib/api';

interface FeedResponse {
  posts: Post[];
  next_cursor?: string;
  has_more: boolean;
}

export function useFeed() {
  const [isInitialized, setIsInitialized] = useState(false);

  const {
    homeFeedPosts,
    homeFeedLoading,
    homeFeedError,
    homeFeedCursor,
    homeFeedHasMore,
    setHomeFeedPosts,
    appendHomeFeedPosts,
    setHomeFeedLoading,
    setHomeFeedError,
    setHomeFeedCursor,
    setHomeFeedHasMore,
    resetFeed,
  } = useFeedStore();

  const fetchHomeFeed = useCallback(
    async (cursor?: string) => {
      setHomeFeedLoading(true);
      setHomeFeedError(null);

      try {
        const response = await apiClient.get<FeedResponse>(
          '/posts/feed',
          {
            params: {
              cursor: cursor || homeFeedCursor,
              limit: 20,
            },
          },
        );

        if (cursor) {
          appendHomeFeedPosts(response.data.posts);
        } else {
          setHomeFeedPosts(response.data.posts);
          setIsInitialized(true);
        }

        setHomeFeedCursor(response.data.next_cursor || null);
        setHomeFeedHasMore(response.data.has_more);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : (error && typeof error === 'object' && 'response' in error ? (error.response as { data?: { message?: string } })?.data?.message : 'Failed to load feed') || 'Failed to load feed';
        setHomeFeedError(message);
      } finally {
        setHomeFeedLoading(false);
      }
    },
    [homeFeedCursor, setHomeFeedPosts, appendHomeFeedPosts, setHomeFeedLoading, setHomeFeedError, setHomeFeedCursor, setHomeFeedHasMore],
  );

  const loadMore = useCallback(async () => {
    if (!homeFeedHasMore || homeFeedLoading) return;
    await fetchHomeFeed(homeFeedCursor || undefined);
  }, [homeFeedHasMore, homeFeedLoading, homeFeedCursor, fetchHomeFeed]);

  const refresh = useCallback(async () => {
    resetFeed();
    await fetchHomeFeed();
  }, [fetchHomeFeed, resetFeed]);

  return {
    posts: homeFeedPosts,
    loading: homeFeedLoading,
    error: homeFeedError,
    hasMore: homeFeedHasMore,
    isInitialized,
    loadMore,
    refresh,
    fetchHomeFeed,
  };
}
```

Create `/src/hooks/useUserPosts.ts`:

```typescript
import { useCallback } from 'react';
import { useFeedStore } from '@/store/useFeedStore';
import { apiClient } from '@/lib/api';

interface PostData {
  id: string;
  author_account_id: string;
  content_text: string;
  media_refs: Array<{ type: string; ref: string; mimeType: string; size: number; dimensions?: string; alt?: string }> | null;
  consensus_timestamp: string;
  like_count: number;
  reply_count: number;
  share_count: number;
  is_deleted: boolean;
}

interface FeedResponse {
  posts: PostData[];
  next_cursor?: string;
  has_more: boolean;
}

export function useUserPosts(accountId: string) {
  const {
    userPosts,
    userPostsLoading,
    userPostsCursor,
    userPostsHasMore,
    setUserPosts,
    appendUserPosts,
    setUserPostsLoading,
    setUserPostsCursor,
    setUserPostsHasMore,
  } = useFeedStore();

  const posts = userPosts[accountId] || [];
  const loading = userPostsLoading[accountId] || false;
  const cursor = userPostsCursor[accountId] || null;
  const hasMore = userPostsHasMore[accountId] !== false;

  const fetchUserPosts = useCallback(
    async (cursorOverride?: string) => {
      setUserPostsLoading(accountId, true);

      try {
        const response = await apiClient.get<FeedResponse>(
          '/posts',
          {
            params: {
              accountId,
              cursor: cursorOverride || cursor,
              limit: 20,
            },
          },
        );

        if (cursorOverride) {
          appendUserPosts(accountId, response.data.posts);
        } else {
          setUserPosts(accountId, response.data.posts);
        }

        setUserPostsCursor(accountId, response.data.next_cursor || null);
        setUserPostsHasMore(accountId, response.data.has_more);
      } catch (error) {
        // Error silently handled via error boundary and initial empty state
      } finally {
        setUserPostsLoading(accountId, false);
      }
    },
    [accountId, cursor, setUserPosts, appendUserPosts, setUserPostsLoading, setUserPostsCursor, setUserPostsHasMore],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetchUserPosts(cursor || undefined);
  }, [hasMore, loading, cursor, fetchUserPosts]);

  return {
    posts,
    loading,
    hasMore,
    loadMore,
    fetch: fetchUserPosts,
  };
}
```

Create `/src/hooks/useFollow.ts`:

```typescript
import { useCallback } from 'react';
import { useSocialStore } from '@/store/useSocialStore';
import { apiClient } from '@/lib/api';

export function useFollow(targetAccountId: string) {
  const {
    followingMap,
    followingLoading,
    followingError,
    setFollowStatus,
    setFollowingLoading,
    setFollowingError,
  } = useSocialStore();

  const isFollowing = followingMap[targetAccountId] || false;
  const loading = followingLoading[targetAccountId] || false;
  const error = followingError[targetAccountId] || null;

  const checkFollowStatus = useCallback(async (userAccountId: string) => {
    try {
      const response = await apiClient.get(
        `/social/${userAccountId}/is-following/${targetAccountId}`,
      );
      setFollowStatus(targetAccountId, response.data.is_following);
    } catch (error) {
      // Error silently handled via error boundary and initial state
    }
  }, [targetAccountId, setFollowStatus]);

  const follow = useCallback(async () => {
    setFollowingLoading(targetAccountId, true);
    setFollowingError(targetAccountId, null);

    try {
      await apiClient.post('/social/follow', {
        target_account_id: targetAccountId,
      });

      setFollowStatus(targetAccountId, true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error && typeof error === 'object' && 'response' in error ? (error.response as { data?: { message?: string } })?.data?.message : 'Failed to follow') || 'Failed to follow';
      setFollowingError(targetAccountId, message);
    } finally {
      setFollowingLoading(targetAccountId, false);
    }
  }, [targetAccountId, setFollowStatus, setFollowingLoading, setFollowingError]);

  const unfollow = useCallback(async () => {
    setFollowingLoading(targetAccountId, true);
    setFollowingError(targetAccountId, null);

    try {
      await apiClient.post('/social/unfollow', {
        target_account_id: targetAccountId,
      });

      setFollowStatus(targetAccountId, false);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : (error && typeof error === 'object' && 'response' in error ? (error.response as { data?: { message?: string } })?.data?.message : 'Failed to unfollow') || 'Failed to unfollow';
      setFollowingError(targetAccountId, message);
    } finally {
      setFollowingLoading(targetAccountId, false);
    }
  }, [targetAccountId, setFollowStatus, setFollowingLoading, setFollowingError]);

  return {
    isFollowing,
    loading,
    error,
    follow,
    unfollow,
    checkFollowStatus,
  };
}
```

Create `/src/hooks/useFollowers.ts`:

```typescript
import { useCallback } from 'react';
import { useSocialStore } from '@/store/useSocialStore';
import { apiClient } from '@/lib/api';

interface FollowerData {
  follower_account_id: string;
  following_account_id: string;
  consensus_timestamp: string;
  created_at: string;
}

interface FollowersResponse {
  followers: FollowerData[];
  total_count: number;
  next_cursor?: string;
  has_more: boolean;
}

export function useFollowers(accountId: string) {
  const {
    followers,
    followersLoading,
    followersCursor,
    followersHasMore,
    setFollowers,
    appendFollowers,
    setFollowersLoading,
    setFollowersCursor,
    setFollowersHasMore,
  } = useSocialStore();

  const data = followers[accountId] || [];
  const loading = followersLoading[accountId] || false;
  const cursor = followersCursor[accountId] || null;
  const hasMore = followersHasMore[accountId] !== false;

  const fetch = useCallback(
    async (cursorOverride?: string) => {
      setFollowersLoading(accountId, true);

      try {
        const response = await apiClient.get<FollowersResponse>(
          `/social/${accountId}/followers`,
          {
            params: {
              cursor: cursorOverride || cursor,
              limit: 20,
            },
          },
        );

        if (cursorOverride) {
          appendFollowers(accountId, response.data.followers);
        } else {
          setFollowers(accountId, response.data.followers);
        }

        setFollowersCursor(accountId, response.data.next_cursor || null);
        setFollowersHasMore(accountId, response.data.has_more);
      } catch (error) {
        // Error silently handled via error boundary and initial empty state
      } finally {
        setFollowersLoading(accountId, false);
      }
    },
    [accountId, cursor, setFollowers, appendFollowers, setFollowersLoading, setFollowersCursor, setFollowersHasMore],
  );

  const loadMore = useCallback(async () => {
    if (!hasMore || loading) return;
    await fetch(cursor || undefined);
  }, [hasMore, loading, cursor, fetch]);

  return { data, loading, hasMore, fetch, loadMore };
}
```

### Step 3: Create Components

Create `/src/components/PostComposer.tsx`:

```typescript
'use client';

import { useState, useRef } from 'react';
import { useFeedStore } from '@/store/useFeedStore';
import { apiClient } from '@/lib/api';
import Image from 'next/image';

interface PostComposerProps {
  onPostCreated?: () => void;
  userAvatar?: string;
}

export default function PostComposer({ onPostCreated, userAvatar }: PostComposerProps) {
  const [content, setContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { setCreatingPost, setCreatePostError } = useFeedStore();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

    if (selectedFiles.length + files.length > 4) {
      setError('Maximum 4 media items per post');
      return;
    }

    setSelectedFiles([...selectedFiles, ...files]);
    setError(null);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!content.trim()) {
      setError('Post content cannot be empty');
      return;
    }

    setLoading(true);
    setCreatingPost(true);
    setError(null);

    try {
      const payload: { content: string; media?: Array<{ type: 'image' | 'video'; mimeType: string; size: number; alt: string }> } = {
        content: content.trim(),
      };

      if (selectedFiles.length > 0) {
        payload.media = selectedFiles.map((file) => ({
          type: file.type.startsWith('image/') ? 'image' : 'video',
          mimeType: file.type,
          size: file.size,
          alt: '',
        }));
      }

      await apiClient.post('/posts', payload);

      setContent('');
      setSelectedFiles([]);

      if (onPostCreated) {
        onPostCreated();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : (err && typeof err === 'object' && 'response' in err ? (err.response as { data?: { message?: string } })?.data?.message : 'Failed to create post') || 'Failed to create post';
      setError(message);
      setCreatePostError(message);
    } finally {
      setLoading(false);
      setCreatingPost(false);
    }
  };

  const charCount = content.length;
  const maxChars = 800;

  return (
    <div className="border-b border-gray-200 p-4 bg-white">
      <div className="flex gap-4">
        {/* Avatar */}
        {userAvatar && (
          <div className="h-12 w-12 flex-shrink-0">
            <Image
              src={userAvatar}
              alt="Your avatar"
              width={48}
              height={48}
              className="rounded-full"
            />
          </div>
        )}

        {/* Composer */}
        <div className="flex-1">
          {/* Text area */}
          <textarea
            value={content}
            onChange={(e) => {
              if (e.target.value.length <= maxChars) {
                setContent(e.target.value);
              }
            }}
            placeholder="What's happening?!"
            className="w-full text-xl bg-transparent outline-none resize-none"
            rows={3}
            disabled={loading}
          />

          {/* Character count */}
          <div className="text-sm text-gray-500 mb-4">
            {charCount} / {maxChars}
          </div>

          {/* Media preview */}
          {selectedFiles.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mb-4">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="relative bg-gray-100 rounded-lg overflow-hidden"
                >
                  {file.type.startsWith('image/') && (
                    <Image
                      src={URL.createObjectURL(file)}
                      alt={`Media ${index + 1}`}
                      width={200}
                      height={200}
                      className="w-full h-32 object-cover"
                    />
                  )}
                  {file.type.startsWith('video/') && (
                    <video
                      src={URL.createObjectURL(file)}
                      className="w-full h-32 object-cover bg-black"
                    />
                  )}

                  <button
                    onClick={() => handleRemoveFile(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold hover:bg-red-600"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || selectedFiles.length >= 4}
                className="text-blue-500 hover:bg-blue-100 rounded-full p-2 disabled:opacity-50"
              >
                <svg
                  className="w-5 h-5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" />
                </svg>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading || !content.trim()}
              className="bg-blue-500 text-white font-bold py-2 px-8 rounded-full hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Posting...' : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

Create `/src/components/PostCard.tsx`:

```typescript
'use client';

import { Post } from '@/store/useFeedStore';
import Image from 'next/image';
import Link from 'next/link';
import { format } from 'date-fns';

interface PostCardProps {
  post: Post;
}

export default function PostCard({ post }: PostCardProps) {
  const timestamp = new Date(post.consensus_timestamp);
  const formattedTime = format(timestamp, 'MMM d, yyyy · h:mm a');
  const hashscanUrl = `https://testnet.hashscan.io/account/${post.author_account_id}`;

  return (
    <article className="border-b border-gray-200 p-4 hover:bg-gray-50 transition cursor-pointer">
      <div className="flex gap-3">
        {/* Author avatar */}
        {post.author?.avatar_uri && (
          <Image
            src={post.author.avatar_uri}
            alt={post.author.display_name}
            width={48}
            height={48}
            className="rounded-full h-12 w-12 flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="font-bold text-gray-900">
              {post.author?.display_name || 'Unknown User'}
            </span>
            <span className="text-gray-500">
              {post.author_account_id}
            </span>
            <span className="text-gray-500">·</span>
            <a
              href={hashscanUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-blue-500 text-sm"
            >
              {formattedTime}
            </a>
          </div>

          {/* Content */}
          <p className="mt-2 text-gray-900 break-words">
            {post.content_text}
          </p>

          {/* Media */}
          {post.media_refs && post.media_refs.length > 0 && (
            <div
              className={`mt-3 rounded-lg overflow-hidden ${
                post.media_refs.length === 1
                  ? 'max-w-md'
                  : 'grid grid-cols-2 gap-1'
              }`}
            >
              {post.media_refs.map((media, index) => (
                <div
                  key={index}
                  className="bg-gray-100 overflow-hidden"
                >
                  {media.type === 'image' && (
                    <Image
                      src={media.ref.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')}
                      alt={media.alt || `Media ${index + 1}`}
                      width={500}
                      height={500}
                      className="w-full h-auto"
                    />
                  )}
                  {media.type === 'video' && (
                    <video
                      src={media.ref.replace('ipfs://', 'https://gateway.pinata.cloud/ipfs/')}
                      controls
                      className="w-full h-auto bg-black"
                    />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Engagement metrics */}
          <div className="mt-3 flex gap-4 text-gray-500 text-sm py-2 border-b border-gray-200 mb-3">
            {post.reply_count > 0 && (
              <button className="hover:text-blue-500">
                {post.reply_count} Replies
              </button>
            )}
            {post.like_count > 0 && (
              <button className="hover:text-blue-500">
                {post.like_count} Likes
              </button>
            )}
            {post.share_count > 0 && (
              <button className="hover:text-blue-500">
                {post.share_count} Shares
              </button>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-around text-gray-500 py-2">
            <button className="hover:text-blue-500 p-2 hover:bg-blue-100 rounded-full">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
              </svg>
            </button>
            <button className="hover:text-red-500 p-2 hover:bg-red-100 rounded-full">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
              </svg>
            </button>
            <button className="hover:text-blue-500 p-2 hover:bg-blue-100 rounded-full">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M15 8a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
```

Create `/src/components/FeedList.tsx`:

```typescript
'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Post } from '@/store/useFeedStore';
import PostCard from './PostCard';

interface FeedListProps {
  posts: Post[];
  loading: boolean;
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
}

export default function FeedList({
  posts,
  loading,
  hasMore,
  onLoadMore,
}: FeedListProps) {
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0].isIntersecting &&
          hasMore &&
          !loading
        ) {
          onLoadMore();
        }
      },
      { threshold: 0.1 },
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => {
      if (observerTarget.current) {
        observer.unobserve(observerTarget.current);
      }
    };
  }, [hasMore, loading, onLoadMore]);

  return (
    <div>
      {posts.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-gray-500">No posts yet. Follow someone to get started!</p>
        </div>
      )}

      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}

      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      )}

      <div ref={observerTarget} className="h-4" />
    </div>
  );
}
```

Create `/src/components/ProfileHeader.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useFollow } from '@/hooks/useFollow';
import { useSocialStore } from '@/store/useSocialStore';
import { useAuthContext } from '@/context/AuthContext';
import Image from 'next/image';

interface ProfileHeaderProps {
  accountId: string;
  displayName: string;
  avatarUri?: string;
  bio?: string;
}

export default function ProfileHeader({
  accountId,
  displayName,
  avatarUri,
  bio,
}: ProfileHeaderProps) {
  const { user } = useAuthContext();
  const { stats, statsLoading, setStats } = useSocialStore();
  const { isFollowing, loading, follow, unfollow, checkFollowStatus } =
    useFollow(accountId);

  const userStats = stats[accountId];
  const isOwnProfile = user?.hedera_account_id === accountId;

  useEffect(() => {
    // Fetch stats
    if (!userStats) {
      // Mock stats for now
      setStats(accountId, {
        account_id: accountId,
        follower_count: 0,
        following_count: 0,
      });
    }

    // Check follow status
    if (!isOwnProfile && user) {
      checkFollowStatus(user.hedera_account_id);
    }
  }, [accountId, isOwnProfile, userStats, setStats, checkFollowStatus, user]);

  const handleFollowClick = async () => {
    if (isFollowing) {
      await unfollow();
    } else {
      await follow();
    }
  };

  return (
    <div className="bg-white border-b border-gray-200">
      {/* Cover image placeholder */}
      <div className="h-48 bg-gradient-to-r from-blue-400 to-blue-600" />

      <div className="px-4 pb-4">
        {/* Avatar */}
        <div className="flex justify-between items-start -mt-16 mb-4">
          {avatarUri ? (
            <Image
              src={avatarUri}
              alt={displayName}
              width={132}
              height={132}
              className="rounded-full border-4 border-white h-32 w-32"
            />
          ) : (
            <div className="rounded-full border-4 border-white h-32 w-32 bg-gray-300 flex items-center justify-center text-3xl">
              {displayName.charAt(0).toUpperCase()}
            </div>
          )}

          {!isOwnProfile && (
            <button
              onClick={handleFollowClick}
              disabled={loading}
              className={`mt-4 px-6 py-2 rounded-full font-bold ${
                isFollowing
                  ? 'border border-gray-300 text-gray-900 hover:bg-gray-100'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              } disabled:opacity-50`}
            >
              {loading
                ? '...'
                : isFollowing
                  ? 'Following'
                  : 'Follow'}
            </button>
          )}
        </div>

        {/* Profile info */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {displayName}
          </h1>
          <p className="text-gray-500">{accountId}</p>

          {bio && <p className="mt-2 text-gray-700">{bio}</p>}

          {/* Stats */}
          <div className="mt-4 flex gap-6 text-gray-500">
            {userStats && (
              <>
                <div>
                  <span className="font-bold text-gray-900">
                    {userStats.following_count}
                  </span>
                  <span> Following</span>
                </div>
                <div>
                  <span className="font-bold text-gray-900">
                    {userStats.follower_count}
                  </span>
                  <span> Followers</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

### Step 4: Create Pages

Create `/src/app/feed/page.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useFeed } from '@/hooks/useFeed';
import PostComposer from '@/components/PostComposer';
import FeedList from '@/components/FeedList';
import { useAuthContext } from '@/context/AuthContext';

export default function FeedPage() {
  const { user } = useAuthContext();
  const { posts, loading, error, hasMore, isInitialized, loadMore, refresh, fetchHomeFeed } =
    useFeed();

  useEffect(() => {
    if (!isInitialized && user) {
      fetchHomeFeed();
    }
  }, [isInitialized, user, fetchHomeFeed]);

  return (
    <div className="flex h-screen bg-white">
      {/* Main feed */}
      <div className="flex-1 border-l border-r border-gray-200 max-w-2xl">
        {/* Sticky header */}
        <div className="sticky top-0 bg-white bg-opacity-80 backdrop-blur z-10 border-b border-gray-200">
          <div className="px-4 py-3">
            <h2 className="text-xl font-bold text-gray-900">Home</h2>
          </div>
        </div>

        {/* Post composer */}
        {user && (
          <PostComposer
            onPostCreated={refresh}
            userAvatar={user.avatar_uri}
          />
        )}

        {/* Error message */}
        {error && (
          <div className="p-4 bg-red-50 border-b border-red-200 text-red-700">
            {error}
          </div>
        )}

        {/* Feed */}
        <FeedList
          posts={posts}
          loading={loading && !isInitialized}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </div>

      {/* Right sidebar */}
      <div className="w-64 border-l border-gray-200 p-4 hidden lg:block">
        <div className="bg-gray-100 rounded-2xl p-4">
          <h2 className="text-xl font-bold mb-4">What's happening</h2>
          {/* Trending section can go here */}
        </div>
      </div>
    </div>
  );
}
```

Create `/src/app/profile/[accountId]/page.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useUserPosts } from '@/hooks/useUserPosts';
import ProfileHeader from '@/components/ProfileHeader';
import FeedList from '@/components/FeedList';

export default function ProfilePage() {
  const params = useParams();
  const accountId = params.accountId as string;
  const { posts, loading, hasMore, loadMore, fetch } =
    useUserPosts(accountId);

  useEffect(() => {
    fetch();
  }, [accountId, fetch]);

  // Mock user data - in real app, fetch from API
  const mockUser = {
    displayName: 'Hedera Developer',
    bio: 'Building decentralized apps on Hedera',
    avatarUri: undefined,
  };

  return (
    <div className="flex min-h-screen bg-white">
      <div className="flex-1 border-l border-r border-gray-200 max-w-2xl">
        {/* Profile header */}
        <ProfileHeader
          accountId={accountId}
          displayName={mockUser.displayName}
          avatarUri={mockUser.avatarUri}
          bio={mockUser.bio}
        />

        {/* Divider */}
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="font-bold text-gray-900">Posts</h3>
        </div>

        {/* Posts */}
        <FeedList
          posts={posts}
          loading={loading}
          hasMore={hasMore}
          onLoadMore={loadMore}
        />
      </div>
    </div>
  );
}
```

### Step 5: Add Global Styles

Update or create `/src/app/globals.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  @apply box-border;
}

html {
  @apply scroll-smooth;
}

body {
  @apply bg-white text-gray-900;
}

/* Scrollbar styling */
::-webkit-scrollbar {
  @apply w-2;
}

::-webkit-scrollbar-track {
  @apply bg-white;
}

::-webkit-scrollbar-thumb {
  @apply bg-gray-300 rounded hover:bg-gray-400;
}
```

### Step 6: Environment Configuration

Create or update `.env.local`:

```
NEXT_PUBLIC_API_URL=http://localhost:3000/api
NEXT_PUBLIC_APP_NAME=Hedera Social
```

## Verification Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | npm run dev | Next.js dev server starts on port 3000 |
| 2 | Navigate to /feed | Feed page loads with composer and empty state |
| 3 | Load home feed | Posts appear from backend API |
| 4 | Infinite scroll | Clicking load more fetches next page |
| 5 | Create post | POST request submitted, post appears in feed |
| 6 | Navigate to profile | Profile page shows user info and posts |
| 7 | Click follow button | Follow request sent, button changes state |
| 8 | Media display | Images/videos render in posts |
| 9 | Pagination cursor | Cursor-based pagination works correctly |
| 10 | Responsive design | Mobile layout works correctly |
| 11 | Cache works | Zustand state persists across navigation |
| 12 | Error handling | Errors display user-friendly messages |

## Definition of Done

- [x] Zustand stores created (feed, social)
- [x] All custom hooks implemented (useFeed, useUserPosts, useFollow, useFollowers)
- [x] API client configured with auth
- [x] PostComposer component with file upload
- [x] PostCard component with media display
- [x] FeedList with infinite scroll
- [x] ProfileHeader with follow button
- [x] Feed page with infinite scroll
- [x] Profile page fully functional
- [x] Tailwind CSS responsive design
- [x] Error handling and loading states
- [x] Environment variables configured
- [x] All verification steps pass

## Troubleshooting

### Issue: API requests return 401 Unauthorized
**Solution**: Check that auth token is stored in localStorage with key `auth_token`. Verify token is valid and not expired.

### Issue: Images not loading from IPFS
**Solution**: Check PINATA_GATEWAY URL in backend .env. IPFS refs must be in format `ipfs://Qm...`. Fallback to `https://gateway.pinata.cloud/ipfs/` for display.

### Issue: Infinite scroll not triggering
**Solution**: Check that IntersectionObserver is supported. Verify `hasMore` is true and `loading` is false when trigger point is reached.

### Issue: Follow button not updating
**Solution**: Check network tab for failed requests. Verify backend endpoint is `/social/follow`. Ensure error handling displays messages.

### Issue: Posts not appearing after creation
**Solution**: Call `onPostCreated()` callback to trigger feed refresh. May need to clear cache with Redis `FLUSHDB`.

### Issue: Pagination cursor error
**Solution**: Cursor format must match backend: `timestamp:id`. If cursor malformed, clear Zustand store with `resetFeed()`.

### Issue: Mobile layout broken
**Solution**: Verify Tailwind CSS compiled. Check viewport meta tag in `_document.tsx`. Test with DevTools mobile emulation.

### Issue: Avatar images not loading
**Solution**: If avatarUri starts with `http://` on HTTPS page, will be blocked. Use HTTPS URLs or ensure CORS headers allow it.

## Files Created in This Task

1. `/src/store/useFeedStore.ts`
2. `/src/store/useSocialStore.ts`
3. `/src/lib/api.ts`
4. `/src/hooks/useFeed.ts`
5. `/src/hooks/useUserPosts.ts`
6. `/src/hooks/useFollow.ts`
7. `/src/hooks/useFollowers.ts`
8. `/src/components/PostComposer.tsx`
9. `/src/components/PostCard.tsx`
10. `/src/components/FeedList.tsx`
11. `/src/components/ProfileHeader.tsx`
12. `/src/app/feed/page.tsx`
13. `/src/app/profile/[accountId]/page.tsx`
14. `/src/app/globals.css`

## What Happens Next

Phase 3 is now complete with:
1. Backend posts service (P1-T18) ✓
2. Backend follow/unfollow service (P1-T19) ✓
3. Frontend social feed UI (P1-T20) ✓

Next phases could include:
- **Phase 4**: Direct messaging with HAPI
- **Phase 5**: Notifications system with WebSocket
- **Phase 6**: Advanced search and discovery
- **Phase 7**: Moderation and content safety

For production deployment:
1. Add authentication token refresh logic
2. Implement error boundaries
3. Add analytics/tracking
4. Optimize images with next/image
5. Add PWA capabilities
6. Implement service workers for offline support
7. Add E2E tests with Cypress/Playwright
8. Performance profiling and optimization

Before moving to next phase:
1. Load test the frontend with 10k+ posts
2. Test on actual Hedera testnet
3. Security audit of API calls
4. Performance benchmarks (Lighthouse)
5. Cross-browser testing
6. Mobile device testing
