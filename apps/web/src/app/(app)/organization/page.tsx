'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback } from '@/components/ui/Avatar';
import { api, ApiError } from '@/lib/api';
import {
  RiPriceTag3Line,
  RiGlobalLine,
  RiVerifiedBadgeLine,
  RiBuildingLine,
  RiExternalLinkLine,
} from '@remixicon/react';

// ─── Types ───────────────────────────────────────────────────────────────────

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
  members: OrgMember[];
}

interface OrgMember {
  userId: string;
  role: string;
  username: string | null;
  displayName: string | null;
  hederaAccountId: string | null;
  joinedAt: string;
}

interface RecentBroadcast {
  id: string;
  content: string;
  createdAt: string;
  sequenceNumber: number | null;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  expiresAt: string;
}

interface PendingRoleChange {
  userId: string;
  memberName: string;
  fromRole: string;
  toRole: string;
}

interface PendingRemoval {
  userId: string;
  memberName: string;
}

type ActiveTab = 'overview' | 'members' | 'settings';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function roleBadgeCls(role: string): string {
  switch (role.toLowerCase()) {
    case 'owner':  return 'bg-primary/12 text-primary';
    case 'admin':  return 'bg-white/[0.08] text-foreground';
    case 'member': return 'bg-white/[0.05] text-muted-foreground';
    case 'viewer': return 'bg-white/[0.03] text-muted-foreground/50';
    default:       return 'bg-white/[0.05] text-muted-foreground';
  }
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn('px-[8px] py-[2px] rounded-full text-[11px] font-semibold capitalize', roleBadgeCls(role))}>
      {role}
    </span>
  );
}

