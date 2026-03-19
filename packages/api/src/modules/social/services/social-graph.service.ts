import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { RedisService } from "../../redis/redis.service";
import { NotificationsService } from "../../notifications/notifications.service";
import {
  NotificationCategory,
  NotificationEvent,
} from "../../notifications/dto/notification.dto";
import {
  SelfFollowException,
  SelfUnfollowException,
  AlreadyFollowingException,
  NotFollowingException,
  FollowTargetNotFoundException,
  FollowActorNotFoundException,
  FollowIndexingException,
  SocialGraphTopicNotConfiguredException,
  SocialGraphSyncException,
} from "../exceptions/social-graph.exceptions";
import { SocialGraphQueryException } from "../exceptions/social.exceptions";
import type {
  FollowerItemDto,
  FollowersListResponseDto,
  FollowingListResponseDto,
  UserStatsResponseDto,
} from "../dto/follow-response.dto";

/**
 * HCS event payload for social graph actions (follow/unfollow).
 * Submitted as JSON to the platform-wide social graph HCS topic.
 */
interface HcsSocialGraphEvent {
  version: 1;
  type: "follow" | "unfollow";
  timestamp: string;
  actor: string;
  target: string;
}

/** Cache TTL constants in seconds */
const CACHE_TTL_FOLLOWERS_LIST = 300;
const CACHE_TTL_IS_FOLLOWING = 3600;
const CACHE_TTL_USER_STATS = 600;

/**
 * SocialGraphService manages the social graph (follow/unfollow relationships)
 * using a decentralized, event-sourced approach:
 *
 * 1. HCS as Source of Truth: All follow/unfollow events are submitted to a
 *    platform-wide HCS topic (HEDERA_SOCIAL_GRAPH_TOPIC).
 * 2. PostgreSQL Index: Events are indexed in the social_follows table for fast queries.
 * 3. Denormalized Counts: follower_counts table stores pre-computed counts.
 * 4. Redis Cache: Follower lists, follow status, and stats are cached.
 */
@Injectable()
export class SocialGraphService {
  private readonly logger = new Logger(SocialGraphService.name);
  private readonly socialGraphTopicId: string | undefined;

  constructor(
    @InjectRepository(SocialFollowEntity)
    private readonly followRepository: Repository<SocialFollowEntity>,
    @InjectRepository(FollowerCountEntity)
    private readonly followerCountRepository: Repository<FollowerCountEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly mirrorNodeService: MirrorNodeService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
  ) {
    this.socialGraphTopicId = this.configService.get<string>(
      "hedera.socialGraphTopic",
    );
    if (!this.socialGraphTopicId) {
      this.logger.warn(
        "HEDERA_SOCIAL_GRAPH_TOPIC not configured — follow/unfollow will be unavailable",
      );
    }
  }

  /**
   * Ensure the social graph topic is configured before write operations.
   */
  private ensureTopicConfigured(): string {
    if (!this.socialGraphTopicId) {
      throw new SocialGraphTopicNotConfiguredException();
    }
    return this.socialGraphTopicId;
  }

  // ---------------------------------------------------------------------------
  // Follow
  // ---------------------------------------------------------------------------

