'use client';

import { RiBuildingLine } from '@remixicon/react';
import { cn } from '@/lib/utils';

interface OrgBadgeProps {
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * OrgBadge — small building icon shown next to business account names.
 * Distinguishes organizations from individual users across the platform.
 */
export function OrgBadge({ size = 'sm', className }: OrgBadgeProps) {
  const iconSize = size === 'sm' ? 11 : 14;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full font-semibold leading-none select-none',
        size === 'sm'
          ? 'px-[5px] py-[2px] text-[9px]'
          : 'px-[7px] py-[3px] text-[10px]',
        'bg-primary/15 text-primary border border-primary/25',
        className,
      )}
      title="Organization account"
      aria-label="Organization"
    >
      <RiBuildingLine size={iconSize} />
      <span>ORG</span>
    </span>
  );
}
