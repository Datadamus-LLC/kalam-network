'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { PostCard } from './PostCard';
import { RiLoader4Line } from '@remixicon/react';

interface Post {
  id: string;
  authorAccountId: string;
  authorDisplayName?: string | null;
  authorAvatarUrl?: string | null;
  content: string;
  createdAt: string;
  likeCount?: number;
  commentCount?: number;
  isLiked?: boolean;
  likes?: number;
  replies?: number;
  media?: string[];
}

interface FeedPage {
  posts: Post[];
  nextCursor?: string;
}

interface PostListProps {
  /** 'home' for the home feed, or a Hedera account ID for a user feed */
  feedType: 'home' | string;
}

export function PostList({ feedType }: PostListProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery<FeedPage>({
    queryKey: ['feed', feedType],
    queryFn: ({ pageParam }) => {
      const cursor = pageParam as string | undefined;
      if (feedType === 'home') {
        return api.getHomeFeed(20, cursor);
      }
      if (feedType === 'following') {
        return api.getFollowingFeed(20, cursor);
      }
      if (feedType === 'trending') {
        return api.getTrendingPosts(20, cursor);
      }
      return api.getUserFeed(feedType, 20, cursor);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const allPosts = (data?.pages.flatMap((page) => page.posts) ?? []).filter(
    (p) => !deletedIds.has(p.id),
  );

  // Infinite scroll observer
  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage],
  );

  useEffect(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    observerRef.current = new IntersectionObserver(handleObserver, {
      rootMargin: '200px',
    });

    const sentinel = sentinelRef.current;
    if (sentinel) {
      observerRef.current.observe(sentinel);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [handleObserver]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 gap-2">
        <RiLoader4Line size={20} className="animate-spin text-muted-foreground" />
        <span className="text-[14px] text-muted-foreground">Loading posts…</span>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="text-center py-12 px-4">
        <p className="text-[14px] text-muted-foreground mb-3">Failed to load posts.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-[14px] text-foreground hover:opacity-70 transition-opacity font-semibold"
        >
          Try again
        </button>
      </div>
    );
  }

  // Empty state
  if (allPosts.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <p className="text-[14px] text-muted-foreground">
          {feedType === 'following'
            ? "You're not following anyone yet. Follow people to see their posts here."
            : feedType === 'home'
              ? 'No posts yet. Follow users to see their posts here.'
              : feedType === 'trending'
                ? 'No trending posts at the moment.'
                : 'No posts yet.'}
        </p>
      </div>
    );
  }

  return (
    <div>
      {allPosts.map((post) => (
        <PostCard
          key={post.id}
          id={post.id}
          author={{
            accountId: post.authorAccountId,
            displayName: post.authorDisplayName ?? null,
            avatarUrl: post.authorAvatarUrl ?? null,
            badgeTier: null,
          }}
          text={post.content}
          createdAt={post.createdAt}
          likeCount={post.likeCount ?? post.likes ?? 0}
          commentCount={post.commentCount ?? post.replies ?? 0}
          isLiked={post.isLiked ?? false}
          onDelete={(id) => {
            setDeletedIds((prev) => new Set([...prev, id]));
            void refetch();
          }}
        />
      ))}

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="h-4" />

      {isFetchingNextPage && (
        <div className="flex items-center justify-center py-4 gap-2">
          <RiLoader4Line size={18} className="animate-spin text-muted-foreground" />
          <span className="text-[13px] text-muted-foreground">Loading more…</span>
        </div>
      )}

      {!hasNextPage && allPosts.length > 0 && (
        <p className="text-center text-[13px] text-muted-foreground py-4 border-t border-border">
          You&apos;ve reached the end.
        </p>
      )}
    </div>
  );
}
