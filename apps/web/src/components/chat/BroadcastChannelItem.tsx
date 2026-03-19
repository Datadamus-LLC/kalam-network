'use client';

import React from 'react';
import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar';
import { VerifiedBadge, buildHashScanProofUrl } from '@/components/ui/VerifiedBadge';
import type { BadgeTier } from '@hedera-social/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BroadcastChannelItemProps {
  /** HCS topic ID of the broadcast channel */
  topicId: string;
  /** Channel/business name */
  name: string;
  /** Channel avatar URL */
  avatarUrl: string | null;
  /** Business badge tier — null if not a verified business */
  badgeTier: BadgeTier | null;
  /** Number of subscribers */
  subscriberCount: number;
  /** Preview of the last broadcast message */
  lastMessage: string | null;
  /** ISO8601 timestamp of last broadcast */
  lastMessageAt: string | null;
  /** HCS attestation topic for proof link */
  hcsAttestationTopic?: string | null;
  /** HCS attestation sequence number */
  hcsAttestationSeq?: number | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BroadcastChannelItem({
  topicId,
  name,
  avatarUrl,
  badgeTier,
  subscriberCount,
  lastMessage,
  lastMessageAt,
  hcsAttestationTopic,
  hcsAttestationSeq,
}: BroadcastChannelItemProps) {
  const hcsProofUrl = hcsAttestationTopic
    ? buildHashScanProofUrl(
        hcsAttestationTopic,
        hcsAttestationSeq ?? null,
      )
    : null;

  return (
    <Link
      href={`/messages/${topicId}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.025] border-b border-border transition-colors"
    >
      <Avatar className="flex-shrink-0">
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback>{name[0]?.toUpperCase() ?? '?'}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-foreground truncate">{name}</span>

          {badgeTier && (
            <VerifiedBadge
              tier={badgeTier}
              size="sm"
              hcsProofUrl={hcsProofUrl}
            />
          )}
        </div>

        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span>{subscriberCount} subscribers</span>
          {lastMessageAt && (
            <span>{formatRelativeTime(lastMessageAt)}</span>
          )}
        </div>

        {lastMessage && (
          <p className="text-[12px] text-muted-foreground truncate mt-0.5">
            {lastMessage}
          </p>
        )}
      </div>
    </Link>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatRelativeTime(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) {
    return '';
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}
