/**
 * Response DTOs for posts and feeds.
 *
 * These are plain interfaces that describe the shape of API responses.
 * They align with the shared PostMedia and Post types from packages/shared.
 */

export interface PostMediaResponse {
  type: "image" | "video";
  ref: string;
  mimeType: string;
  size: number;
  dimensions?: string;
  alt?: string;
}

export interface PostAuthorResponse {
  accountId: string;
  displayName: string | null;
  avatarUrl: string | null;
  accountType: 'individual' | 'business';
}

export interface PostResponseDto {
  id: string;
  author: PostAuthorResponse;
  text: string;
  media: PostMediaResponse[];
  hcsTopicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  createdAt: string;
  likeCount: number;
  commentCount: number;
  isLiked: boolean;
}

export interface FeedResponseDto {
  posts: PostResponseDto[];
  nextCursor: string | null;
  hasMore: boolean;
}