  /**
   * Follow a user.
   *
   * Steps:
   * 1. Resolve follower by UUID, with fallback to hederaAccountId from JWT
   * 2. Validate no self-follow
   * 3. Validate target user exists
   * 4. Check if already following
   * 5. Submit follow event to HCS topic
   * 6. Index in PostgreSQL
   * 7. Update denormalized counts
   * 8. Clear Redis cache
   *
   * @param followerUserId UUID of the authenticated user (from JWT sub)
   * @param targetAccountId Hedera account ID of the user to follow
   * @param jwtHederaAccountId Optional Hedera account ID from JWT (fallback for user lookup)
   */
  async follow(
    followerUserId: string,
    targetAccountId: string,
    jwtHederaAccountId?: string,
  ): Promise<void> {
    const topicId = this.ensureTopicConfigured();

    // 1. Resolve follower from DB by UUID (primary lookup)
    let follower = await this.userRepository.findOne({
      where: { id: followerUserId },
    });

    // Fallback: if UUID lookup fails or user lacks hederaAccountId,
    // try resolving by the hederaAccountId from the JWT claim.
    // This handles cases where test/QA users have mismatched UUIDs
    // or where hederaAccountId was set after the JWT was issued.
    if (
      (!follower || !follower.hederaAccountId) &&
      jwtHederaAccountId &&
      jwtHederaAccountId.length > 0
    ) {
      const fallback = await this.userRepository.findOne({
        where: { hederaAccountId: jwtHederaAccountId },
      });
      if (fallback && fallback.hederaAccountId) {
        this.logger.warn(
          `Follower UUID ${followerUserId} lookup failed or lacked hederaAccountId; ` +
            `resolved via JWT claim to ${fallback.hederaAccountId} (user ${fallback.id})`,
        );
        follower = fallback;
      }
    }

    if (!follower || !follower.hederaAccountId) {
      throw new FollowActorNotFoundException(followerUserId);
    }

    const followerAccountId = follower.hederaAccountId;

    // 2. Prevent self-follow
    if (followerAccountId === targetAccountId) {
      throw new SelfFollowException();
    }

    // 3. Validate target user exists
    const target = await this.userRepository.findOne({
      where: { hederaAccountId: targetAccountId },
    });

    if (!target) {
      throw new FollowTargetNotFoundException(targetAccountId);
    }

    // 4. Check if already following
    const existing = await this.followRepository.findOne({
      where: {
        followerAccountId,
        followingAccountId: targetAccountId,
      },
    });

    if (existing) {
      throw new AlreadyFollowingException(followerAccountId, targetAccountId);
    }

    // 5. Index in PostgreSQL immediately (non-blocking follow)
    // HCS submission for audit trail happens asynchronously in background
    try {
      const followEntity = this.followRepository.create({
        followerAccountId,
        followingAccountId: targetAccountId,
        hcsSequenceNumber: 0, // Placeholder; updated after async HCS submission
      });
      await this.followRepository.save(followEntity);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to index follow ${followerAccountId} -> ${targetAccountId}: ${reason}`,
      );
      throw new FollowIndexingException(reason);
    }

    // 6. Submit follow event to HCS in background (fire-and-forget)
    const hcsEvent: HcsSocialGraphEvent = {
      version: 1,
      type: "follow",
      timestamp: new Date().toISOString(),
      actor: followerAccountId,
      target: targetAccountId,
    };
    const messageBuffer = Buffer.from(JSON.stringify(hcsEvent));
    this.hederaService
      .submitMessage(topicId, messageBuffer)
      .then((seqNum) => {
        void this.followRepository.update(
          { followerAccountId, followingAccountId: targetAccountId },
          { hcsSequenceNumber: parseInt(seqNum, 10) },
        );
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Background HCS follow submission failed (${followerAccountId} -> ${targetAccountId}): ${reason}`,
        );
      });

    // 7. Update denormalized counts
    await this.updateFollowerCounts(followerAccountId, targetAccountId);

    // 8. Clear cache
    await this.clearFollowCache(followerAccountId, targetAccountId);

    this.logger.log(
      `${followerAccountId} followed ${targetAccountId} (HCS submission async)`,
    );

    // 9. Send follow notification (non-blocking)
    this.notificationsService
      .sendNotification({
        recipientAccountId: targetAccountId,
        category: NotificationCategory.SOCIAL,
        event: NotificationEvent.NEW_FOLLOWER,
        fromAccountId: followerAccountId,
        preview: `${follower.displayName ?? followerAccountId} started following you`,
      })
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Failed to send follow notification to ${targetAccountId}: ${reason}`,
        );
      });
  }

  // ---------------------------------------------------------------------------
  // Unfollow
  // ---------------------------------------------------------------------------

  /**
   * Unfollow a user.
   *
   * Steps:
   * 1. Resolve follower by UUID, with fallback to hederaAccountId from JWT
   * 2. Validate no self-unfollow
   * 3. Check if currently following
   * 4. Submit unfollow event to HCS topic
   * 5. Remove from PostgreSQL index
   * 6. Update denormalized counts
   * 7. Clear Redis cache
   *
   * @param followerUserId UUID of the authenticated user (from JWT sub)
   * @param targetAccountId Hedera account ID of the user to unfollow
   * @param jwtHederaAccountId Optional Hedera account ID from JWT (fallback for user lookup)
   */
  async unfollow(
    followerUserId: string,
    targetAccountId: string,
    jwtHederaAccountId?: string,
  ): Promise<void> {
    const topicId = this.ensureTopicConfigured();

    // 1. Resolve follower from DB by UUID (primary lookup)
    let follower = await this.userRepository.findOne({
      where: { id: followerUserId },
    });

    // Fallback: resolve by hederaAccountId from JWT claim
    if (
      (!follower || !follower.hederaAccountId) &&
      jwtHederaAccountId &&
      jwtHederaAccountId.length > 0
    ) {
      const fallback = await this.userRepository.findOne({
        where: { hederaAccountId: jwtHederaAccountId },
      });
      if (fallback && fallback.hederaAccountId) {
        this.logger.warn(
          `Unfollower UUID ${followerUserId} lookup failed or lacked hederaAccountId; ` +
            `resolved via JWT claim to ${fallback.hederaAccountId} (user ${fallback.id})`,
        );
        follower = fallback;
      }
    }

    if (!follower || !follower.hederaAccountId) {
      throw new FollowActorNotFoundException(followerUserId);
    }

    const followerAccountId = follower.hederaAccountId;

    // 2. Prevent self-unfollow
    if (followerAccountId === targetAccountId) {
      throw new SelfUnfollowException();
    }

    // 3. Check if currently following
    const existing = await this.followRepository.findOne({
      where: {
        followerAccountId,
        followingAccountId: targetAccountId,
      },
    });

    if (!existing) {
      throw new NotFollowingException(followerAccountId, targetAccountId);
    }

    // 4. Remove from PostgreSQL immediately (non-blocking unfollow)
    try {
      await this.followRepository.remove(existing);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to remove follow index ${followerAccountId} -> ${targetAccountId}: ${reason}`,
      );
      throw new FollowIndexingException(reason);
    }

    // 5. Submit unfollow event to HCS in background (fire-and-forget)
    const hcsEvent: HcsSocialGraphEvent = {
      version: 1,
      type: "unfollow",
      timestamp: new Date().toISOString(),
      actor: followerAccountId,
      target: targetAccountId,
    };
    const messageBuffer = Buffer.from(JSON.stringify(hcsEvent));
    this.hederaService
      .submitMessage(topicId, messageBuffer)
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `Background HCS unfollow submission failed (${followerAccountId} -> ${targetAccountId}): ${reason}`,
        );
      });

    // 6. Update denormalized counts
    await this.updateFollowerCounts(followerAccountId, targetAccountId);

    // 7. Clear cache
    await this.clearFollowCache(followerAccountId, targetAccountId);

    this.logger.log(
      `${followerAccountId} unfollowed ${targetAccountId} (HCS submission async)`,
    );
  }

  // ---------------------------------------------------------------------------
  // Get Followers (paginated)
  // ---------------------------------------------------------------------------

  /**
   * Get followers of a user with cursor-based pagination.
   *
   * Cursor format: ISO timestamp of the createdAt field.
   * Results are cached in Redis with a 5-minute TTL.
   */
  async getFollowers(
    accountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<FollowersListResponseDto> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = `social:followers:${accountId}:${cursor ?? "start"}:${effectiveLimit}`;

    // Try cache
    const cached = await this.safeRedisGet(cacheKey);
    if (cached) {
      return JSON.parse(cached) as FollowersListResponseDto;
    }

    try {
      const queryBuilder = this.followRepository
        .createQueryBuilder("follow")
        .where("follow.followingAccountId = :accountId", { accountId })
        .orderBy("follow.createdAt", "DESC")
        .take(effectiveLimit + 1);

      if (cursor) {
        queryBuilder.andWhere("follow.createdAt < :cursor", {
          cursor: new Date(cursor),
        });
      }

      const follows = await queryBuilder.getMany();
      const hasMore = follows.length > effectiveLimit;
      const items = hasMore ? follows.slice(0, effectiveLimit) : follows;

      // Get total count
      const totalCount = await this.followRepository.count({
        where: { followingAccountId: accountId },
      });

      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      const response: FollowersListResponseDto = {
        followers: items.map((f) => this.toFollowerItemDto(f)),
        totalCount,
        nextCursor,
        hasMore,
      };

      await this.safeRedisSetex(
        cacheKey,
        CACHE_TTL_FOLLOWERS_LIST,
        JSON.stringify(response),
      );

      return response;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get followers for ${accountId}: ${reason}`);
      throw new SocialGraphQueryException("getFollowers", reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Get Following (paginated)
  // ---------------------------------------------------------------------------

  /**
   * Get accounts that a user is following, with cursor-based pagination.
   */
  async getFollowing(
    accountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<FollowingListResponseDto> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = `social:following:${accountId}:${cursor ?? "start"}:${effectiveLimit}`;

    // Try cache
    const cached = await this.safeRedisGet(cacheKey);
    if (cached) {
      return JSON.parse(cached) as FollowingListResponseDto;
    }

    try {
      const queryBuilder = this.followRepository
        .createQueryBuilder("follow")
        .where("follow.followerAccountId = :accountId", { accountId })
        .orderBy("follow.createdAt", "DESC")
        .take(effectiveLimit + 1);

      if (cursor) {
        queryBuilder.andWhere("follow.createdAt < :cursor", {
          cursor: new Date(cursor),
        });
      }

      const follows = await queryBuilder.getMany();
      const hasMore = follows.length > effectiveLimit;
      const items = hasMore ? follows.slice(0, effectiveLimit) : follows;

      // Get total count
      const totalCount = await this.followRepository.count({
        where: { followerAccountId: accountId },
      });

      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].createdAt.toISOString()
          : null;

      const response: FollowingListResponseDto = {
        following: items.map((f) => this.toFollowerItemDto(f)),
        totalCount,
        nextCursor,
        hasMore,
      };

      await this.safeRedisSetex(
        cacheKey,
        CACHE_TTL_FOLLOWERS_LIST,
        JSON.stringify(response),
      );

      return response;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get following for ${accountId}: ${reason}`);
      throw new SocialGraphQueryException("getFollowing", reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Is Following
  // ---------------------------------------------------------------------------

  /**
   * Check if user A is following user B.
   * Cached in Redis for 1 hour.
   */
  async isFollowing(
    followerAccountId: string,
    targetAccountId: string,
  ): Promise<boolean> {
    const cacheKey = `social:is_following:${followerAccountId}:${targetAccountId}`;
    const cached = await this.safeRedisGet(cacheKey);
    if (cached !== null) {
      return cached === "1";
    }

    const follow = await this.followRepository.findOne({
      where: {
        followerAccountId,
        followingAccountId: targetAccountId,
      },
    });

    const result = !!follow;
    await this.safeRedisSetex(
      cacheKey,
      CACHE_TTL_IS_FOLLOWING,
      result ? "1" : "0",
    );

    return result;
  }

  // ---------------------------------------------------------------------------
  // User Stats
  // ---------------------------------------------------------------------------

  /**
   * Get follower and following counts for a user.
   * Reads from the denormalized follower_counts table.
   * Cached in Redis for 10 minutes.
   */
  async getUserStats(accountId: string): Promise<UserStatsResponseDto> {
    const cacheKey = `social:user_stats:${accountId}`;
    const cached = await this.safeRedisGet(cacheKey);
    if (cached) {
      return JSON.parse(cached) as UserStatsResponseDto;
    }

    const counts = await this.followerCountRepository.findOne({
      where: { accountId },
    });

    const response: UserStatsResponseDto = {
      accountId,
      followerCount: counts?.followerCount ?? 0,
      followingCount: counts?.followingCount ?? 0,
    };

    await this.safeRedisSetex(
      cacheKey,
      CACHE_TTL_USER_STATS,
      JSON.stringify(response),
    );

    return response;
  }

  // ---------------------------------------------------------------------------
  // Convenience methods for other services (e.g. PostsService fan-out)
  // ---------------------------------------------------------------------------

  /**
   * Get all followers of a given account (non-paginated).
   * Used by PostsService for fan-out.
   */
  async getFollowersList(accountId: string): Promise<SocialFollowEntity[]> {
    try {
      return await this.followRepository.find({
        where: { followingAccountId: accountId },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get followers for ${accountId}: ${message}`);
      throw new SocialGraphQueryException("getFollowers", message);
    }
  }

  /**
   * Get all accounts that a given account follows (non-paginated).
   * Used by PostsService.
   */
  async getFollowingList(accountId: string): Promise<SocialFollowEntity[]> {
    try {
      return await this.followRepository.find({
        where: { followerAccountId: accountId },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get following for ${accountId}: ${message}`);
      throw new SocialGraphQueryException("getFollowing", message);
    }
  }

  /**
   * Get the list of account IDs that follow a given user.
   */
  async getFollowerAccountIds(accountId: string): Promise<string[]> {
    const followers = await this.getFollowersList(accountId);
    return followers.map((f) => f.followerAccountId);
  }

  /**
   * Get the list of account IDs a user follows.
   */
  async getFollowingAccountIds(accountId: string): Promise<string[]> {
    const following = await this.getFollowingList(accountId);
    return following.map((f) => f.followingAccountId);
  }

  // ---------------------------------------------------------------------------
  // Mirror Node Sync
  // ---------------------------------------------------------------------------

  /**
   * Sync social graph from Hedera Mirror Node.
   *
   * Polls the platform social graph topic for new messages after the given
   * sequence number, processes follow/unfollow events, and updates the
   * PostgreSQL index and denormalized counts.
   *
   * @param afterSequence Sequence number to start after (0 = from beginning)
   * @returns Number of events synced
   */
  async syncSocialGraphFromMirrorNode(
    afterSequence: number = 0,
  ): Promise<number> {
    const topicId = this.ensureTopicConfigured();

    try {
      const messages = await this.mirrorNodeService.getTopicMessages(topicId, {
        sequenceNumberGt: afterSequence,
        limit: 100,
      });

      if (!messages || messages.length === 0) {
        return 0;
      }

      let synced = 0;
      const affectedAccounts = new Set<string>();

      for (const message of messages) {
        try {
          const decodedText = Buffer.from(message.message, "base64").toString(
            "utf-8",
          );
          const event = JSON.parse(decodedText) as HcsSocialGraphEvent;

          if (event.type === "follow") {
            // Check if follow already exists
            const existing = await this.followRepository.findOne({
              where: {
                followerAccountId: event.actor,
                followingAccountId: event.target,
              },
            });

            if (!existing) {
              const followEntity = this.followRepository.create({
                followerAccountId: event.actor,
                followingAccountId: event.target,
                hcsSequenceNumber: message.sequence_number,
              });
              await this.followRepository.save(followEntity);
              affectedAccounts.add(event.actor);
              affectedAccounts.add(event.target);
              synced++;
            }
          } else if (event.type === "unfollow") {
            const existing = await this.followRepository.findOne({
              where: {
                followerAccountId: event.actor,
                followingAccountId: event.target,
              },
            });

            if (existing) {
              await this.followRepository.remove(existing);
              affectedAccounts.add(event.actor);
              affectedAccounts.add(event.target);
              synced++;
            }
          }
        } catch (error: unknown) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.error(
            `Failed to process social graph message seq ${message.sequence_number}: ${reason}`,
          );
          // Continue processing remaining messages
        }
      }

      // Rebuild counts for all affected accounts
      for (const accountId of affectedAccounts) {
        await this.rebuildCountsForAccount(accountId);
      }

      this.logger.log(
        `Synced ${synced} social graph events from Mirror Node (after seq ${afterSequence})`,
      );
      return synced;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Social graph sync failed: ${reason}`);
      throw new SocialGraphSyncException(reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Denormalized count management
  // ---------------------------------------------------------------------------

  /**
   * Update follower/following counts for both users involved in a follow/unfollow.
   */
  private async updateFollowerCounts(
    followerAccountId: string,
    followingAccountId: string,
  ): Promise<void> {
    await Promise.all([
      this.rebuildCountsForAccount(followerAccountId),
      this.rebuildCountsForAccount(followingAccountId),
    ]);
  }

  /**
   * Rebuild follower and following counts for a single account.
   */
  private async rebuildCountsForAccount(accountId: string): Promise<void> {
    try {
      const [followerCount, followingCount] = await Promise.all([
        this.followRepository.count({
          where: { followingAccountId: accountId },
        }),
        this.followRepository.count({
          where: { followerAccountId: accountId },
        }),
      ]);

      let countRecord = await this.followerCountRepository.findOne({
        where: { accountId },
      });

      if (!countRecord) {
        countRecord = this.followerCountRepository.create({ accountId });
      }

      countRecord.followerCount = followerCount;
      countRecord.followingCount = followingCount;
      await this.followerCountRepository.save(countRecord);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to rebuild counts for ${accountId}: ${reason}`);
      // Non-critical: counts can be rebuilt later; do not propagate
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: Redis cache helpers (safe — do not throw on Redis failure)
  // ---------------------------------------------------------------------------

  private async safeRedisGet(key: string): Promise<string | null> {
    try {
      return await this.redisService.get(key);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis GET failed for ${key}: ${reason}`);
      return null;
    }
  }

  private async safeRedisSetex(
    key: string,
    seconds: number,
    value: string,
  ): Promise<void> {
    try {
      await this.redisService.setex(key, seconds, value);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis SETEX failed for ${key}: ${reason}`);
    }
  }

  private async safeRedisDel(key: string): Promise<void> {
    try {
      await this.redisService.del(key);
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis DEL failed for ${key}: ${reason}`);
    }
  }

  /**
   * Clear all cached data related to a follow/unfollow operation.
   */
  private async clearFollowCache(
    followerAccountId: string,
    targetAccountId: string,
  ): Promise<void> {
    // Delete specific known keys
    await this.safeRedisDel(
      `social:is_following:${followerAccountId}:${targetAccountId}`,
    );
    await this.safeRedisDel(`social:user_stats:${followerAccountId}`);
    await this.safeRedisDel(`social:user_stats:${targetAccountId}`);

    // Delete pattern-matched keys for paginated lists
    const patterns = [
      `social:followers:${targetAccountId}:*`,
      `social:following:${followerAccountId}:*`,
    ];

    for (const pattern of patterns) {
      try {
        const keys = await this.redisService.keys(pattern);
        for (const key of keys) {
          await this.safeRedisDel(key);
        }
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Redis KEYS failed for pattern ${pattern}: ${reason}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Internal: DTO mapping
  // ---------------------------------------------------------------------------

  private toFollowerItemDto(entity: SocialFollowEntity): FollowerItemDto {
    return {
      followerAccountId: entity.followerAccountId,
      followingAccountId: entity.followingAccountId,
      hcsSequenceNumber:
        typeof entity.hcsSequenceNumber === "string"
          ? parseInt(String(entity.hcsSequenceNumber), 10)
          : entity.hcsSequenceNumber,
      createdAt: entity.createdAt.toISOString(),
    };
  }
}
