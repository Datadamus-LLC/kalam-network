'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { api, ApiError } from '@/lib/api';
import { RiPriceTag3Line, RiGlobalLine, RiVerifiedBadgeLine } from '@remixicon/react';

interface OrgData {
  id: string;
  name: string;
  kybStatus: string;
  badgeTier: 'basic' | 'verified' | 'certified' | null;
  hcsAttestationTopic: string | null;
  hcsAttestationSeq: number | null;
  kybVerifiedAt: string | null;
  bio: string | null;
  category: string | null;
  website: string | null;
  logoCid: string | null;
  members: Array<{
    userId: string;
    role: string;
    username: string | null;
    displayName: string | null;
    hederaAccountId: string | null;
    joinedAt: string;
  }>;
}

interface RecentBroadcast {
  id: string;
  content: string;
  createdAt: string;
  sequenceNumber: number | null;
}

/** Role badge style per spec */
function roleBadgeCls(role: string): string {
  switch (role.toLowerCase()) {
    case 'owner':   return 'bg-primary/12 text-primary';
    case 'admin':   return 'bg-white/[0.08] text-foreground';
    case 'member':  return 'bg-white/[0.05] text-muted-foreground';
    case 'viewer':  return 'bg-white/[0.03] text-muted-foreground/50';
    default:        return 'bg-white/[0.05] text-muted-foreground';
  }
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn('px-[8px] py-[2px] rounded-full text-[11px] font-semibold capitalize', roleBadgeCls(role))}>
      {role}
    </span>
  );
}

/** KYB status badge */
function kybBadgeCls(status: string): string {
  switch (status.toLowerCase()) {
    case 'verified':  return 'bg-[rgba(0,186,124,0.1)] text-[#00ba7c]';
    case 'certified': return 'bg-primary/12 text-primary';
    case 'pending':   return 'bg-primary/12 text-primary';
    case 'rejected':  return 'bg-[rgba(224,36,94,0.1)] text-[#e0245e]';
    default:          return 'bg-white/[0.06] text-muted-foreground';
  }
}

/** Build tab links with the org ID for broadcasts deep-link */
function buildOrgTabs(orgId: string) {
  return [
    { label: 'Overview', href: '/organization' },
    { label: 'Members', href: '/organization/members' },
    { label: 'Broadcasts', href: `/broadcasts?orgId=${encodeURIComponent(orgId)}` },
    { label: 'Settings', href: '/organization/settings' },
  ];
}

/**
 * Organization dashboard — /organization
 */
