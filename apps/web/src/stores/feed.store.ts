import { create } from 'zustand';

export interface FeedPost {
  id: string;
  authorAccountId: string;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
  content: string;
  createdAt: string;
  likes?: number;
  replies?: number;
  media?: string[];
}

interface FeedState {
  posts: FeedPost[];
  isLoading: boolean;
  hasMore: boolean;
  cursor: string | null;
  error: string | null;
  activeTab: 'for-you' | 'following' | 'trending';

  setPosts: (posts: FeedPost[]) => void;
  addPosts: (posts: FeedPost[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  setHasMore: (hasMore: boolean) => void;
  setCursor: (cursor: string | null) => void;
  setError: (error: string | null) => void;
  setActiveTab: (tab: 'for-you' | 'following' | 'trending') => void;
  reset: () => void;
}

const initialState = {
  posts: [] as FeedPost[],
  isLoading: false,
  hasMore: true,
  cursor: null as string | null,
  error: null as string | null,
  activeTab: 'for-you' as const,
};

export const useFeedStore = create<FeedState>((set) => ({
  ...initialState,

  setPosts: (posts) => set({ posts }),
  addPosts: (posts) => set((state) => ({ posts: [...state.posts, ...posts] })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setHasMore: (hasMore) => set({ hasMore }),
  setCursor: (cursor) => set({ cursor }),
  setError: (error) => set({ error }),
  setActiveTab: (activeTab) => set({ activeTab }),
  reset: () => set({ ...initialState, posts: [] }),
}));
