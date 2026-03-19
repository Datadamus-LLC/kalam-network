import type { BadgeTier } from './organization.types';
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
    sender: string;
    content: {
        text: string;
        media?: PostMedia[];
    };
}
export interface PostMedia {
    type: 'image' | 'video';
    ref: string;
    mimeType: string;
    size: number;
    dimensions?: string;
    alt?: string;
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
    actor: string;
    target: string;
}
export interface Post {
    id: string;
    author: {
        accountId: string;
        displayName: string | null;
        avatarUrl: string | null;
        kycVerified: boolean;
        /** Verified business badge tier — null for individual accounts */
        badgeTier: BadgeTier | null;
        accountType: 'individual' | 'business';
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
    accountType: 'individual' | 'business';
    kycVerified: boolean;
    /** Verified business badge tier — null for individual accounts */
    badgeTier: BadgeTier | null;
    isFollowing?: boolean;
}
export interface UserListResponse {
    users: UserListItem[];
    nextCursor: string | null;
    hasMore: boolean;
    total: number;
}
//# sourceMappingURL=social.types.d.ts.map