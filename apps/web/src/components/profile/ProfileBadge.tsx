'use client';

import React from 'react';
import { VerifiedBadge, buildHashScanProofUrl } from '@/components/ui/VerifiedBadge';
import type { BadgeTier, VerifiedBadgeInfo } from '@hedera-social/shared';

// ---------------------------------------------------------------------------
// ProfileBadge
// ---------------------------------------------------------------------------

interface ProfileBadgeProps {
  badgeInfo: VerifiedBadgeInfo;
}

/**
 * Renders the verified badge and tier description for a business profile.
 *
 * This component is used when profile data is loaded from the API
 * and the `badgeInfo` field is non-null.
 */
export function ProfileBadge({ badgeInfo }: ProfileBadgeProps) {
  const hcsProofUrl = badgeInfo.hcsAttestationTopic
    ? buildHashScanProofUrl(
        badgeInfo.hcsAttestationTopic,
        badgeInfo.hcsAttestationSeq,
      )
    : null;

  return (
    <span className="inline-flex flex-col">
      <span className="inline-flex items-center space-x-1">
        <VerifiedBadge
          tier={badgeInfo.tier}
          size="md"
          verifiedAt={badgeInfo.kybVerifiedAt}
          hcsProofUrl={hcsProofUrl}
        />
      </span>
      <BadgeTierDescription tier={badgeInfo.tier} />
    </span>
  );
}

// ---------------------------------------------------------------------------
// BadgeTierDescription
// ---------------------------------------------------------------------------

function BadgeTierDescription({ tier }: { tier: BadgeTier }) {
  const descriptions: Record<BadgeTier, string> = {
    basic: 'Pending KYB Verification',
    verified: 'KYB Verified Business',
    certified: 'Certified Business',
  };

  const colors: Record<BadgeTier, string> = {
    basic: 'text-muted-foreground',
    verified: 'text-[#00ba7c]',
    certified: 'text-primary',
  };

  return (
    <p className={`text-[11px] font-medium mt-0.5 ${colors[tier]}`}>
      {descriptions[tier]}
    </p>
  );
}
