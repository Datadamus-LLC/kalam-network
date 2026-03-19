'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { RiVerifiedBadgeFill } from '@remixicon/react';
import clsx from 'clsx';
import type { BadgeTier } from '@hedera-social/shared';
import { env } from '@/lib/env';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Badge tier display configuration.
 * Colors chosen to meet WCAG AA contrast requirements against white backgrounds.
 */
const BADGE_CONFIG = {
  basic: {
    color: 'text-gray-400',
    label: 'Pending KYB Verification',
    description: 'Business identity submitted',
  },
  verified: {
    color: 'text-blue-500',
    label: 'Verified Business',
    description: 'KYB verified by Mirsad AI',
  },
  certified: {
    color: 'text-amber-500',
    label: 'Certified Business',
    description: 'Fully certified business',
  },
} as const;

const SIZE_CONFIG = {
  sm: { className: 'w-4 h-4', pixels: 16 },
  md: { className: 'w-5 h-5', pixels: 20 },
  lg: { className: 'w-6 h-6', pixels: 24 },
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerifiedBadgeProps {
  /** Badge tier — determines color and label */
  tier: BadgeTier;
  /** Icon size */
  size?: 'sm' | 'md' | 'lg';
  /** ISO8601 date when KYB verification was approved */
  verifiedAt?: string | null;
  /** Full URL to the HCS attestation on HashScan */
  hcsProofUrl?: string | null;
  /** Additional CSS class names */
  className?: string;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

/**
 * Build a HashScan URL for an HCS topic message.
 *
 * HashScan is the public Hedera block explorer.
 * URL format: https://hashscan.io/{network}/topic/{topicId}?p=1&k={sequenceNumber}
 */
export function buildHashScanProofUrl(
  topicId: string,
  sequenceNumber: number | null,
  network: 'testnet' | 'mainnet' = 'testnet',
): string {
  const hashScanBase = env.NEXT_PUBLIC_HASHSCAN_URL;
  const base = `${hashScanBase}/${network}/topic/${topicId}`;
  if (sequenceNumber !== null) {
    return `${base}?p=1&k=${sequenceNumber}`;
  }
  return base;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * VerifiedBadge displays a checkmark icon indicating a business has been
 * KYB-verified. The badge tier (basic/verified/certified) determines the
 * icon color. A tooltip with verification details appears on hover.
 *
 * Badge tier is always server-derived — it is NEVER set from client input.
 *
 * Accessibility:
 * - `aria-label` describes the verification status
 * - Tooltip is accessible via keyboard focus
 * - Colors meet WCAG AA contrast on white backgrounds
 */
export function VerifiedBadge({
  tier,
  size = 'md',
  verifiedAt,
  hcsProofUrl,
  className,
}: VerifiedBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  const config = BADGE_CONFIG[tier];
  const sizeConfig = SIZE_CONFIG[size];

  // Format the verification date for display
  const formattedDate = verifiedAt
    ? formatVerificationDate(verifiedAt)
    : null;

  const ariaLabel = formattedDate
    ? `${config.label} — verified on ${formattedDate}`
    : config.label;

  // Close tooltip when clicking outside
  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (
      tooltipRef.current &&
      !tooltipRef.current.contains(event.target as Node) &&
      triggerRef.current &&
      !triggerRef.current.contains(event.target as Node)
    ) {
      setShowTooltip(false);
    }
  }, []);

  useEffect(() => {
    if (showTooltip) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showTooltip, handleClickOutside]);

  // Close on Escape
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      setShowTooltip(false);
    }
  }, []);

  return (
    <span
      ref={triggerRef}
      className={clsx('relative inline-flex items-center', className)}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onFocus={() => setShowTooltip(true)}
      onBlur={() => setShowTooltip(false)}
      onKeyDown={handleKeyDown}
      role="img"
      aria-label={ariaLabel}
      tabIndex={0}
    >
      <RiVerifiedBadgeFill
        className={clsx(sizeConfig.className, config.color)}
        aria-hidden="true"
      />

      {/* Tooltip */}
      {showTooltip && (
        <div
          ref={tooltipRef}
          role="tooltip"
          className={clsx(
            'absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2',
            'bg-gray-900 text-white text-xs rounded-lg px-3 py-2',
            'whitespace-nowrap shadow-lg',
            'pointer-events-auto',
          )}
        >
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-gray-900 rotate-45 transform" />
          </div>

          <p className="font-semibold">{config.label}</p>

          {formattedDate && (
            <p className="text-gray-300 mt-0.5">
              Verified on {formattedDate}
            </p>
          )}

          {hcsProofUrl && (
            <a
              href={hcsProofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-300 hover:text-blue-200 mt-1 block underline"
              onClick={(e) => e.stopPropagation()}
            >
              View on-chain proof
            </a>
          )}
        </div>
      )}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Format an ISO8601 date string for display in the badge tooltip.
 * Returns a human-readable date like "Jan 15, 2026".
 */
function formatVerificationDate(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) {
    return isoDate;
  }

  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
