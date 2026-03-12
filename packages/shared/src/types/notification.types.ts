// =============================================================================
// NOTIFICATION TYPES
// =============================================================================
// Each user has a private HCS topic for notifications.
// The platform submits notification payloads to these topics.
// Notifications are also pushed via WebSocket for real-time delivery.
// Reference: docs/SPECIFICATION.md Section 2.5, DM-NOTIF-001
// =============================================================================

export type NotificationCategory = 'message' | 'payment' | 'social' | 'system';

export type NotificationEvent =
  | 'new_message'
  | 'payment_received'
  | 'payment_request'
  | 'new_follower'
  | 'kyc_approved'
  | 'kyc_rejected'
  | 'group_invite'
  | 'split_payment_request'
  | 'split_payment_complete';

/**
 * DM-NOTIF-001: Notification Payload
 *
 * Submitted to the user's private notification HCS topic.
 */
export interface NotificationPayload {
  v: '1.0';
  type: 'notification';
  category: NotificationCategory;
  data: {
    event: NotificationEvent;
    from?: string;              // Sender Account ID
    topicId?: string;           // Relevant conversation topic
    preview?: string;           // Short preview text (max 100 chars)
    amount?: number;            // For payment notifications
    currency?: string;          // For payment notifications
    ts: number;                 // Unix timestamp in milliseconds
  };
}

export interface Notification {
  id: string;
  category: NotificationCategory;
  event: NotificationEvent;
  from?: {
    accountId: string;
    displayName: string | null;
    avatarUrl: string | null;
  };
  topicId?: string;
  preview?: string;
  amount?: number;
  currency?: string;
  timestamp: string;
  read: boolean;
}

export interface NotificationListResponse {
  notifications: Notification[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
}
