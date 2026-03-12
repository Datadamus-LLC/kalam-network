// =============================================================================
// SOCIAL FEED TYPES
// =============================================================================
// Types for public posts, social graph events (follow/unfollow), and feeds.
// Posts are plaintext HCS messages on a user's public feed topic.
// Social graph events are recorded on a platform-wide HCS topic.
// Reference: docs/SPECIFICATION.md Section 2.3, DM-SOCIAL-001, DM-SOCIAL-002
// =============================================================================

export type SocialAction = 'follow' | 'unfollow' | 'block';

/**
 * DM-SOCIAL-001: Public Post
 *
 * Submitted to the user's public feed HCS topic.
 * These are NOT encrypted — they are public and visible to anyone.
 */
export interface PublicPostPayload {
  v: '1.0';
  type: 'post';
  sender: string;               // Author's Account ID
  content: {
    text: string;               // Post text (max 800 chars)
    media?: PostMedia[];        // Up to 4 media items
  };
}

export interface PostMedia {
  type: 'image' | 'video';
  ref: string;                  // "ipfs://CID"
  mimeType: string;             // "image/jpeg", "video/mp4", etc.
  size: number;                 // File size in bytes
  dimensions?: string;          // "1920x1080"
  alt?: string;                 // Accessibility alt text
}

/**
 * DM-SOCIAL-002: Social Graph Event
 *
 * Submitted to the platform-wide social graph HCS topic.
 * These are plaintext — the social graph is public.
 * The platform indexes these in PostgreSQL for fast queries.
 */
export interface SocialGraphEvent {
  v: '1.0';
  type: SocialAction;
  actor: string;                // Who performed the action
  target: string;               // Who it was performed on
}

// --- API Response Types ---

export interface Post {
  id: string;
  author: {
    accountId: string;
    displayName: string | null;
    avatarUrl: string | null;
    kycVerified: boolean;
  };
  text: string;
  media: PostMedia[];
  hcsTopicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  transactionId: string;
}

export interface FeedResponse {
  posts: Post[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FollowResponse {
  following: boolean;
  hcsSequenceNumber: number;
  transactionId: string;
}

export interface UserListItem {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  kycVerified: boolean;
  isFollowing?: boolean;        // Relative to the requesting user
}

export interface UserListResponse {
  users: UserListItem[];
  nextCursor: string | null;
  hasMore: boolean;
  total: number;
}
