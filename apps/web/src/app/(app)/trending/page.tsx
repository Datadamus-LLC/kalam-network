'use client';
export const dynamic = 'force-dynamic';

import { useQueryClient } from '@tanstack/react-query';
import { RiRefreshLine, RiStarLine } from '@remixicon/react';
import { PostList } from '@/components/feed/PostList';

/**
 * Trending page — /trending
 *
 * Displays trending posts from the platform via GET /api/v1/posts/trending.
 */
export default function TrendingPage() {
  const queryClient = useQueryClient();

  const handleRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['feed', 'trending'] });
  };

  return (
    <div className="flex-1 min-h-full">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-[18px] py-[14px] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RiStarLine size={18} className="text-muted-foreground" />
          <h1 className="text-[17px] font-extrabold text-foreground">Trending</h1>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
          aria-label="Refresh trending posts"
        >
          <RiRefreshLine size={18} />
        </button>
      </div>

      {/* Trending post list with infinite scroll */}
      <PostList feedType="trending" />
    </div>
  );
}
