'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { useNotificationStore } from '@/stores/notification.store';
import { useAuth } from '@/lib/hooks';
import { NotificationItem } from './NotificationItem';

export function NotificationBell() {
  const {
    unreadCount,
    notifications,
    fetchNotifications,
    markAsRead,
    subscribeRealtime,
    unsubscribeRealtime,
  } = useNotificationStore();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch notifications and subscribe to real-time updates
  useEffect(() => {
    if (!user) return;

    fetchNotifications();
    subscribeRealtime();

    return () => {
      unsubscribeRealtime();
    };
  }, [user, fetchNotifications, subscribeRealtime, unsubscribeRealtime]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleMarkAsRead = useCallback(
    (id: string) => {
      markAsRead([id]);
    },
    [markAsRead],
  );

  const recentNotifications = notifications.slice(0, 5);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label={`Notifications: ${unreadCount} unread`}
      >
        <svg
          className="w-6 h-6 text-gray-700"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-red-600 text-white text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-[28rem] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="border-b px-4 py-3 flex justify-between items-center bg-gray-50 flex-shrink-0">
            <h3 className="font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                {unreadCount} new
              </span>
            )}
          </div>

          {/* Notification list */}
          {recentNotifications.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-12 text-gray-400">
              <div className="text-center">
                <svg
                  className="w-10 h-10 mx-auto mb-2 text-gray-300"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                  />
                </svg>
                <p className="text-sm">No notifications yet</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {recentNotifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkAsRead={handleMarkAsRead}
                  compact
                />
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="border-t bg-gray-50 px-4 py-2 flex-shrink-0">
            <Link
              href="/notifications"
              className={clsx(
                'block text-center text-sm font-medium py-2 rounded-lg transition-colors',
                'text-blue-600 hover:text-blue-700 hover:bg-blue-50',
              )}
              onClick={() => setIsOpen(false)}
            >
              View All Notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
