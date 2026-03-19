'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import { RiRefreshLine, RiLoader4Line, RiBroadcastLine } from '@remixicon/react';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { useAuthStore } from '@/stores/auth.store';

interface BroadcastMessage {
  id: string;
  organizationId: string;
  orgName: string | null;
  content: string;
  hcsTopicId: string | null;
  sequenceNumber: number | null;
  createdAt: string;
}

interface OrganizationSummary {
  id: string;
  name: string;
}

/**
 * Broadcasts page — /broadcasts
 *
 * Displays broadcast messages from organizations the user subscribes to.
 * For business accounts, also provides a "Publish" action for their own org.
 */
export default function BroadcastsPage() {
  const user = useAuthStore((s) => s.user);
  const isBusiness = user?.accountType === 'business';

  const [messages, setMessages] = useState<BroadcastMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);

  // Cache the user's organization — fetched once on mount for business accounts.
  const [myOrg, setMyOrg] = useState<OrganizationSummary | null>(null);

  // Subscribe to a new channel
  const [orgIdInput, setOrgIdInput] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);

  // Clear stale subscribe error on mount. Next.js App Router can keep
  // component state alive across client-side navigations, which means a
  // "Validation failed (uuid v 4 is expected)" error from a prior session
  // would reappear immediately on the next visit before any user input.
  useEffect(() => {
    setSubscribeError(null);
  }, []);

  // Publish broadcast (business only)
  const [publishContent, setPublishContent] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const loadFeed = useCallback(async (cursor?: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.getBroadcastFeed(20, cursor);
      if (cursor) {
        setMessages((prev) => [...prev, ...result.messages]);
      } else {
        setMessages(result.messages);
      }
      setHasMore(result.hasMore);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load broadcasts',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed]);

  // Fetch the user's organization once on mount (business accounts only).
  useEffect(() => {
    if (!isBusiness) return;
    api.getMyOrganization()
      .then((org) => {
        if (org) {
          setMyOrg({ id: org.id, name: org.name });
        }
      })
      .catch(() => {
        // Non-critical — publish form will show an error if needed
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount — isBusiness is stable for a session

  const handleSubscribe = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = orgIdInput.trim();
      if (!trimmed || isSubscribing) return;

      setIsSubscribing(true);
      setSubscribeError(null);
      try {
        await api.subscribeToBroadcast(trimmed);
        setOrgIdInput('');
        await loadFeed();
      } catch (err) {
        setSubscribeError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to subscribe',
        );
      } finally {
        setIsSubscribing(false);
      }
    },
    [orgIdInput, isSubscribing, loadFeed],
  );

  const handlePublish = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = publishContent.trim();
      if (!trimmed || isPublishing) return;

      if (!myOrg) {
        setPublishError('No organization found. Create one first.');
        return;
      }

      setIsPublishing(true);
      setPublishError(null);
      try {
        await api.publishBroadcast(myOrg.id, trimmed);
        setPublishContent('');
        await loadFeed();
      } catch (err) {
        setPublishError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to publish',
        );
      } finally {
        setIsPublishing(false);
      }
    },
    [publishContent, isPublishing, loadFeed, myOrg],
  );

  return (
    <div className="flex min-h-full">
      <div className="flex-1 min-w-0 border-r border-border">
        {/* Sticky header */}
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-[18px] py-[14px] flex items-center justify-between">
          <h1 className="text-[17px] font-extrabold text-foreground">Broadcasts</h1>
          <button
            type="button"
            onClick={() => void loadFeed()}
            disabled={isLoading}
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
            aria-label="Refresh broadcasts"
          >
            <RiRefreshLine size={18} className={cn({ 'animate-spin': isLoading })} />
          </button>
        </div>

        <div className="px-[18px] py-4 space-y-4">
          {/* Business: Publish broadcast */}
          {isBusiness && (
            <div className="border border-border rounded-[14px] p-4">
              <p className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                {myOrg ? `Broadcast as ${myOrg.name}` : 'Publish a Broadcast'}
              </p>
              <form onSubmit={(e) => { void handlePublish(e); }} className="space-y-2">
                <textarea
                  value={publishContent}
                  onChange={(e) => setPublishContent(e.target.value)}
                  placeholder="Write your broadcast message…"
                  rows={3}
                  disabled={isPublishing}
                  className="w-full rounded-[14px] border border-border bg-white/[0.04] px-4 py-3 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 resize-none transition-colors"
                />
                {publishError && (
                  <p className="text-[12px] text-[#e0245e]">{publishError}</p>
                )}
                <button
                  type="submit"
                  disabled={!publishContent.trim() || isPublishing}
                  className="h-[36px] px-[16px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {isPublishing ? 'Publishing…' : 'Publish'}
                </button>
              </form>
            </div>
          )}

          {/* Subscribe to a channel */}
          <div className="border border-border rounded-[14px] p-4">
            <p className="text-[13px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
              Subscribe to a Channel
            </p>
            <form onSubmit={(e) => { void handleSubscribe(e); }} className="flex items-center gap-2">
              <input
                type="text"
                value={orgIdInput}
                onChange={(e) => setOrgIdInput(e.target.value)}
                placeholder="Org name or account (e.g. 0.0.8279014)…"
                disabled={isSubscribing}
                className="flex-1 h-[38px] rounded-full border border-border bg-white/[0.04] px-4 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-white/20 disabled:opacity-50 transition-colors"
              />
              <button
                type="submit"
                disabled={!orgIdInput.trim() || isSubscribing}
                className="h-[38px] px-[14px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isSubscribing ? '…' : 'Subscribe'}
              </button>
            </form>
            {subscribeError && (
              <p className="text-[12px] text-[#e0245e] mt-2">{subscribeError}</p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-2.5 rounded-full text-[13px]">
              Unable to load broadcasts. Please try again.
            </div>
          )}
        </div>

        {/* Message list */}
        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12">
            <RiLoader4Line size={18} className="animate-spin text-muted-foreground" />
            <span className="text-[14px] text-muted-foreground">Loading broadcasts…</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-12 px-4">
            <RiBroadcastLine size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-[14px] font-semibold text-foreground">No broadcasts yet</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              Subscribe to organizations to see their messages here.
            </p>
          </div>
        ) : (
          <div className="px-[18px] space-y-3 pb-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="border border-border rounded-[14px] p-4 hover:bg-white/[0.018] transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-[14px] font-semibold text-foreground">
                      {msg.orgName ?? msg.organizationId}
                    </p>
                    <span className="text-[11px] px-[8px] py-[2px] rounded-full bg-primary/12 text-primary/80 font-semibold">
                      BROADCAST
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground">
                    {new Date(msg.createdAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <p className="text-[14px] text-foreground whitespace-pre-wrap leading-[1.5]">{msg.content}</p>
                {msg.hcsTopicId && (
                  <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate">
                    Topic: {msg.hcsTopicId}
                    {msg.sequenceNumber != null && ` · Seq #${msg.sequenceNumber}`}
                  </p>
                )}
              </div>
            ))}

            {hasMore && (
              <button
                type="button"
                onClick={() => { void loadFeed(nextCursor); }}
                disabled={isLoading}
                className="w-full h-[38px] rounded-full border border-border text-[13px] font-semibold text-foreground hover:bg-white/[0.06] disabled:opacity-40 transition-colors"
              >
                {isLoading ? 'Loading…' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right panel */}
      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">
        <div className="border border-border rounded-[14px] p-4 space-y-2">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Broadcasts</p>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted-foreground">Loaded</span>
            <span className="text-[13px] font-semibold text-foreground">{messages.length}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
