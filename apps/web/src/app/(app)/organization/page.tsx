'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { api, ApiError } from '@/lib/api';

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
    displayName: string | null;
    hederaAccountId: string | null;
    joinedAt: string;
  }>;
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

// Tab links — lemon underline on active (current path)
const ORG_TABS = [
  { label: 'Overview', href: '/organization' },
  { label: 'Members', href: '/organization/members' },
  { label: 'Broadcasts', href: '/broadcasts' },
  { label: 'Settings', href: '/organization/settings' },
];

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

  const loadOrg = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getMyOrganization();
      setOrg(data as OrgData | null);
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

  return (
    <div className="flex min-h-full">
      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 border-r border-border">
        {/* Org header */}
        <div className="px-[18px] pt-[20px] pb-4 border-b border-border">
          <div className="flex items-start gap-4">
            {/* Square-rounded org avatar per spec */}
            <Avatar className="w-14 h-14 rounded-[10px] flex-shrink-0">
              <AvatarFallback className="rounded-[10px] text-[20px]">
                {org.name[0]?.toUpperCase() ?? 'O'}
              </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
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

                {/* Action buttons — outline pill */}
                <Link
                  href="/organization/settings"
                  className="flex-shrink-0 flex items-center h-[34px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
                >
                  Settings
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs — lemon underline per spec */}
        <div className="flex border-b border-border">
          {ORG_TABS.map((tab) => {
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

        {/* Members preview */}
        <div className="px-[18px] py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider">
              Members ({org.members.length})
            </p>
            <Link
              href="/organization/members"
              className="text-[13px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Manage →
            </Link>
          </div>

          {org.members.length === 0 ? (
            <p className="text-[14px] text-muted-foreground text-center py-8">No members yet.</p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-[14px] overflow-hidden">
              {org.members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.018] transition-colors">
                  <div>
                    <p className="text-[14px] font-semibold text-foreground">
                      {member.displayName ?? member.hederaAccountId ?? `User ${member.userId.slice(0, 8)}…`}
                    </p>
                    {member.hederaAccountId && member.displayName && (
                      <p className="text-[12px] text-muted-foreground font-mono">{member.hederaAccountId}</p>
                    )}
                  </div>
                  <span className={cn('px-[8px] py-[2px] rounded-full text-[11px] font-semibold capitalize', roleBadgeCls(member.role))}>
                    {member.role}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* HCS attestation */}
          {org.hcsAttestationTopic && (
            <div className="mt-4 border border-border rounded-[14px] p-3 text-[12px] text-muted-foreground font-mono truncate">
              HCS: {org.hcsAttestationTopic}
              {org.hcsAttestationSeq != null && ` · Seq #${org.hcsAttestationSeq}`}
            </div>
          )}
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
