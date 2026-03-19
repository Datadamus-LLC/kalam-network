'use client';

import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar';
import { VerifiedBadge, buildHashScanProofUrl } from '@/components/ui/VerifiedBadge';
import type { BadgeTier } from '@hedera-social/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatParticipant {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  isOnline: boolean;
  /** Badge tier from server — null for individual accounts */
  badgeTier: BadgeTier | null;
  /** ISO8601 date of KYB verification */
  kybVerifiedAt?: string | null;
  /** HCS attestation topic ID for proof link */
  hcsAttestationTopic?: string | null;
  /** HCS attestation sequence number */
  hcsAttestationSeq?: number | null;
}

interface ChatHeaderProps {
  /** Conversation display name (other participant's name or group name) */
  name: string;
  /** The other participant in a direct conversation, or null for groups */
  participant: ChatParticipant | null;
  /** Whether this is a group conversation */
  isGroup: boolean;
  /** Number of participants in a group */
  participantCount?: number;
  /** Callback when back button is clicked */
  onBack?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Chat conversation header.
 *
 * Displays the conversation name, avatar, and online status.
 * For business participants with KYB verification, a small
 * VerifiedBadge is shown next to the name.
 *
 * Badge information comes from the server-side conversation
 * participant data — never from client state.
 */
export function ChatHeader({
  name,
  participant,
  isGroup,
  participantCount,
  onBack,
}: ChatHeaderProps) {
  const avatarUrl = participant?.avatarUrl ?? undefined;
  const isOnline = participant?.isOnline ?? false;

  // Build proof URL if attestation data is available
  const hcsProofUrl =
    participant?.hcsAttestationTopic
      ? buildHashScanProofUrl(
          participant.hcsAttestationTopic,
          participant.hcsAttestationSeq ?? null,
        )
      : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
      {/* Back button (mobile) */}
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-white/[0.06] text-muted-foreground hover:text-foreground transition-colors lg:hidden"
          aria-label="Back to conversations"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
        </button>
      )}

      {/* Avatar with online indicator */}
      <div className="relative">
        <Avatar size="sm">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback>{name[0]?.toUpperCase() ?? '?'}</AvatarFallback>
        </Avatar>
        {!isGroup && isOnline && (
          <span
            className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#00ba7c] border-2 border-background rounded-full"
            aria-label="Online"
          />
        )}
      </div>

      {/* Name + Badge + Status */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center space-x-1">
          <h2 className="text-[15px] font-semibold text-foreground truncate">{name}</h2>

          {/* Show badge only for business participants with a badge tier */}
          {participant?.badgeTier && (
            <VerifiedBadge
              tier={participant.badgeTier}
              size="sm"
              verifiedAt={participant.kybVerifiedAt}
              hcsProofUrl={hcsProofUrl}
            />
          )}
        </div>

        <p className="text-[12px] text-muted-foreground">
          {isGroup
            ? `${participantCount ?? 0} members`
            : isOnline
              ? 'Online'
              : 'Offline'}
        </p>
      </div>
    </div>
  );
}
