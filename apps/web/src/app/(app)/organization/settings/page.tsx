'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RiArrowLeftLine } from '@remixicon/react';
import { api, ApiError } from '@/lib/api';

interface OrgProfile {
  id: string;
  name: string;
  bio: string | null;
  category: string | null;
  website: string | null;
  kybStatus: string;
}

/**
 * Organization settings page — /organization/settings
 */
export default function OrganizationSettingsPage() {
  const [org, setOrg] = useState<OrgProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [category, setCategory] = useState('');
  const [website, setWebsite] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Transfer ownership
  const [transferUserId, setTransferUserId] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);

  const loadOrg = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await api.getMyOrganization();
      if (data) {
        setOrg(data as OrgProfile);
        setName(data.name ?? '');
        setBio(data.bio ?? '');
        setCategory(data.category ?? '');
        setWebsite(data.website ?? '');
      }
    } catch (err) {
      setLoadError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load organization',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOrg();
  }, [loadOrg]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSaving || !org) return;

      setIsSaving(true);
      setSaveError(null);
      setSaveSuccess(false);
      try {
        await api.updateOrganization({
          name: name.trim() || undefined,
          bio: bio.trim() || undefined,
          category: category.trim() || undefined,
          website: website.trim() || undefined,
        });
        setSaveSuccess(true);
      } catch (err) {
        setSaveError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to save changes',
        );
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, org, name, bio, category, website],
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
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Transfer failed',
      );
    } finally {
      setIsTransferring(false);
    }
  }, [transferUserId, isTransferring]);

  if (isLoading) {
    return (
      <div className="px-[18px] py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-5 bg-white/[0.06] rounded-full w-40" />
          <div className="h-[42px] bg-white/[0.06] rounded-full" />
          <div className="h-[42px] bg-white/[0.06] rounded-full" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-[18px] py-8">
        <div className="border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-3 rounded-[14px] text-[13px]">
          {loadError}
        </div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="px-[18px] py-16 text-center">
        <p className="text-[14px] text-muted-foreground">No organization found.</p>
        <Link href="/organization" className="text-[13px] text-muted-foreground hover:text-foreground mt-2 block transition-colors">
          Back to Organization
        </Link>
      </div>
    );
  }

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
          <h1 className="text-[17px] font-extrabold text-foreground">Organization Settings</h1>
        </div>

        <form onSubmit={(e) => { void handleSubmit(e); }}>
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
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your organization name"
                disabled={isSaving}
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
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Category"
                disabled={isSaving}
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
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://yourorg.com"
                disabled={isSaving}
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
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Short description of your organization"
                rows={3}
                disabled={isSaving}
                className="w-full rounded-[14px] border border-border bg-white/[0.04] px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 resize-none transition-colors"
              />
            </div>

            {/* Save */}
            <div className="px-[18px] py-[16px] space-y-2">
              {saveError && (
                <p className="text-[13px] text-[#e0245e]">{saveError}</p>
              )}
              {saveSuccess && (
                <p className="text-[13px] text-[#00ba7c]">Changes saved successfully.</p>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="h-[40px] px-[24px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving…' : 'Save Changes'}
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
                  className={cn('h-[34px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] transition-colors')}
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

      {/* ── Right panel ── */}
      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">
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
      </aside>
    </div>
  );
}
