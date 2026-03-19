'use client';
export const dynamic = 'force-dynamic';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { RiSearchLine, RiCloseLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { OrgBadge } from '@/components/ui/OrgBadge';
import { PostList } from '@/components/feed/PostList';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/auth.store';

type Filter = 'all' | 'kyc' | 'org';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'kyc', label: 'KYC verified' },
  { id: 'org', label: 'Organizations' },
];

export default function DiscoverPage() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  // Track follow state per user: { [accountId]: 'following' | 'loading' | undefined }
  const [followState, setFollowState] = useState<Record<string, 'following' | 'loading'>>({});

  const handleFollow = useCallback(async (e: React.MouseEvent, accountId: string) => {
    e.stopPropagation();
    if (followState[accountId] === 'loading') return;
    const isFollowing = followState[accountId] === 'following';
    setFollowState((prev) => ({ ...prev, [accountId]: 'loading' }));
    try {
      if (isFollowing) {
        await api.unfollowUser(accountId);
        setFollowState((prev) => { const n = { ...prev }; delete n[accountId]; return n; });
      } else {
        await api.followUser(accountId);
        setFollowState((prev) => ({ ...prev, [accountId]: 'following' }));
      }
    } catch {
      setFollowState((prev) => { const n = { ...prev }; delete n[accountId]; return n; });
    }
  }, [followState]);

  const { data: results = [] } = useQuery({
    queryKey: ['search', query, filter],
    queryFn: () =>
      query.trim()
        ? api.searchUsers(query.trim(), filter === 'all' ? undefined : filter)
        : Promise.resolve({ users: [] }),
    select: (data) => data.users ?? [],
    enabled: query.trim().length > 0,
  });

  // Initialise follow state for search results
  useEffect(() => {
    if (!currentUser?.hederaAccountId || results.length === 0) return;
    const myId = currentUser.hederaAccountId;
    results.forEach((user: { hederaAccountId: string }) => {
      if (user.hederaAccountId === myId) return;
      if (followState[user.hederaAccountId] !== undefined) return;
      api.checkIsFollowing(myId, user.hederaAccountId)
        .then((res) => {
          const following = (res as unknown as { data?: { isFollowing: boolean }; isFollowing?: boolean }).data?.isFollowing
            ?? (res as unknown as { isFollowing: boolean }).isFollowing
            ?? false;
          if (following) {
            setFollowState((prev) => ({ ...prev, [user.hederaAccountId]: 'following' }));
          }
        })
        .catch(() => { /* non-critical */ });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, currentUser?.hederaAccountId]);

  return (
    <div className="flex min-h-full">
      <div className="flex-1 min-w-0 border-r border-border">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm px-[18px] py-3 space-y-3">
          <div className="relative">
            <RiSearchLine size={16} className="absolute left-[14px] top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search people and businesses…"
              className="w-full h-[42px] rounded-full border border-border bg-white/[0.04] pl-[38px] pr-10 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <RiCloseLine size={16} />
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={cn(
                  'h-[32px] px-[14px] rounded-full text-[13px] font-semibold border transition-all',
                  filter === f.id
                    ? 'bg-white/10 border-white/15 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="px-[18px] py-4">
          {!query.trim() ? (
            <p className="text-[14px] text-muted-foreground text-center py-8">
              Start typing to search for people and businesses.
            </p>
          ) : results.length === 0 ? (
            <p className="text-[14px] text-muted-foreground text-center py-8">No results for &quot;{query}&quot;</p>
          ) : (
            <div className="space-y-1">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(results as any[]).map((user: { hederaAccountId: string; displayName?: string; username?: string | null; accountType?: 'individual' | 'business' }) => {
                const isOwnProfile = currentUser?.hederaAccountId === user.hederaAccountId;
                const state = followState[user.hederaAccountId];
                const isFollowing = state === 'following';
                const isLoading = state === 'loading';
                return (
                  <div
                    key={user.hederaAccountId}
                    className="w-full flex items-center gap-3 p-3 rounded-[12px] hover:bg-white/[0.04] transition-colors"
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/profile/${user.hederaAccountId}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0 text-[16px] font-semibold text-foreground">
                        {(user.displayName || user.hederaAccountId)[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-foreground truncate flex items-center gap-1.5">
                          {user.displayName || 'Anonymous'}
                          {user.accountType === 'business' && (
                            <OrgBadge size="sm" className="flex-shrink-0" />
                          )}
                        </p>
                        <p className="text-[12px] text-muted-foreground font-mono truncate">
                          {user.username ? `@${user.username}` : user.hederaAccountId}
                        </p>
                      </div>
                    </button>
                    {!isOwnProfile && (
                      <button
                        type="button"
                        onClick={(e) => handleFollow(e, user.hederaAccountId)}
                        disabled={isLoading}
                        className={cn(
                          'flex-shrink-0 h-[32px] px-[14px] rounded-full text-[13px] font-semibold transition-colors disabled:opacity-50',
                          isFollowing
                            ? 'bg-white/10 border border-white/15 text-foreground hover:bg-white/20'
                            : 'bg-white text-black hover:opacity-90',
                        )}
                      >
                        {isLoading ? '…' : isFollowing ? 'Following' : 'Follow'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside className="hidden lg:flex flex-col w-[320px] flex-shrink-0 p-4 sticky top-0 h-screen overflow-y-auto">
        <p className="text-[15px] font-bold text-foreground mb-3">Trending</p>
        <PostList feedType="trending" />
      </aside>
    </div>
  );
}
