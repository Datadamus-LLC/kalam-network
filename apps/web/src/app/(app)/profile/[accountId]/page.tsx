'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  RiArrowLeftLine,
  RiMessage3Line,
  RiBankCardLine,
  RiPriceTag3Line,
  RiGlobalLine,
  RiBroadcastLine,
} from '@remixicon/react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar';
import { ProfileBadge } from '@/components/profile/ProfileBadge';
import { OrgBadge } from '@/components/ui/OrgBadge';
import { PostList } from '@/components/feed/PostList';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';
import type { BadgeTier } from '@hedera-social/shared';

interface ProfilePageProps {
  params: { accountId: string };
}

interface ProfileData {
  displayName: string | null;
  username: string | null;
  bio: string | null;
  avatarUrl: string | null;
  hederaAccountId: string;
  accountType: string;
  kycVerified: boolean;
  kycLevel: string | null;
  /** Business-only: industry category (not yet in backend entity — future field). */
  category?: string | null;
  /** Business-only: public website URL (not yet in backend entity — future field). */
  website?: string | null;
  publicFeedTopic: string | null;
  badgeInfo: {
    tier: string;
    kybVerifiedAt: string | null;
    hcsAttestationTopic: string;
    hcsAttestationSeq: number | null;
  } | null;
  stats: {
    followers: number;
    following: number;
    posts: number;
    messagesOnChain: number;
    paymentsOnChain: number;
  };
  createdAt: string;
  didNft: { tokenId: string; serialNumber: number; metadataCid: string } | null;
}

type ProfileTab = 'posts' | 'replies' | 'payments' | 'broadcasts';

/**
 * Profile page for a user or business.
 * Business accounts (`accountType === 'business'`) render a distinct org design:
 * - OrgBadge next to name, category + website below name
 * - Stats: Posts + Followers only (no Following)
 * - Tabs: Posts + Broadcasts (no Replies, no Payments)
 * - Sidebar: Organization card + broadcasts CTA (no Similar accounts)
 */
