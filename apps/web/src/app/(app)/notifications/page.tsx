'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { RiNotification3Line } from '@remixicon/react';
import { useNotificationStore, type NotificationCategory } from '@/stores/notification.store';
import { useAuth } from '@/lib/hooks';
import { NotificationItem } from '@/components/notifications/NotificationItem';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

const CATEGORIES: Array<{ label: string; value: NotificationCategory | null }> = [
  { label: 'All', value: null },
  { label: 'Messages', value: 'message' },
  { label: 'Payments', value: 'payment' },
  { label: 'Social', value: 'social' },
  { label: 'System', value: 'system' },
];

const PREF_CATEGORIES: Array<{ label: string; key: string; description: string }> = [
  { label: 'Messages', key: 'notif-pref-message', description: 'New messages and replies' },
  { label: 'Payments', key: 'notif-pref-payment', description: 'Payment requests and receipts' },
  { label: 'Social', key: 'notif-pref-social', description: 'Follows, likes and mentions' },
  { label: 'System', key: 'notif-pref-system', description: 'Security and account updates' },
];

export default function NotificationsPage() {
  const { isAuthenticated } = useAuth();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    activeCategory,
    setActiveCategory,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    clearError,
  } = useNotificationStore();

  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    'notif-pref-message': true,
    'notif-pref-payment': true,
    'notif-pref-social': true,
    'notif-pref-system': true,
  });

  useEffect(() => {
    if (isAuthenticated) {
      void fetchNotifications(activeCategory);
    }
  }, [isAuthenticated, fetchNotifications, activeCategory]);

  const handleMarkAllRead = useCallback(async () => {
    await markAllAsRead();
  }, [markAllAsRead]);

  const unreadByCategory = CATEGORIES.filter((c) => c.value !== null).reduce(
    (acc, cat) => {
      acc[cat.value!] = notifications.filter((n) => !n.read && n.category === cat.value).length;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <div className="flex min-h-full">
      <div className="flex-1 min-w-0 border-r border-border">
        <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border px-[18px] py-[14px] flex items-center justify-between">
          <h1 className="text-[17px] font-extrabold text-foreground">Notifications</h1>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="text-[13px] h-8 px-3 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        {error && (
          <div className="mx-[18px] mt-3 border border-[rgba(224,36,94,0.3)] bg-[rgba(224,36,94,0.08)] text-[#e0245e] px-4 py-3 rounded-full text-[13px] flex items-center justify-between">
            <span>{error}</span>
            <button type="button" onClick={clearError} className="ml-2 underline hover:no-underline">
              Dismiss
            </button>
          </div>
        )}

        <div className="flex gap-2 px-[18px] py-3 border-b border-border overflow-x-auto">
          {CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.value;
            const count = cat.value === null ? unreadCount : (unreadByCategory[cat.value] ?? 0);
            return (
              <button
                key={cat.label}
                type="button"
                onClick={() => setActiveCategory(cat.value)}
                className={cn(
                  'flex items-center gap-1.5 h-[34px] px-[14px] rounded-full text-[13px] font-semibold border whitespace-nowrap flex-shrink-0 transition-all',
                  isActive
                    ? 'bg-white/10 border-white/15 text-foreground'
                    : 'border-transparent text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                )}
              >
                {cat.label}
                {count > 0 && (
                  <span
                    className={cn(
                      'flex items-center justify-center w-[18px] h-[18px] rounded-full text-[11px] font-bold',
                      isActive ? 'bg-primary text-black' : 'bg-white/10 text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Select all */}
        <div className="px-[18px] py-3 border-b border-border flex items-center gap-3">
          <input type="checkbox" className="w-4 h-4 rounded accent-primary" />
          <span className="text-[13px] text-muted-foreground">Select all</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-[14px] text-muted-foreground">Loading…</div>
          </div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16 px-4">
            <RiNotification3Line size={32} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-[14px] font-semibold text-foreground">No notifications yet</p>
            <p className="text-[13px] text-muted-foreground mt-1">
              When you receive notifications, they&apos;ll appear here
            </p>
          </div>
        ) : (
          <div>
            {notifications.map((notif) => (
              <NotificationItem
                key={notif.id}
                notification={notif}
                onMarkAsRead={(id) => void markAsRead([id])}
              />
            ))}
          </div>
        )}
      </div>

      <aside className="hidden lg:flex flex-col w-[280px] flex-shrink-0 p-4 gap-4 sticky top-0 h-screen overflow-y-auto">
        <div className="border border-border rounded-[14px] p-4">
          <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Unread</p>
          {Object.entries(unreadByCategory).filter(([, count]) => count > 0).length === 0 ? (
            <p className="text-[13px] text-muted-foreground">All caught up!</p>
          ) : (
            Object.entries(unreadByCategory)
              .filter(([, count]) => count > 0)
              .map(([cat, count]) => (
                <div key={cat} className="flex items-center justify-between py-1">
                  <span className="text-[13px] text-muted-foreground capitalize">{cat}</span>
                  <span className="flex items-center justify-center w-[20px] h-[20px] rounded-full bg-primary text-black text-[11px] font-bold">
                    {count}
                  </span>
                </div>
              ))
          )}
        </div>

        <div className="border border-border rounded-[14px] p-4 space-y-4">
          <p className="text-[15px] font-bold text-foreground">Preferences</p>
          {PREF_CATEGORIES.map((pref) => (
            <div key={pref.key} className="flex items-center justify-between">
              <div>
                <p className="text-[14px] font-semibold text-foreground">{pref.label}</p>
                <p className="text-[12px] text-muted-foreground">{pref.description}</p>
              </div>
              <Switch
                checked={prefs[pref.key]}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, [pref.key]: v }))}
              />
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}
