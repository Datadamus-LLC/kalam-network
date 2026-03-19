'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RiArrowLeftLine } from '@remixicon/react';
import { api, ApiError } from '@/lib/api';

interface OrgMember {
  userId: string;
  role: string;
  displayName: string | null;
  hederaAccountId: string | null;
  joinedAt: string;
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

/** Role badge styles per spec */
function roleBadgeCls(role: string): string {
  switch (role.toLowerCase()) {
    case 'owner':   return 'bg-primary/12 text-primary';
    case 'admin':   return 'bg-white/[0.08] text-foreground';
    case 'member':  return 'bg-white/[0.05] text-muted-foreground';
    case 'viewer':  return 'bg-white/[0.03] text-muted-foreground/50';
    default:        return 'bg-white/[0.05] text-muted-foreground';
  }
}

/**
 * Organization members management page — /organization/members
 */
export default function OrganizationMembersPage() {
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Remove — guarded by confirmation dialog
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Confirmation dialogs
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null);

  // Pending invitations
  const [invitations, setInvitations] = useState<Array<{
    id: string; email: string; role: string; status: string; createdAt: string; expiresAt: string;
  }>>([]);

  const loadMembers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [membersData, invitationsData] = await Promise.all([
        api.getOrgMembers(),
        api.getOrgInvitations(),
      ]);
      setMembers(membersData as OrgMember[]);
      setInvitations(invitationsData as { id: string; email: string; role: string; status: string; createdAt: string; expiresAt: string; }[]);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load members',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

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

  // Show confirmation dialog before removing a member
  const handleRemoveRequest = useCallback(
    (userId: string) => {
      const member = members.find((m) => m.userId === userId);
      if (!member) return;
      setPendingRemoval({
        userId,
        memberName: member.displayName ?? member.hederaAccountId ?? `User ${member.userId.slice(0, 8)}…`,
      });
    },
    [members],
  );

  // Actually remove after confirmation
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

  // Show confirmation dialog before changing a role
  const handleRoleChangeRequest = useCallback(
    (userId: string, newRole: string) => {
      const member = members.find((m) => m.userId === userId);
      if (!member || member.role === newRole) return;
      setPendingRoleChange({
        userId,
        memberName: member.displayName ?? member.hederaAccountId ?? `User ${member.userId.slice(0, 8)}…`,
        fromRole: member.role,
        toRole: newRole,
      });
    },
    [members],
  );

  // Actually change role after confirmation
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

  return (
    <div className="flex min-h-full">
      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 border-r border-border">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-[18px] py-[12px] flex items-center gap-3">
          <Link
            href="/organization"
            className="flex items-center justify-center w-8 h-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            aria-label="Back to organization"
          >
            <RiArrowLeftLine size={18} />
          </Link>
          <h1 className="text-[17px] font-extrabold text-foreground">Members</h1>
        </div>

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
            {inviteError && <p className="text-[12px] text-[#e0245e] mt-2">{inviteError}</p>}
            {inviteSuccess && <p className="text-[12px] text-[#00ba7c] mt-2">{inviteSuccess}</p>}
          </div>

          {/* Errors */}
          {error && (
            <div className="border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-3 rounded-full text-[13px]">
              {error}
            </div>
          )}
          {removeError && (
            <div className="border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-3 rounded-full text-[13px]">
              {removeError}
            </div>
          )}

          {/* Members list */}
          {isLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-14 bg-white/[0.04] rounded-[14px]" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="text-[14px] text-muted-foreground text-center py-8">No members yet.</p>
          ) : (
            <div className="divide-y divide-border border border-border rounded-[14px] overflow-hidden">
              {members.map((member) => (
                <div key={member.userId} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.018] transition-colors">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-foreground truncate">
                      {member.displayName ?? member.hederaAccountId ?? `User ${member.userId.slice(0, 8)}…`}
                    </p>
                    {member.hederaAccountId && member.displayName && (
                      <p className="text-[12px] text-muted-foreground font-mono truncate">{member.hederaAccountId}</p>
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
              ))}
            </div>
          )}

          {/* Pending invitations */}
          {invitations.length > 0 && (
            <div>
              <p className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                Pending Invitations
              </p>
              <div className="space-y-2">
                {invitations.map((inv) => (
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
      </div>

      {/* ── Right panel ── */}
      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">
        <div className="border border-border rounded-[14px] p-4 space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Team</p>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">Total members</span>
            <span className="text-[13px] font-semibold text-foreground">{members.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">Pending invites</span>
            <span className="text-[13px] font-semibold text-foreground">{invitations.length}</span>
          </div>
        </div>
      </aside>

      {/* ── Dark confirmation dialog: role change ── */}
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

      {/* ── Dark confirmation dialog: remove member ── */}
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