export default function OrganizationPage() {
  const [org, setOrg] = useState<OrgData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [recentBroadcasts, setRecentBroadcasts] = useState<RecentBroadcast[]>([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(false);

  const loadOrg = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getMyOrganization();
      setOrg(data as OrgData | null);

      if (data) {
        // Fetch recent broadcasts for this org (non-blocking)
        setBroadcastsLoading(true);
        api.getBroadcastFeed(3)
          .then((result) => {
            setRecentBroadcasts(result.messages.slice(0, 3).map((m) => ({
              id: m.id,
              content: m.content,
              createdAt: m.createdAt,
              sequenceNumber: m.sequenceNumber ?? null,
            })));
          })
          .catch(() => { /* non-critical */ })
          .finally(() => setBroadcastsLoading(false));
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setOrg(null);
      } else {
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load organization',
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  if (isLoading) {
    return (
      <div className="flex min-h-full">
        <div className="flex-1 border-r border-border px-[18px] py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-5 bg-white/[0.06] rounded-full w-48" />
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

  const handleCreateOrg = async () => {
    if (!createName.trim()) { setCreateError('Organization name is required'); return; }
    setIsCreating(true);
    setCreateError(null);
    try {
      await api.createOrganization(createName.trim());
      await loadOrg();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  };

  if (!org) {
    return (
      <div className="flex min-h-full">
        <div className="flex-1 border-r border-border px-[18px] py-16">
          <div className="max-w-[420px] mx-auto text-center">
            <h1 className="text-[20px] font-extrabold text-foreground mb-2">Create Your Organization</h1>
            <p className="text-[14px] text-muted-foreground mb-8">Set up your business presence on the platform</p>

            <div className="text-left space-y-3">
              <div>
                <label htmlFor="org-name" className="block text-[12px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Organization Name
                </label>
                <input
                  id="org-name"
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleCreateOrg()}
                  placeholder="Acme Corp."
                  className="w-full h-[42px] rounded-full border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>

              {createError && (
                <p className="text-[12px] text-[#e0245e]">{createError}</p>
              )}

              <button
                type="button"
                onClick={() => void handleCreateOrg()}
                disabled={isCreating || !createName.trim()}
                className="w-full h-[42px] rounded-full bg-primary text-primary-foreground font-semibold text-[15px] disabled:opacity-50 transition-opacity hover:opacity-90"
              >
                {isCreating ? 'Creating…' : 'Create Organization'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const orgTabs = buildOrgTabs(org.id);

  return (
    <div className="flex min-h-full">
      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 border-r border-border">
        {/* Back to Feed */}
        <div className="px-[18px] pt-[14px] pb-0">
          <Link
            href="/feed"
            className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to Feed
          </Link>
        </div>

        {/* Org header */}
        <div className="px-[18px] pt-[12px] pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            {/* Square-rounded org avatar per spec */}
            <Avatar className="w-14 h-14 rounded-[10px] flex-shrink-0">
              <AvatarFallback className="rounded-[10px] text-[20px]">
                {org.name[0]?.toUpperCase() ?? 'O'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="text-[20px] font-extrabold text-foreground truncate">{org.name}</h1>
                    {org.kybStatus && (
                      <span className={cn('px-[8px] py-[2px] rounded-full text-[11px] font-semibold', kybBadgeCls(org.kybStatus))}>
                        {org.kybStatus.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {org.category && (
                    <p className="text-[13px] text-muted-foreground mt-0.5">{org.category}</p>
                  )}
                  {org.bio && (
                    <p className="text-[14px] text-muted-foreground mt-2 leading-[1.4]">{org.bio}</p>
                  )}
                  {org.website && (
                    <a
                      href={org.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[13px] text-muted-foreground hover:text-foreground mt-1 block transition-colors"
                    >
                      {org.website}
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs — lemon underline per spec */}
        <div className="flex border-b border-border">
          {orgTabs.map((tab) => {
            const isActive = tab.href === '/organization';
            return (
              <Link
                key={tab.label}
                href={tab.href}
                className={cn(
                  'flex-1 py-[14px] text-center text-[14px] font-semibold transition-colors border-b-2 -mb-[1px]',
                  isActive
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.03]',
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {/* ── Overview Content ──────────────────────────────── */}
        <div className="space-y-5 p-5">

          {/* Org Profile Card — bio, category, website, HCS */}
          {(org.bio || org.category || org.website || org.hcsAttestationTopic) && (
            <div className="rounded-[14px] border border-border bg-white/[0.02] p-4 space-y-3">
              {org.bio && (
                <p className="text-[14px] text-muted-foreground leading-relaxed">{org.bio}</p>
              )}
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-[13px]">
                {org.category && (
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <RiPriceTag3Line size={13} />
                    <span>{org.category}</span>
                  </div>
                )}
                {org.website && (
                  <a
                    href={org.website.startsWith('http') ? org.website : `https://${org.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-primary hover:opacity-80 transition-opacity"
                  >
                    <RiGlobalLine size={13} />
                    <span className="truncate max-w-[200px]">{org.website.replace(/^https?:\/\//, '')}</span>
                  </a>
                )}
              </div>
              {org.hcsAttestationTopic && (
                <p className="text-[11px] text-muted-foreground/50 font-mono flex items-center gap-1">
                  <RiVerifiedBadgeLine size={11} />
                  HCS: {org.hcsAttestationTopic}
                </p>
              )}
            </div>
          )}

          {/* Recent Broadcasts */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em]">
                Recent Broadcasts
              </h3>
              <Link
                href={`/broadcasts?orgId=${org.id}`}
                className="text-[12px] text-primary hover:opacity-80 transition-opacity"
              >
                See all →
              </Link>
            </div>
            {broadcastsLoading ? (
              <div className="text-[13px] text-muted-foreground/60">Loading…</div>
            ) : recentBroadcasts.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-border/60 p-4 text-center">
                <p className="text-[13px] text-muted-foreground">No broadcasts yet</p>
                <Link
                  href={`/broadcasts?orgId=${org.id}`}
                  className="text-[12px] text-primary mt-1 block hover:opacity-80"
                >
                  Publish your first broadcast →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentBroadcasts.map((b) => (
                  <div key={b.id} className="rounded-[10px] border border-border bg-white/[0.02] p-3">
                    <p className="text-[13px] text-foreground line-clamp-2 leading-relaxed">{b.content}</p>
                    <p className="text-[11px] text-muted-foreground mt-1.5">
                      {new Date(b.createdAt).toLocaleDateString()} · Seq #{b.sequenceNumber ?? '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Members preview */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em]">
                Members ({org.members.length})
              </h3>
              <Link
                href="/organization/members"
                className="text-[12px] text-primary hover:opacity-80 transition-opacity"
              >
                Manage →
              </Link>
            </div>
            <div className="space-y-1">
              {org.members.slice(0, 5).map((m) => (
                <div key={m.userId} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center text-[11px] font-bold text-foreground flex-shrink-0">
                      {(m.displayName || m.hederaAccountId || '?')[0]?.toUpperCase()}
                    </div>
                    <span className="text-[13px] font-medium text-foreground">
                      {m.username ? `@${m.username}` : (m.displayName ?? 'Member')}
                    </span>
                  </div>
                  <RoleBadge role={m.role} />
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Right panel ── */}
      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">
        {/* Org stats */}
        <div className="border border-border rounded-[14px] p-4 space-y-3">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Org Stats</p>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">Members</span>
              <span className="text-[13px] font-semibold text-foreground">{org.members.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">KYB Status</span>
              <span className={cn('text-[11px] px-[8px] py-[2px] rounded-full font-semibold', kybBadgeCls(org.kybStatus))}>
                {org.kybStatus}
              </span>
            </div>
          </div>
        </div>

        {/* Invite button */}
        <div className="border border-border rounded-[14px] p-4">
          <p className="text-[15px] font-bold text-foreground mb-2">Team</p>
          <p className="text-[13px] text-muted-foreground mb-3">Invite members to your organization.</p>
          <Link
            href="/organization/members"
            className="inline-flex items-center h-[34px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
          >
            Invite members
          </Link>
        </div>
      </aside>
    </div>
  );
}
