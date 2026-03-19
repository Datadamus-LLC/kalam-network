/**
 * Response DTOs for the social graph (followers/following).
 *
 * These are plain interfaces that describe the shape of API responses.
 */

export interface FollowerItemDto {
  followerAccountId: string;
  followingAccountId: string;
  hcsSequenceNumber: number;
  createdAt: string;
}

export interface FollowersListResponseDto {
  followers: FollowerItemDto[];
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FollowingListResponseDto {
  following: FollowerItemDto[];
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface FollowStatusResponseDto {
  accountId: string;
  targetAccountId: string;
  isFollowing: boolean;
}

export interface UserStatsResponseDto {
  accountId: string;
  followerCount: number;
  followingCount: number;
}
