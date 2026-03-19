import { create } from 'zustand';
import { api } from '@/lib/api';
import { subscribeToNotifications, onConnectionStateChange } from '@/lib/socket';

export type NotificationCategory = 'message' | 'payment' | 'social' | 'system';

export interface NotificationRecord {
  id: string;
  category: NotificationCategory;
  type: string;
  message: string;
  read: boolean;
  createdAt: string;
  topicId?: string | null;
  data?: Record<string, unknown>;
}

interface NotificationState {
  notifications: NotificationRecord[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  activeCategory: NotificationCategory | null;
  wsCleanup: (() => void) | null;
  wsReconnectCleanup: (() => void) | null;

  fetchNotifications: (category?: NotificationCategory | null) => Promise<void>;
  markAsRead: (notificationIds: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  addNotification: (notification: NotificationRecord) => void;
  setActiveCategory: (category: NotificationCategory | null) => void;
  clearError: () => void;
  subscribeRealtime: () => void;
  unsubscribeRealtime: () => void;
}

/**
 * Derive a notification category from the notification type string.
 * The backend may return arbitrary type strings; we bucket them into
 * four UI categories for consistent styling.
 */
function deriveCategory(type: string): NotificationCategory {
  const lower = type.toLowerCase();
  if (lower.includes('message') || lower.includes('chat')) return 'message';
  if (lower.includes('payment') || lower.includes('transaction')) return 'payment';
  if (lower.includes('follow') || lower.includes('like') || lower.includes('social')) return 'social';
  return 'system';
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  activeCategory: null,
  wsCleanup: null,
  wsReconnectCleanup: null,

  fetchNotifications: async (category?: NotificationCategory | null) => {
    set({ isLoading: true, error: null });
    try {
      // api.getNotifications already normalizes the response to { id, type, category, message, read, createdAt }
      const response = await api.getNotifications(50, undefined, category ?? undefined);
      const mapped: NotificationRecord[] = response.notifications.map((n: Record<string, unknown>) => {
        // Show only sender name — never expose message content (E2E encrypted)
        const fromDisplayName = n.fromDisplayName as string | null;
        const fromAccountId = n.fromAccountId as string | null;
        const rawPreview = (n.preview as string) ?? (n.message as string) ?? (n.event as string) ?? 'New message';
        let preview: string;
        if (fromDisplayName) {
          // Best case: display name returned from enriched API
          preview = fromDisplayName;
        } else if (fromAccountId) {
          // Fallback: strip any message content after ':' (old plaintext format)
          preview = fromAccountId;
        } else {
          // Generic: strip anything after ':' to avoid leaking old plaintext
          const colonIdx = rawPreview.indexOf(':');
          preview = colonIdx > 0 ? rawPreview.slice(0, colonIdx).trim() : rawPreview;
        }
        return {
          id: n.id as string,
          category: ((n.category as NotificationCategory) ?? deriveCategory(n.type as string)),
          type: (n.type as string) ?? 'unknown',
          message: preview,
          read: (n.isRead as boolean) ?? (n.read as boolean) ?? false,
          createdAt: (n.createdAt as string) ?? new Date().toISOString(),
          topicId: (n.topicId as string | null) ?? null,
        };
      });

      const unreadCount = mapped.filter((n) => !n.read).length;

      set({
        notifications: mapped,
        unreadCount,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch notifications';
      set({ error: message, isLoading: false });
    }
  },

  markAsRead: async (notificationIds: string[]) => {
    try {
      // Optimistic update
      set((state) => ({
        notifications: state.notifications.map((n) =>
          notificationIds.includes(n.id) ? { ...n, read: true } : n,
        ),
        unreadCount: Math.max(0, state.unreadCount - notificationIds.length),
      }));

      // Backend: POST /api/v1/notifications/read — bulk endpoint, sends all IDs at once
      await api.markNotificationsAsRead(notificationIds);
    } catch (err) {
      // Revert on failure by re-fetching
      const message = err instanceof Error ? err.message : 'Failed to mark as read';
      set({ error: message });
      await get().fetchNotifications(get().activeCategory);
    }
  },

  markAllAsRead: async () => {
    try {
      // Optimistic update
      set((state) => ({
        notifications: state.notifications.map((n) => ({ ...n, read: true })),
        unreadCount: 0,
      }));

      // Backend: PUT /api/v1/notifications/read-all
      await api.markAllNotificationsAsRead();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to mark all as read';
      set({ error: message });
      await get().fetchNotifications(get().activeCategory);
    }
  },

  addNotification: (notification: NotificationRecord) => {
    const { activeCategory } = get();

    // Only add to displayed list if it matches the active filter
    const matchesFilter =
      activeCategory === null || notification.category === activeCategory;

    set((state) => ({
      notifications: matchesFilter
        ? [notification, ...state.notifications]
        : state.notifications,
      unreadCount: state.unreadCount + 1,
    }));
  },

  setActiveCategory: (category: NotificationCategory | null) => {
    set({ activeCategory: category });
    get().fetchNotifications(category);
  },

  clearError: () => set({ error: null }),

  subscribeRealtime: () => {
    const existing = get().wsCleanup;
    if (existing) return; // Already subscribed

    const notificationHandler = (data: Record<string, unknown>) => {
      const record: NotificationRecord = {
        id: (data['id'] as string) || crypto.randomUUID(),
        category: deriveCategory((data['type'] as string) || 'system'),
        type: (data['type'] as string) || 'system',
        message: (data['message'] as string) || 'New notification',
        read: false,
        createdAt: (data['createdAt'] as string) || new Date().toISOString(),
        data: data as Record<string, unknown>,
      };
      get().addNotification(record);
    };

    const cleanup = subscribeToNotifications(notificationHandler);

    // Re-subscribe when the WebSocket reconnects.
    // The socket.ts reconnect handler already re-joins rooms; we just need to
    // ensure our event listener remains active (subscribeToNotifications adds
    // it on the socket instance, which is replaced on reconnect, so we
    // re-register by calling subscribeToNotifications again).
    const unsubscribeReconnect = onConnectionStateChange((state) => {
      if (state === 'connected') {
        // Remove old listener and re-add to the (possibly new) socket instance
        const currentCleanup = get().wsCleanup;
        if (currentCleanup) currentCleanup();
        const newCleanup = subscribeToNotifications(notificationHandler);
        set({ wsCleanup: newCleanup });
      }
    });

    set({ wsCleanup: cleanup, wsReconnectCleanup: unsubscribeReconnect });
  },

  unsubscribeRealtime: () => {
    const cleanup = get().wsCleanup;
    if (cleanup) {
      cleanup();
      set({ wsCleanup: null });
    }
    const reconnectCleanup = get().wsReconnectCleanup;
    if (reconnectCleanup) {
      reconnectCleanup();
      set({ wsReconnectCleanup: null });
    }
  },
}));