export default function ProfilePage({ params }: ProfilePageProps) {
  const { accountId } = params;
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('posts');
  const currentUser = useAuthStore((s) => s.user);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      setLoading(true);
      setError(null);
      try {
        const data = await api.getProfile(accountId);
        if (!cancelled) {
          setProfile(data as unknown as ProfileData);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          if (err instanceof ApiError) {
            if (err.status === 404) {
              setError('Profile not found.');
            } else {
              setError(err.message);
            }
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError('Failed to load profile.');
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, [accountId]);

  // Fetch initial follow status
  useEffect(() => {
    if (!currentUser?.hederaAccountId || !accountId || accountId === 'me' || accountId === currentUser.hederaAccountId) return;
    api.checkIsFollowing(currentUser.hederaAccountId, accountId)
      .then((res) => { setIsFollowing((res as unknown as { data?: { isFollowing: boolean }; isFollowing?: boolean }).data?.isFollowing ?? (res as unknown as { isFollowing: boolean }).isFollowing ?? false); })
      .catch(() => { /* non-critical */ });
  }, [accountId, currentUser?.hederaAccountId]);

  const handleFollow = useCallback(async () => {
    if (followLoading) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await api.unfollowUser(accountId);
        setIsFollowing(false);
        setProfile((prev) => prev ? { ...prev, stats: { ...prev.stats, followers: prev.stats.followers - 1 } } : prev);
      } else {
        await api.followUser(accountId);
        setIsFollowing(true);
        setProfile((prev) => prev ? { ...prev, stats: { ...prev.stats, followers: prev.stats.followers + 1 } } : prev);
      }
    } catch {
      // Error handled silently — button returns to previous state on next render
    } finally {
      setFollowLoading(false);
    }
  }, [accountId, isFollowing, followLoading]);

  const isOwnProfile = currentUser?.hederaAccountId === accountId;
  const isOrg = profile?.accountType === 'business';

  /** Tab class helper — lemon underline per spec */
  const tabCls = (id: ProfileTab) =>
    cn(
      'flex-1 py-[14px] text-[14px] font-semibold transition-colors border-b-2 -mb-[1px]',
      activeTab === id
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.03]',
    );

  if (loading) {
    return (
      <div className="flex min-h-full">
        <div className="flex-1 border-r border-border px-[18px] py-8">
          <div className="animate-pulse space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-full bg-white/[0.06] flex-shrink-0" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-5 bg-white/[0.06] rounded-full w-48" />
                <div className="h-4 bg-white/[0.06] rounded-full w-32" />
              </div>
            </div>
            <div className="h-4 bg-white/[0.06] rounded-full w-full" />
            <div className="h-4 bg-white/[0.06] rounded-full w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-full">
        <div className="flex-1 border-r border-border px-[18px] py-8">
          <div className="border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-3 rounded-[14px] text-[13px]">
            {error}
          </div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const displayName = profile.displayName ?? accountId;

  return (
    <div className="flex min-h-full">
      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 border-r border-border">
        {/* Back row — name + post count */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-[18px] py-[12px] flex items-center gap-3">
          <Link
            href="/discover"
            className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            aria-label="Back"
          >
            <RiArrowLeftLine size={18} />
          </Link>
          <div>
            <p className="text-[15px] font-extrabold text-foreground leading-tight">{displayName}</p>
            <p className="text-[12px] text-muted-foreground">{profile.stats.posts} {profile.stats.posts === 1 ? 'post' : 'posts'}</p>
          </div>
        </div>

        {/* Profile header */}
        <div className="px-[18px] pt-[20px] pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            {/* Avatar 64×64 per spec */}
            <Avatar className="w-16 h-16 flex-shrink-0">
              <AvatarImage src={profile.avatarUrl ?? undefined} />
              <AvatarFallback className="text-[22px]">
                {displayName[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {/* Name row — OrgBadge for business accounts */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-[20px] font-extrabold text-foreground break-words">
                      {profile.displayName ?? 'Anonymous'}
                    </h1>
                    {isOrg ? (
                      <OrgBadge size="md" />
                    ) : (
                      profile.badgeInfo && (
                        <ProfileBadge badgeInfo={{
                          ...profile.badgeInfo,
                          tier: profile.badgeInfo.tier as BadgeTier,
                        }} />
                      )
                    )}
                  </div>

                  {/* Org-specific: category + website under the name */}
                  {isOrg ? (
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-[13px] text-muted-foreground">
                      {profile.category && (
                        <span className="flex items-center gap-1">
                          <RiPriceTag3Line size={13} />
                          {profile.category}
                        </span>
                      )}
                      {profile.website && (
                        <a
                          href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:opacity-80 transition-opacity"
                        >
                          <RiGlobalLine size={13} />
                          {profile.website.replace(/^https?:\/\//, '')}
                        </a>
                      )}
                    </div>
                  ) : (
                    /* Individual: username or account ID */
                    profile.username ? (
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        @{profile.username}
                      </p>
                    ) : (
                      <p className="text-[13px] text-muted-foreground font-mono mt-0.5">
                        {profile.hederaAccountId}
                      </p>
                    )
                  )}

                  {/* KYC / KYB badge */}
                  {profile.kycLevel && (
                    <span className="inline-block mt-1.5 px-[8px] py-[2px] text-[11px] rounded-full bg-[rgba(0,186,124,0.1)] text-[#00ba7c] font-semibold">
                      {isOrg ? `KYB: ${profile.kycLevel}` : `KYC: ${profile.kycLevel}`}
                    </span>
                  )}
                </div>

                {/* Action buttons — h-34px, rounded-full per spec */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {!isOwnProfile && currentUser?.hederaAccountId && !isOrg && (
                    <>
                      {/* Message icon button — not shown for orgs */}
                      <Link
                        href="/messages"
                        className="flex items-center justify-center w-[34px] h-[34px] rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        aria-label="Send message"
                      >
                        <RiMessage3Line size={16} />
                      </Link>

                      {/* Send payment icon button — not shown for orgs */}
                      <Link
                        href="/payments"
                        className="flex items-center justify-center w-[34px] h-[34px] rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
                        aria-label="Send payment"
                      >
                        <RiBankCardLine size={16} />
                      </Link>
                    </>
                  )}

                  {!isOwnProfile && currentUser?.hederaAccountId && (
                    /* Follow — white fill, black text per spec */
                    <button
                      type="button"
                      onClick={handleFollow}
                      disabled={followLoading}
                      className={cn(
                        'flex items-center h-[34px] px-[16px] rounded-full text-[13px] font-semibold transition-colors disabled:opacity-50',
                        isFollowing
                          ? 'border border-border text-muted-foreground hover:bg-white/[0.06] bg-transparent'
                          : 'bg-white text-black hover:opacity-90',
                      )}
                    >
                      {followLoading ? '…' : isFollowing ? 'Following' : 'Follow'}
                    </button>
                  )}

                  {isOwnProfile && (
                    <Link
                      href="/settings"
                      className="flex items-center h-[34px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
                    >
                      Edit profile
                    </Link>
                  )}
                </div>
              </div>

              {/* Bio */}
              {profile.bio && (
                <p className="text-[14px] text-foreground mt-3 leading-[1.5]">{profile.bio}</p>
              )}

              {/* Joined meta */}
              <div className="flex flex-wrap gap-3 mt-3 text-[12px] text-muted-foreground">
                <span>Joined {new Date(profile.createdAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
                {profile.didNft && (
                  <span className="font-mono">
                    {profile.didNft.serialNumber
                      ? `DID NFT #${profile.didNft.serialNumber}`
                      : profile.didNft.tokenId
                        ? `DID NFT Token ${profile.didNft.tokenId}`
                        : 'DID NFT'}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Stats row — orgs omit "Following" */}
          <div className="flex gap-6 mt-5">
            <div className="text-center">
              <p className="text-[18px] font-extrabold text-foreground">{profile.stats.posts}</p>
              <p className="text-[12px] text-muted-foreground">Posts</p>
            </div>
            <div className="text-center">
              <p className="text-[18px] font-extrabold text-foreground">{profile.stats.followers}</p>
              <p className="text-[12px] text-muted-foreground">Followers</p>
            </div>
            {!isOrg && (
              <div className="text-center">
                <p className="text-[18px] font-extrabold text-foreground">{profile.stats.following}</p>
                <p className="text-[12px] text-muted-foreground">Following</p>
              </div>
            )}
          </div>
        </div>

        {/* Content tabs */}
        {isOrg ? (
          /* Org profile: Posts + Broadcasts */
          <div className="flex border-b border-border">
            <button type="button" onClick={() => setActiveTab('posts')} className={tabCls('posts')}>Posts</button>
            <button type="button" onClick={() => setActiveTab('broadcasts')} className={tabCls('broadcasts')}>Broadcasts</button>
          </div>
        ) : (
          /* Individual: Posts + Replies + Payments */
          <div className="flex border-b border-border">
            <button type="button" onClick={() => setActiveTab('posts')} className={tabCls('posts')}>Posts</button>
            <button type="button" onClick={() => setActiveTab('replies')} className={tabCls('replies')}>Replies</button>
            <button type="button" onClick={() => setActiveTab('payments')} className={tabCls('payments')}>Payments</button>
          </div>
        )}

        {/* Tab content */}
        {activeTab === 'posts' && (
          <PostList feedType={profile.hederaAccountId} />
        )}
        {activeTab === 'replies' && (
          <div className="py-12 text-center">
            <p className="text-[14px] text-muted-foreground">Replies coming soon.</p>
          </div>
        )}
        {activeTab === 'payments' && (
          <div className="py-12 text-center">
            <p className="text-[14px] text-muted-foreground">Payment history coming soon.</p>
          </div>
        )}
        {activeTab === 'broadcasts' && (
          <div className="py-8 text-center px-4">
            <RiBroadcastLine size={32} className="text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-[14px] font-semibold text-foreground mb-1">
              {profile.displayName ?? 'This organization'} broadcasts to subscribers
            </p>
            <p className="text-[13px] text-muted-foreground mb-4">
              Subscribe on the Broadcasts page to receive their messages.
            </p>
            <Link
              href="/broadcasts"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary/15 text-primary text-[13px] font-semibold hover:bg-primary/25 transition-colors"
            >
              <RiBroadcastLine size={14} />
              Go to Broadcasts
            </Link>
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <aside className="hidden lg:flex flex-col w-[320px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">
        {isOrg ? (
          /* Org sidebar: organization card + broadcasts CTA */
          <>
            {/* Organization info card */}
            <div className="rounded-[12px] border border-border p-4 space-y-2">
              <p className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em]">Organization</p>
              <div className="space-y-2 text-[13px]">
                {profile.category && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <RiPriceTag3Line size={13} />
                    <span>{profile.category}</span>
                  </div>
                )}
                {profile.website && (
                  <a
                    href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity"
                  >
                    <RiGlobalLine size={13} />
                    <span className="truncate">{profile.website.replace(/^https?:\/\//, '')}</span>
                  </a>
                )}
                {profile.kycLevel && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground/60 text-[12px]">KYB Status</span>
                    <span className="text-[11px] bg-[rgba(0,186,124,0.1)] text-[#00ba7c] px-[8px] py-[3px] rounded-full font-semibold">
                      {profile.kycLevel}
                    </span>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <span className="text-muted-foreground/60 text-[12px] flex-shrink-0 pt-0.5">Account ID</span>
                  <span className="font-mono text-[12px] text-foreground break-all">{profile.hederaAccountId}</span>
                </div>
              </div>
            </div>

            {/* Broadcasts CTA */}
            <Link
              href="/broadcasts"
              className="block w-full text-center py-2.5 rounded-[10px] bg-primary/10 text-primary text-[13px] font-semibold hover:bg-primary/20 transition-colors"
            >
              Subscribe to broadcasts
            </Link>
          </>
        ) : (
          /* Individual sidebar: Hedera Identity + Similar accounts */
          <>
            {/* Hedera account info */}
            <div className="border border-border rounded-[14px] p-4 space-y-3">
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                Hedera Identity
              </p>

              <div className="space-y-2">
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Account ID</p>
                  <span className="text-[12px] font-mono text-foreground bg-white/[0.04] border border-border rounded-full px-3 py-1 inline-block break-all">
                    {profile.hederaAccountId}
                  </span>
                </div>

                {profile.didNft && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">DID NFT</p>
                    <div className="flex gap-2 flex-wrap">
                      <span className="text-[11px] bg-primary/12 text-primary/80 px-[8px] py-[3px] rounded-full font-semibold">
                        {profile.didNft.serialNumber ? `#${profile.didNft.serialNumber}` : profile.didNft.tokenId ? `Token ${profile.didNft.tokenId}` : 'DID NFT'}
                      </span>
                    </div>
                  </div>
                )}

                {profile.kycLevel && (
                  <div>
                    <p className="text-[11px] text-muted-foreground mb-1">KYC Status</p>
                    <span className="text-[11px] bg-[rgba(0,186,124,0.1)] text-[#00ba7c] px-[8px] py-[3px] rounded-full font-semibold">
                      {profile.kycLevel}
                    </span>
                  </div>
                )}

                <div>
                  <p className="text-[11px] text-muted-foreground mb-1">Account type</p>
                  <span className="text-[12px] text-foreground capitalize">{profile.accountType}</span>
                </div>
              </div>
            </div>

            {/* Similar accounts */}
            <div className="border border-border rounded-[14px] p-4">
              <p className="text-[15px] font-bold text-foreground mb-2">Similar accounts</p>
              <p className="text-[13px] text-muted-foreground">
                Discover more people to follow.
              </p>
              <Link
                href="/discover"
                className="inline-flex items-center h-[34px] mt-3 px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
              >
                Explore
              </Link>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
