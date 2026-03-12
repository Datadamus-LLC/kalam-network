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