function kybBadgeCls(status: string): string {
  switch (status.toLowerCase()) {
    case 'verified':  return 'bg-[rgba(0,186,124,0.1)] text-[#00ba7c]';
    case 'certified': return 'bg-primary/12 text-primary';
    case 'pending':   return 'bg-primary/12 text-primary';
    case 'rejected':  return 'bg-[rgba(224,36,94,0.1)] text-[#e0245e]';
    default:          return 'bg-white/[0.06] text-muted-foreground';
  }
}

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'members',  label: 'Members'  },
  { id: 'settings', label: 'Settings' },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrganizationPage() {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [org, setOrg] = useState<OrgData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // ── Create-org form state ────────────────────────────────────────────────────
  const [isCreating, setIsCreating] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [newOrgCategory, setNewOrgCategory] = useState('');
  const [newOrgWebsite, setNewOrgWebsite] = useState('');
  const [newOrgBio, setNewOrgBio] = useState('');

  // ── Overview tab state ──────────────────────────────────────────────────────
  const [recentBroadcasts, setRecentBroadcasts] = useState<RecentBroadcast[]>([]);
  const [broadcastsLoading, setBroadcastsLoading] = useState(false);

  // ── Members tab state ────────────────────────────────────────────────────────
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  // ── Settings tab state ──────────────────────────────────────────────────────
  const [settingsName, setSettingsName] = useState('');
  const [settingsCategory, setSettingsCategory] = useState('');
  const [settingsWebsite, setSettingsWebsite] = useState('');
  const [settingsBio, setSettingsBio] = useState('');
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState(false);
  const [transferUserId, setTransferUserId] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);

  // ── Load org ─────────────────────────────────────────────────────────────────

  const loadOrg = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getMyOrganization();
      setOrg(data as OrgData | null);

      if (data) {
        // Pre-populate settings fields
        setSettingsName(data.name ?? '');
        setSettingsCategory(data.category ?? '');
        setSettingsWebsite(data.website ?? '');
        setSettingsBio(data.bio ?? '');

        // Fetch recent broadcasts (non-blocking)
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

  // ── Load members when switching to Members tab ───────────────────────────────

  useEffect(() => {
    if (activeTab !== 'members' || !org) return;

    setMembersLoading(true);
    setMembersError(null);
    Promise.all([
      api.getOrgMembers(),
      api.getOrgInvitations(),
    ])
      .then(([membersData, invitationsData]) => {
        setMembers(membersData as OrgMember[]);
        setPendingInvitations(invitationsData as PendingInvitation[]);
      })
      .catch((err) => {
        setMembersError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to load members',
        );
      })
      .finally(() => setMembersLoading(false));
  }, [activeTab, org]);

  // ── Create org handler ────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!createName.trim() || isCreating) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      await api.createOrganization(createName.trim());
      const hasExtras = newOrgCategory.trim() || newOrgBio.trim() || newOrgWebsite.trim();
      if (hasExtras) {
        await api.updateOrganization({
          ...(newOrgCategory.trim() && { category: newOrgCategory.trim() }),
          ...(newOrgBio.trim()      && { bio: newOrgBio.trim() }),
          ...(newOrgWebsite.trim()  && { website: newOrgWebsite.trim() }),
        });
      }
      await loadOrg();
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : 'Failed to create organization');
    } finally {
      setIsCreating(false);
    }
  }, [createName, newOrgCategory, newOrgBio, newOrgWebsite, isCreating, loadOrg]);

  // ── Members handlers ──────────────────────────────────────────────────────────

  const handleInvite = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = inviteEmail.trim();
      if (!trimmed || isInviting) return;

      setIsInviting(true);
      setInviteError(null);
      setInviteSuccess(null);
      try {
        await api.inviteMember(trimmed, inviteRole);
        setInviteEmail('');
        setInviteSuccess(`Invitation sent to ${trimmed}`);
      } catch (err) {
        setInviteError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to send invitation',
        );
      } finally {
        setIsInviting(false);
      }
    },
    [inviteEmail, inviteRole, isInviting],
  );

  const handleRemoveRequest = useCallback(
    (userId: string) => {
      const member = members.find((m) => m.userId === userId);
      if (!member) return;
      const memberName = member.username
        ? `@${member.username}`
        : member.displayName ?? member.hederaAccountId ?? `User ${member.userId.slice(0, 8)}…`;
      setPendingRemoval({ userId, memberName });
    },
    [members],
  );

  const confirmRemove = useCallback(async () => {
    if (!pendingRemoval || removingUserId) return;
    const { userId } = pendingRemoval;

    setPendingRemoval(null);
    setRemovingUserId(userId);
    setRemoveError(null);
    try {
      await api.removeMember(userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    } catch (err) {
      setRemoveError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to remove member',
      );
    } finally {
      setRemovingUserId(null);
    }
  }, [pendingRemoval, removingUserId]);

  const handleRoleChangeRequest = useCallback(
    (userId: string, newRole: string) => {
      const member = members.find((m) => m.userId === userId);
      if (!member || member.role === newRole) return;
      const memberName = member.username
        ? `@${member.username}`
        : member.displayName ?? member.hederaAccountId ?? `User ${member.userId.slice(0, 8)}…`;
      setPendingRoleChange({
        userId,
        memberName,
        fromRole: member.role,
        toRole: newRole,
      });
    },
    [members],
  );

  const confirmRoleChange = useCallback(async () => {
    if (!pendingRoleChange) return;
    const { userId, toRole } = pendingRoleChange;

    setPendingRoleChange(null);
    try {
      await api.changeRole(userId, toRole);
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role: toRole } : m)),
      );
    } catch (err) {
      setRemoveError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to update role',
      );
    }
  }, [pendingRoleChange]);

  // ── Settings handlers ─────────────────────────────────────────────────────────

  const handleSettingsSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSavingSettings || !org) return;

      setIsSavingSettings(true);
      setSettingsError(null);
      setSettingsSuccess(false);
      try {
        await api.updateOrganization({
          name:     settingsName.trim()     || undefined,
          bio:      settingsBio.trim()      || undefined,
          category: settingsCategory.trim() || undefined,
          website:  settingsWebsite.trim()  || undefined,
        });
        setSettingsSuccess(true);
        // Refresh org data so header reflects new name/bio/etc.
        await loadOrg();
      } catch (err) {
        setSettingsError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to save changes',
        );
      } finally {
        setIsSavingSettings(false);
      }
    },
    [isSavingSettings, org, settingsName, settingsBio, settingsCategory, settingsWebsite, loadOrg],
  );

  const handleTransferOwnership = useCallback(async () => {
    if (!transferUserId.trim() || isTransferring) return;
    setIsTransferring(true);
    setTransferError(null);
    try {
      await api.transferOwnership(transferUserId.trim());
      setShowTransferConfirm(false);
      setTransferUserId('');
    } catch (err) {
      setTransferError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Transfer failed',
      );
    } finally {
      setIsTransferring(false);
    }
  }, [transferUserId, isTransferring]);

  // ── Loading / error states ───────────────────────────────────────────────────

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

  // ── No-org: create form ───────────────────────────────────────────────────────

  if (!org) {
    return (
      <div className="flex min-h-full">
        <div className="flex-1 border-r border-border">
          <div className="max-w-[500px] mx-auto py-10 px-5">
            <div className="text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <RiBuildingLine size={30} className="text-primary" />
              </div>
              <h1 className="text-[22px] font-extrabold text-foreground mb-2">Create Your Organization</h1>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Set up your business presence on Kalam — broadcast to followers, manage your team, and build your Hedera identity.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em] mb-1.5 block">
                  Organization Name <span className="text-[#e0245e]">*</span>
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="Acme Corp."
                  className="w-full h-[44px] rounded-[10px] border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em] mb-1.5 block">
                  Category <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={newOrgCategory}
                  onChange={(e) => setNewOrgCategory(e.target.value)}
                  placeholder="e.g. Finance, Technology, Healthcare"
                  className="w-full h-[44px] rounded-[10px] border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em] mb-1.5 block">
                  Website <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="url"
                  value={newOrgWebsite}
                  onChange={(e) => setNewOrgWebsite(e.target.value)}
                  placeholder="https://yourorg.com"
                  className="w-full h-[44px] rounded-[10px] border border-border bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors"
                />
              </div>

              <div>
                <label className="text-[12px] font-semibold text-muted-foreground uppercase tracking-[.05em] mb-1.5 block">
                  Description <span className="text-muted-foreground/40 font-normal normal-case">(optional)</span>
                </label>
                <textarea
                  value={newOrgBio}
                  onChange={(e) => setNewOrgBio(e.target.value)}
                  placeholder="What does your organization do?"
                  rows={3}
                  className="w-full rounded-[10px] border border-border bg-white/[0.04] px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 transition-colors resize-none"
                />
              </div>
            </div>

            {createError && (
              <p className="text-[13px] text-[#e0245e] mt-3">{createError}</p>
            )}

            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={!createName.trim() || isCreating}
              className="w-full h-[50px] rounded-full bg-primary text-primary-foreground font-bold text-[15px] mt-6 disabled:opacity-40 transition-opacity hover:opacity-90"
            >
              {isCreating ? 'Creating…' : 'Create Organization'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main dashboard ────────────────────────────────────────────────────────────

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

        {/* ── Tab bar ── */}
        <div className="flex border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-3 text-[14px] font-semibold border-b-2 transition-colors -mb-[1px]',
                activeTab === tab.id
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-white/[0.03]',
              )}
            >
              {tab.label}
            </button>
          ))}
          {/* Broadcasts — separate page, external link */}
          <a
            href={`/broadcasts?orgId=${encodeURIComponent(org.id)}`}
            className="px-4 py-3 text-[14px] font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 border-b-2 border-transparent -mb-[1px]"
          >
            Broadcasts <RiExternalLinkLine size={12} />
          </a>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            OVERVIEW TAB
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="space-y-5 p-5">

            {/* Org profile card */}
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
                <a
                  href={`/broadcasts?orgId=${encodeURIComponent(org.id)}`}
                  className="text-[12px] text-primary hover:opacity-80 transition-opacity"
                >
                  See all →
                </a>
              </div>
              {broadcastsLoading ? (
                <div className="text-[13px] text-muted-foreground/60">Loading…</div>
              ) : recentBroadcasts.length === 0 ? (
                <div className="rounded-[12px] border border-dashed border-border/60 p-4 text-center">
                  <p className="text-[13px] text-muted-foreground">No broadcasts yet</p>
                  <a
                    href={`/broadcasts?orgId=${encodeURIComponent(org.id)}`}
                    className="text-[12px] text-primary mt-1 block hover:opacity-80"
                  >
                    Publish your first broadcast →
                  </a>
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
                <button
                  type="button"
                  onClick={() => setActiveTab('members')}
                  className="text-[12px] text-primary hover:opacity-80 transition-opacity"
                >
                  Manage →
                </button>
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
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            MEMBERS TAB
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'members' && (
          <div className="px-[18px] py-4 space-y-4">

            {/* Invite form */}
            <div className="border border-border rounded-[14px] p-4">
              <p className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                Invite Member
              </p>
              <form onSubmit={(e) => { void handleInvite(e); }} className="flex items-center gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="member@example.com"
                  disabled={isInviting}
                  className="flex-1 h-[38px] rounded-full border border-border bg-white/[0.04] px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
                />
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  disabled={isInviting}
                  className="h-[38px] rounded-full border border-border bg-white/[0.04] px-3 text-[13px] text-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 appearance-none"
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="submit"
                  disabled={!inviteEmail.trim() || isInviting}
                  className="h-[38px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isInviting ? '…' : 'Invite'}
                </button>
              </form>
              {inviteError   && <p className="text-[12px] text-[#e0245e] mt-2">{inviteError}</p>}
              {inviteSuccess && <p className="text-[12px] text-[#00ba7c] mt-2">{inviteSuccess}</p>}
            </div>

            {/* Errors */}
            {membersError && (
              <div className="border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-3 rounded-full text-[13px]">
                {membersError}
              </div>
            )}
            {removeError && (
              <div className="border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-3 rounded-full text-[13px]">
                {removeError}
              </div>
            )}

            {/* Members list */}
            {membersLoading ? (
              <div className="animate-pulse space-y-2">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 bg-white/[0.04] rounded-[14px]" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <p className="text-[14px] text-muted-foreground text-center py-8">No members yet.</p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-[14px] overflow-hidden">
                {members.map((member) => {
                  const primaryName = member.username
                    ? `@${member.username}`
                    : member.displayName ?? member.hederaAccountId ?? `User ${member.userId.slice(0, 8)}…`;
                  const subLine = member.username
                    ? (member.displayName ?? member.hederaAccountId)
                    : member.hederaAccountId && !member.displayName
                      ? null
                      : member.hederaAccountId ?? null;
                  return (
                    <div key={member.userId} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.018] transition-colors">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-foreground truncate">{primaryName}</p>
                        {subLine && (
                          <p className="text-[12px] text-muted-foreground font-mono truncate">{subLine}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground">
                          Joined {new Date(member.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {member.role !== 'owner' && (
                          <select
                            value={member.role}
                            onChange={(e) => handleRoleChangeRequest(member.userId, e.target.value)}
                            className="h-[30px] rounded-full border border-border bg-white/[0.04] px-3 text-[12px] text-foreground focus:outline-none appearance-none"
                          >
                            <option value="admin">Admin</option>
                            <option value="member">Member</option>
                            <option value="viewer">Viewer</option>
                          </select>
                        )}
                        {member.role === 'owner' && (
                          <span className={cn('px-[8px] py-[2px] rounded-full text-[11px] font-semibold', roleBadgeCls('owner'))}>
                            Owner
                          </span>
                        )}
                        {member.role !== 'owner' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveRequest(member.userId)}
                            disabled={removingUserId === member.userId}
                            className="text-[12px] text-muted-foreground hover:text-[#e0245e] disabled:opacity-40 transition-colors"
                          >
                            {removingUserId === member.userId ? '…' : 'Remove'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Pending invitations */}
            {pendingInvitations.length > 0 && (
              <div>
                <p className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Pending Invitations
                </p>
                <div className="space-y-2">
                  {pendingInvitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between border border-border rounded-[10px] px-3 py-2 opacity-60">
                      <div>
                        <p className="text-[13px] font-semibold text-foreground">{inv.email}</p>
                        <p className="text-[11px] text-muted-foreground capitalize">
                          {inv.role} · Expires {new Date(inv.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="px-[8px] py-[2px] rounded-full text-[11px] font-semibold bg-primary/12 text-primary capitalize">
                        {inv.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            SETTINGS TAB
        ══════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div>
            <form onSubmit={(e) => { void handleSettingsSubmit(e); }}>
              <div className="divide-y divide-border">

                {/* Name row */}
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <label htmlFor="org-name" className="text-[14px] font-semibold text-foreground">
                      Organization Name
                    </label>
                    <p className="text-[12px] text-muted-foreground mt-0.5">Your public display name</p>
                  </div>
                  <input
                    id="org-name"
                    type="text"
                    value={settingsName}
                    onChange={(e) => setSettingsName(e.target.value)}
                    placeholder="Your organization name"
                    disabled={isSavingSettings}
                    className="w-[220px] flex-shrink-0 h-[38px] rounded-full border border-border bg-white/[0.04] px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
                  />
                </div>

                {/* Category row */}
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <label htmlFor="org-category" className="text-[14px] font-semibold text-foreground">
                      Category
                    </label>
                    <p className="text-[12px] text-muted-foreground mt-0.5">e.g. Finance, Technology</p>
                  </div>
                  <input
                    id="org-category"
                    type="text"
                    value={settingsCategory}
                    onChange={(e) => setSettingsCategory(e.target.value)}
                    placeholder="Category"
                    disabled={isSavingSettings}
                    className="w-[220px] flex-shrink-0 h-[38px] rounded-full border border-border bg-white/[0.04] px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
                  />
                </div>

                {/* Website row */}
                <div className="px-[18px] py-[16px] flex items-center justify-between gap-4">
                  <div>
                    <label htmlFor="org-website" className="text-[14px] font-semibold text-foreground">
                      Website
                    </label>
                    <p className="text-[12px] text-muted-foreground mt-0.5">Your organization&apos;s website</p>
                  </div>
                  <input
                    id="org-website"
                    type="url"
                    value={settingsWebsite}
                    onChange={(e) => setSettingsWebsite(e.target.value)}
                    placeholder="https://yourorg.com"
                    disabled={isSavingSettings}
                    className="w-[220px] flex-shrink-0 h-[38px] rounded-full border border-border bg-white/[0.04] px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
                  />
                </div>

                {/* Bio row */}
                <div className="px-[18px] py-[16px]">
                  <div className="mb-2">
                    <label htmlFor="org-bio" className="text-[14px] font-semibold text-foreground">Bio</label>
                    <p className="text-[12px] text-muted-foreground">Short description</p>
                  </div>
                  <textarea
                    id="org-bio"
                    value={settingsBio}
                    onChange={(e) => setSettingsBio(e.target.value)}
                    placeholder="Short description of your organization"
                    rows={3}
                    disabled={isSavingSettings}
                    className="w-full rounded-[14px] border border-border bg-white/[0.04] px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 resize-none transition-colors"
                  />
                </div>

                {/* Save */}
                <div className="px-[18px] py-[16px] space-y-2">
                  {settingsError && (
                    <p className="text-[13px] text-[#e0245e]">{settingsError}</p>
                  )}
                  {settingsSuccess && (
                    <p className="text-[13px] text-[#00ba7c]">Changes saved successfully.</p>
                  )}
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="h-[40px] px-[24px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSavingSettings ? 'Saving…' : 'Save Changes'}
                  </button>
                </div>

              </div>
            </form>

            {/* Danger Zone */}
            <div className="px-[18px] py-[16px] mt-4 border-t border-[rgba(224,36,94,0.2)]">
              <p className="text-[13px] font-bold text-[#e0245e] uppercase tracking-wider mb-1">
                Danger Zone
              </p>
              <p className="text-[12px] text-muted-foreground mb-3">
                Transfer ownership to another member. You will lose owner privileges.
              </p>

              {!showTransferConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowTransferConfirm(true)}
                  className="h-[34px] px-[16px] rounded-full border border-[rgba(224,36,94,0.3)] text-[#e0245e] text-[13px] font-semibold hover:bg-[rgba(224,36,94,0.1)] transition-colors"
                >
                  Transfer Ownership
                </button>
              ) : (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={transferUserId}
                    onChange={(e) => setTransferUserId(e.target.value)}
                    placeholder="New owner user ID"
                    className="w-full h-[38px] rounded-full border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.04)] px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[rgba(224,36,94,0.5)] transition-colors"
                  />
                  {transferError && <p className="text-[12px] text-[#e0245e]">{transferError}</p>}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setShowTransferConfirm(false); setTransferError(null); }}
                      className="h-[34px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => { void handleTransferOwnership(); }}
                      disabled={isTransferring || !transferUserId.trim()}
                      className="h-[34px] px-[14px] rounded-full border border-[rgba(224,36,94,0.3)] text-[#e0245e] text-[13px] font-semibold hover:bg-[rgba(224,36,94,0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {isTransferring ? 'Transferring…' : 'Confirm Transfer'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Right panel — content varies per tab ── */}
      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">

        {/* Overview sidebar */}
        {activeTab === 'overview' && (
          <>
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

            <div className="border border-border rounded-[14px] p-4">
              <p className="text-[15px] font-bold text-foreground mb-2">Team</p>
              <p className="text-[13px] text-muted-foreground mb-3">Invite members to your organization.</p>
              <button
                type="button"
                onClick={() => setActiveTab('members')}
                className="inline-flex items-center h-[34px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
              >
                Invite members
              </button>
            </div>
          </>
        )}

        {/* Members sidebar */}
        {activeTab === 'members' && (
          <div className="border border-border rounded-[14px] p-4 space-y-2">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Team</p>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">Total members</span>
              <span className="text-[13px] font-semibold text-foreground">{members.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">Pending invites</span>
              <span className="text-[13px] font-semibold text-foreground">{pendingInvitations.length}</span>
            </div>
          </div>
        )}

        {/* Settings sidebar */}
        {activeTab === 'settings' && (
          <div className="border border-border rounded-[14px] p-4 space-y-2">
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">About</p>
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-muted-foreground">KYB Status</span>
              <span className="text-[13px] text-foreground capitalize">{org.kybStatus}</span>
            </div>
            {org.category && (
              <div className="flex items-center justify-between">
                <span className="text-[13px] text-muted-foreground">Category</span>
                <span className="text-[13px] text-foreground">{org.category}</span>
              </div>
            )}
          </div>
        )}

      </aside>

      {/* ── Confirmation dialog: role change ── */}
      {pendingRoleChange && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-background border border-white/[0.14] rounded-[16px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] max-w-sm w-full mx-4 p-5">
            <h2 className="text-[17px] font-extrabold text-foreground mb-2">Confirm Role Change</h2>
            <p className="text-[14px] text-muted-foreground mb-4">
              Change <strong className="text-foreground">{pendingRoleChange.memberName}</strong>&apos;s role from{' '}
              <strong className="text-foreground">{pendingRoleChange.fromRole}</strong> to{' '}
              <strong className="text-foreground">{pendingRoleChange.toRole}</strong>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRoleChange(null)}
                className="h-[38px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void confirmRoleChange(); }}
                className="h-[38px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirmation dialog: remove member ── */}
      {pendingRemoval && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-background border border-white/[0.14] rounded-[16px] shadow-[0_32px_80px_rgba(0,0,0,0.8)] max-w-sm w-full mx-4 p-5">
            <h2 className="text-[17px] font-extrabold text-foreground mb-2">Remove Member</h2>
            <p className="text-[14px] text-muted-foreground mb-4">
              Remove <strong className="text-foreground">{pendingRemoval.memberName}</strong> from the organization?
              This cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingRemoval(null)}
                className="h-[38px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void confirmRemove(); }}
                className="h-[38px] px-[16px] rounded-full border border-[rgba(224,36,94,0.3)] text-[#e0245e] text-[13px] font-semibold hover:bg-[rgba(224,36,94,0.1)] transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
