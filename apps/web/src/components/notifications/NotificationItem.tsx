'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  RiMessage3Line,
  RiBankCardLine,
  RiUserLine,
  RiSettings4Line,
} from '@remixicon/react';
import type { NotificationRecord, NotificationCategory } from '@/stores/notification.store';

interface NotificationItemProps {
  notification: NotificationRecord;
  onMarkAsRead?: (id: string) => void;
  compact?: boolean;
}

function CategoryIcon({ category }: { category: NotificationCategory }) {
  const size = 18;
  switch (category) {
    case 'message':
      return <RiMessage3Line size={size} aria-hidden />;
    case 'payment':
      return <RiBankCardLine size={size} aria-hidden />;
    case 'social':
      return <RiUserLine size={size} aria-hidden />;
    case 'system':
      return <RiSettings4Line size={size} aria-hidden />;
  }
}

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  compact = false,
}: NotificationItemProps) {
  const router = useRouter();

  const handleClick = () => {
    if (!notification.read && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }
    // Navigate to the relevant screen based on category
    if (notification.category === 'message' && notification.topicId) {
      router.push(`/messages/${notification.topicId}`);
    } else if (notification.category === 'payment') {
      router.push('/payments');
    } else if (notification.category === 'social') {
      router.push('/profile/me');
    }
  };

  const isUnread = !notification.read;

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'relative w-full text-left flex items-start gap-3 transition-colors',
        compact ? 'px-3 py-2.5' : 'px-[18px] py-[14px] border-b border-border',
        isUnread
          ? 'bg-white/[0.018] hover:bg-white/[0.032]'
          : 'hover:bg-white/[0.018]',
      )}
    >
      {/* Lemon dot on left edge for unread */}
      {isUnread && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[4px] h-[32px] rounded-r-full bg-primary" />
      )}

      {/* Category icon — neutral circle */}
      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/[0.07] flex items-center justify-center text-muted-foreground mt-0.5">
        <CategoryIcon category={notification.category} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={cn(
          'text-foreground leading-[1.4]',
          compact ? 'text-[13px]' : 'text-[14px]',
          isUnread && 'font-[500]',
        )}>
          {notification.message}
        </p>
        <p className="text-[12px] text-muted-foreground mt-0.5">
          {formatTimestamp(notification.createdAt)}
        </p>
      </div>
    </button>
  );
}
