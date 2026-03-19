'use client';

import React from 'react';
import Link from 'next/link';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/Avatar';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';
import type { BadgeTier } from '@hedera-social/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResultItemProps {
  /** Hedera account ID */
  accountId: string;
  /** Display name */
  displayName: string | null;
  /** IPFS avatar URL */
  avatarUrl: string | null;
  /** Account type */
  accountType: 'individual' | 'business';
  /** Whether KYC/KYB verified */
  kycVerified: boolean;
  /** Badge tier for business accounts — null for individuals */
  badgeTier: BadgeTier | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * A single search result row.
 *
 * For business accounts with a badge tier, a small VerifiedBadge
 * is displayed inline next to the name.
 * Badge tier comes from the server-side search response.
 */
export function SearchResultItem({
  accountId,
  displayName,
  avatarUrl,
  accountType,
  kycVerified,
  badgeTier,
}: SearchResultItemProps) {
  const name = displayName ?? accountId;

  return (
    <Link
      href={`/profile/${accountId}`}
      className="flex items-center gap-4 px-[18px] py-[14px] border-b border-border hover:bg-white/[0.018] transition-colors"
    >
      {/* Avatar 44×44 per spec */}
      <Avatar className="w-[44px] h-[44px] flex-shrink-0">
        <AvatarImage src={avatarUrl ?? undefined} />
        <AvatarFallback>{name[0]?.toUpperCase() ?? '?'}</AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[14px] font-semibold text-foreground truncate">{name}</span>
          {badgeTier && <VerifiedBadge tier={badgeTier} size="sm" />}
        </div>

        <p className="text-[12px] text-muted-foreground font-mono truncate mt-0.5">
          {accountId}
        </p>

        <div className="flex items-center gap-2 mt-1">
          {accountType === 'business' && (
            <span className="text-[11px] px-[8px] py-[2px] rounded-full bg-primary/12 text-primary/80 font-semibold">
              Organization
            </span>
          )}
          {kycVerified && accountType === 'individual' && (
            <span className="text-[11px] px-[8px] py-[2px] rounded-full bg-[rgba(0,186,124,0.1)] text-[#00ba7c] font-semibold">
              KYC Verified
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
