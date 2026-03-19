import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository, In } from "typeorm";
import { randomUUID } from "crypto";
import Redis from "ioredis";
import sanitizeHtml from "sanitize-html";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { SocialGraphService } from "./social-graph.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { CreatePostDto } from "../dto/create-post.dto";
import type {
  PostResponseDto,
  FeedResponseDto,
  PostMediaResponse,
} from "../dto/post-response.dto";
import {
  PostNotFoundException,
  PostNotOwnedException,
  PostAlreadyLikedException,
  PostLikeNotFoundException,
  PostDeletionFailedException,
  UserNotFoundException,
  UserMissingFeedTopicException,
  PostCreationFailedException,
  FeedRetrievalFailedException,
  MirrorNodeSyncFailedException,
} from "../exceptions/social.exceptions";
import {
  CommentNotFoundException,
  CommentDeleteNotAllowedException,
  CommentCreationException,
} from "../exceptions/comment.exceptions";
import type {
  CommentResponse,
  PaginatedCommentsResponse,
} from "../dto/comment.dto";

/**
 * HCS Post payload structure submitted to a user's public feed topic.
 */
interface HcsPostPayload {
  v: "1.0";
  type: "post";
  sender: string;
  content: {
    text: string;
    media?: Array<{
      type: "image" | "video";
      ref: string;
      mimeType: string;
      size: number;
    }>;
  };
}

/**
 * PostsService manages the lifecycle of posts on the Hedera Social Platform.
 *
 * Posts are submitted as HCS messages to a user's public feed topic,
 * indexed in PostgreSQL for fast querying, and fan-out to followers
 * via the FeedItemEntity table. Feeds are cached in Redis with short TTL.
 */
@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);
  private redis: Redis | null = null;
  private static readonly FEED_CACHE_TTL_SECONDS = 60;
  private static readonly FEED_CACHE_PREFIX = "feed:";

  constructor(
    @InjectRepository(PostIndexEntity)
    private readonly postRepository: Repository<PostIndexEntity>,
    @InjectRepository(PostLikeEntity)
    private readonly postLikeRepository: Repository<PostLikeEntity>,
    @InjectRepository(PostCommentEntity)
    private readonly commentRepository: Repository<PostCommentEntity>,
    @InjectRepository(FeedItemEntity)
    private readonly feedItemRepository: Repository<FeedItemEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly mirrorNodeService: MirrorNodeService,
    private readonly socialGraphService: SocialGraphService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection for feed caching.
   * If Redis is unavailable, the service continues without caching.
   */
  private initializeRedis(): void {
    try {
      const redisHost =
        this.configService.get<string>("redis.host") ?? "localhost";
      const redisPort = this.configService.get<number>("redis.port") ?? 6379;

      this.redis = new Redis({
        host: redisHost,
        port: redisPort,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn(
              "Redis connection failed after 3 retries, caching disabled",
            );
            return null;
          }
          return Math.min(times * 200, 2000);
        },
      });

      this.redis.connect().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `Redis connection failed, caching disabled: ${message}`,
        );
        this.redis = null;
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Redis initialization failed, caching disabled: ${message}`,
      );
      this.redis = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Create Post
  // ---------------------------------------------------------------------------

  /**
   * Create a new public post.
   *
   * 1. Validate user exists and has a publicFeedTopic
   * 2. Build HCS payload
   * 3. Submit to user's public feed topic via HederaService
   * 4. Index in PostgreSQL
   * 5. Fan-out to followers
   * 6. Invalidate cached feeds
   *
   * @param authorAccountId The Hedera account ID of the post author
   * @param dto             The post content
   * @returns PostResponseDto
   */
  async createPost(
    authorAccountId: string,
    dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    // 1. Validate user
    const user = await this.userRepository.findOne({
      where: { hederaAccountId: authorAccountId },
    });

    if (!user) {
      throw new UserNotFoundException(authorAccountId);
    }

    if (!user.publicFeedTopic) {
      throw new UserMissingFeedTopicException(authorAccountId);
    }

    // 2. Sanitize user input — strip ALL HTML tags (posts are plain text)
    const sanitizedText = sanitizeHtml(dto.text, {
      allowedTags: [],
      allowedAttributes: {},
    }).trim();

    // 3. Build HCS payload
    const hcsPayload: HcsPostPayload = {
      v: "1.0",
      type: "post",
      sender: authorAccountId,
      content: {
        text: sanitizedText,
      },
    };

    if (dto.media && dto.media.length > 0) {
      hcsPayload.content.media = dto.media.map((m) => ({
        type: m.type,
        ref: `ipfs://${m.ipfsCid}`,
        mimeType: m.mimeType,
        size: m.size,
      }));
    }

    // 3. Index in PostgreSQL immediately (non-blocking)
    // HCS submission happens asynchronously in the background for audit trail.
    const postId = randomUUID();
    const now = new Date();

    const mediaRefs = dto.media ? dto.media.map((m) => m.ipfsCid) : [];

    const postEntity = this.postRepository.create({
      id: postId,
      authorAccountId,
      hcsTopicId: user.publicFeedTopic,
      sequenceNumber: 0, // Placeholder; updated after async HCS submission
      consensusTimestamp: now,
      contentText: sanitizedText,
      hasMedia: mediaRefs.length > 0,
      mediaRefs: mediaRefs.length > 0 ? mediaRefs : undefined,
    });

    // 4. Submit to HCS in background (fire-and-forget for responsiveness)
    const messageBuffer = Buffer.from(JSON.stringify(hcsPayload));
    this.hederaService
      .submitMessage(user.publicFeedTopic, messageBuffer)
      .then((seqNum) => {
        // Update the DB record with the real sequence number once HCS confirms
        void this.postRepository.update(
          { id: postId },
          { sequenceNumber: parseInt(seqNum, 10) },
        );
        this.logger.log(
          `HCS post submission confirmed for ${authorAccountId}: seq=${seqNum}`,
        );
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(
          `HCS post submission failed for ${authorAccountId}: ${message}. Post is indexed locally.`,
        );
      });

    try {
      await this.postRepository.save(postEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to index post ${postId}: ${message}`);
      throw new PostCreationFailedException(
        `Database indexing failed: ${message}`,
      );
    }

    // 5. Fan-out to followers (async, non-blocking)
    this.fanOutToFollowers(postEntity, authorAccountId).catch(
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Fan-out failed for post ${postId}: ${message}`);
      },
    );

    // 6. Invalidate cached feeds (author's user feed + global trending)
    await this.invalidateUserFeedCache(authorAccountId);
    await this.invalidateTrendingCache();

    this.logger.log(
      `Post created: ${postId}, topic: ${user.publicFeedTopic} (HCS submission async)`,
    );

    return this.toPostResponse(postEntity, user);
  }

  // ---------------------------------------------------------------------------
  // Fan-out
  // ---------------------------------------------------------------------------

  /**
   * Fan-out a post to all followers by creating FeedItemEntity entries.
   */
  private async fanOutToFollowers(
    post: PostIndexEntity,
    authorAccountId: string,
  ): Promise<void> {
    const followerIds =
      await this.socialGraphService.getFollowerAccountIds(authorAccountId);

    if (followerIds.length === 0) {
      return;
    }

    const feedItems = followerIds.map((followerId) =>
      this.feedItemRepository.create({
        ownerAccountId: followerId,
        postId: post.id,
        authorAccountId: post.authorAccountId,
        consensusTimestamp: post.consensusTimestamp,
      }),
    );

    // Batch insert in chunks to avoid overwhelming the database
    const chunkSize = 500;
    for (let i = 0; i < feedItems.length; i += chunkSize) {
      const chunk = feedItems.slice(i, i + chunkSize);
      await this.feedItemRepository.save(chunk);
    }

    // Invalidate cached home feeds for all followers
    for (const followerId of followerIds) {
      await this.invalidateHomeFeedCache(followerId);
    }

    this.logger.debug(
      `Fan-out complete: post ${post.id} to ${followerIds.length} followers`,
    );
  }

  // ---------------------------------------------------------------------------
  // Home Feed
  // ---------------------------------------------------------------------------

  /**
   * Get the home feed for a user (posts from accounts they follow).
   *
   * Uses FeedItemEntity for fast lookups with cursor-based pagination.
   * Results are cached in Redis with a 60-second TTL.
   *
   * @param userAccountId The Hedera account ID of the requesting user
   * @param cursor        Optional cursor for pagination (ISO timestamp)
   * @param limit         Number of posts to return (default 20, max 100)
   */
  async getHomeFeed(
    userAccountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<FeedResponseDto> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = `${PostsService.FEED_CACHE_PREFIX}home:${userAccountId}:${cursor ?? "latest"}:${effectiveLimit}`;

    // Try cache first
    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached as FeedResponseDto;
    }

    try {
      // Build query using FeedItemEntity
      const queryBuilder = this.feedItemRepository
        .createQueryBuilder("feedItem")
        .where("feedItem.ownerAccountId = :ownerAccountId", {
          ownerAccountId: userAccountId,
        })
        .orderBy("feedItem.consensusTimestamp", "DESC")
        .take(effectiveLimit + 1); // +1 to check if there are more

      if (cursor) {
        queryBuilder.andWhere("feedItem.consensusTimestamp < :cursor", {
          cursor: new Date(cursor),
        });
      }

      const feedItems = await queryBuilder.getMany();

      const hasMore = feedItems.length > effectiveLimit;
      const items = hasMore ? feedItems.slice(0, effectiveLimit) : feedItems;

      // Get the post IDs and fetch full post data
      const postIds = items.map((fi) => fi.postId);
      let posts: PostIndexEntity[] = [];
      if (postIds.length > 0) {
        posts = await this.postRepository.find({
          where: { id: In(postIds) },
        });
      }

      // Get author info
      const authorIds = [...new Set(posts.map((p) => p.authorAccountId))];
      let authors: UserEntity[] = [];
      if (authorIds.length > 0) {
        authors = await this.userRepository.find({
          where: { hederaAccountId: In(authorIds) },
        });
      }

      const authorMap = new Map(authors.map((a) => [a.hederaAccountId, a]));

      // Build response sorted by consensusTimestamp DESC
      const postMap = new Map(posts.map((p) => [p.id, p]));
      const postResponses: PostResponseDto[] = [];

      for (const item of items) {
        const post = postMap.get(item.postId);
        if (!post) {
          continue;
        }
        const author = authorMap.get(post.authorAccountId);
        postResponses.push(this.toPostResponse(post, author));
      }

      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].consensusTimestamp.toISOString()
          : null;

      const result: FeedResponseDto = {
        posts: postResponses,
        nextCursor,
        hasMore,
      };

      await this.setInCache(
        cacheKey,
        result,
        PostsService.FEED_CACHE_TTL_SECONDS,
      );

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get home feed for ${userAccountId}: ${message}`,
      );
      throw new FeedRetrievalFailedException(message);
    }
  }

  // ---------------------------------------------------------------------------
  // User Feed
  // ---------------------------------------------------------------------------

  /**
   * Get all posts by a specific user, with cursor-based pagination.
   *
   * @param targetAccountId The Hedera account ID of the user whose posts to fetch
   * @param cursor          Optional cursor for pagination (ISO timestamp)
   * @param limit           Number of posts to return (default 20, max 100)
   */
  async getUserFeed(
    targetAccountId: string,
    cursor?: string,
    limit: number = 20,
    currentUserId?: string,
  ): Promise<FeedResponseDto> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = `${PostsService.FEED_CACHE_PREFIX}user:${targetAccountId}:${cursor ?? "latest"}:${effectiveLimit}:${currentUserId ?? "anon"}`;

    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached as FeedResponseDto;
    }

    try {
      const queryBuilder = this.postRepository
        .createQueryBuilder("post")
        .where("post.authorAccountId = :authorAccountId", {
          authorAccountId: targetAccountId,
        })
        .orderBy("post.consensusTimestamp", "DESC")
        .take(effectiveLimit + 1);

      if (cursor) {
        queryBuilder.andWhere("post.consensusTimestamp < :cursor", {
          cursor: new Date(cursor),
        });
      }

      const posts = await queryBuilder.getMany();

      const hasMore = posts.length > effectiveLimit;
      const items = hasMore ? posts.slice(0, effectiveLimit) : posts;

      // Get author info
      const author = await this.userRepository.findOne({
        where: { hederaAccountId: targetAccountId },
      });

      const postIds = items.map((p) => p.id);
      const { likeCounts, commentCounts, likedPostIds } =
        await this.fetchPostCounts(postIds, currentUserId);

      const postResponses = items.map((post) =>
        this.toPostResponse(
          post,
          author ?? undefined,
          likeCounts.get(post.id) ?? 0,
          commentCounts.get(post.id) ?? 0,
          likedPostIds.has(post.id),
        ),
      );

      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].consensusTimestamp.toISOString()
          : null;

      const result: FeedResponseDto = {
        posts: postResponses,
        nextCursor,
        hasMore,
      };

      await this.setInCache(
        cacheKey,
        result,
        PostsService.FEED_CACHE_TTL_SECONDS,
      );

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get user feed for ${targetAccountId}: ${message}`,
      );
      throw new FeedRetrievalFailedException(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Trending Posts
  // ---------------------------------------------------------------------------

  /**
   * Get trending posts.
   *
   * For now, returns the most recent posts across all users.
   * A more sophisticated trending algorithm can be added later.
   */
  async getTrendingPosts(
    cursor?: string,
    limit: number = 20,
    currentUserId?: string,
  ): Promise<FeedResponseDto> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);
    const cacheKey = `${PostsService.FEED_CACHE_PREFIX}trending:${cursor ?? "latest"}:${effectiveLimit}:${currentUserId ?? "anon"}`;

    const cached = await this.getFromCache(cacheKey);
    if (cached) {
      return cached as FeedResponseDto;
    }

    try {
      const queryBuilder = this.postRepository
        .createQueryBuilder("post")
        .orderBy("post.consensusTimestamp", "DESC")
        .take(effectiveLimit + 1);

      if (cursor) {
        queryBuilder.where("post.consensusTimestamp < :cursor", {
          cursor: new Date(cursor),
        });
      }

      const posts = await queryBuilder.getMany();
      const hasMore = posts.length > effectiveLimit;
      const items = hasMore ? posts.slice(0, effectiveLimit) : posts;

      // Get all authors
      const authorIds = [...new Set(items.map((p) => p.authorAccountId))];
      let authors: UserEntity[] = [];
      if (authorIds.length > 0) {
        authors = await this.userRepository.find({
          where: { hederaAccountId: In(authorIds) },
        });
      }

      const authorMap = new Map(authors.map((a) => [a.hederaAccountId, a]));

      const postIds = items.map((p) => p.id);
      const { likeCounts, commentCounts, likedPostIds } =
        await this.fetchPostCounts(postIds, currentUserId);

      const postResponses = items.map((post) =>
        this.toPostResponse(
          post,
          authorMap.get(post.authorAccountId),
          likeCounts.get(post.id) ?? 0,
          commentCounts.get(post.id) ?? 0,
          likedPostIds.has(post.id),
        ),
      );

      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].consensusTimestamp.toISOString()
          : null;

      const result: FeedResponseDto = {
        posts: postResponses,
        nextCursor,
        hasMore,
      };

      await this.setInCache(
        cacheKey,
        result,
        PostsService.FEED_CACHE_TTL_SECONDS,
      );

      return result;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get trending posts: ${message}`);
      throw new FeedRetrievalFailedException(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Following Feed (direct query — works even for newly followed accounts)
  // ---------------------------------------------------------------------------

  /**
   * Get posts from accounts the current user follows, via direct JOIN query.
   *
   * Unlike getHomeFeed() which relies on FeedItemEntity (fan-out),
   * this directly queries PostIndexEntity WHERE authorAccountId IN (followed).
   * This means it always shows historical posts from followed accounts too.
   */
  async getFollowingFeed(
    userAccountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<FeedResponseDto> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);

    // Get followed account IDs
    const followingIds = await this.socialGraphService.getFollowingAccountIds(userAccountId);

    if (followingIds.length === 0) {
      return { posts: [], nextCursor: null, hasMore: false };
    }

    try {
      const queryBuilder = this.postRepository
        .createQueryBuilder("post")
        .where("post.authorAccountId IN (:...followingIds)", { followingIds })
        .orderBy("post.consensusTimestamp", "DESC")
        .take(effectiveLimit + 1);

      if (cursor) {
        queryBuilder.andWhere("post.consensusTimestamp < :cursor", {
          cursor: new Date(cursor),
        });
      }

      const posts = await queryBuilder.getMany();
      const hasMore = posts.length > effectiveLimit;
      const items = hasMore ? posts.slice(0, effectiveLimit) : posts;

      const authorIds = [...new Set(items.map((p) => p.authorAccountId))];
      let authors: UserEntity[] = [];
      if (authorIds.length > 0) {
        authors = await this.userRepository.find({
          where: { hederaAccountId: In(authorIds) },
        });
      }

      const authorMap = new Map(authors.map((a) => [a.hederaAccountId, a]));

      const postIds = items.map((p) => p.id);
      // Look up user UUID for isLiked check (PostLike uses UUID not hedera account ID)
      const currentUser = await this.userRepository.findOne({
        where: { hederaAccountId: userAccountId },
        select: ["id"],
      });
      const { likeCounts, commentCounts, likedPostIds } =
        await this.fetchPostCounts(postIds, currentUser?.id);

      const postResponses = items.map((post) =>
        this.toPostResponse(
          post,
          authorMap.get(post.authorAccountId),
          likeCounts.get(post.id) ?? 0,
          commentCounts.get(post.id) ?? 0,
          likedPostIds.has(post.id),
        ),
      );

      const nextCursor =
        hasMore && items.length > 0
          ? items[items.length - 1].consensusTimestamp.toISOString()
          : null;

      return { posts: postResponses, nextCursor, hasMore };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get following feed for ${userAccountId}: ${message}`);
      throw new FeedRetrievalFailedException(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Single Post
  // ---------------------------------------------------------------------------

  /**
   * Get a single post by ID.
   *
   * @param postId UUID of the post
   */
  async getPost(postId: string): Promise<PostResponseDto> {
    const post = await this.postRepository.findOne({
      where: { id: postId },
    });

    if (!post) {
      throw new PostNotFoundException(postId);
    }

    const author = await this.userRepository.findOne({
      where: { hederaAccountId: post.authorAccountId },
    });

    return this.toPostResponse(post, author ?? undefined);
  }

  // ---------------------------------------------------------------------------
  // Like Post
  // ---------------------------------------------------------------------------

  /**
   * Like a post. Creates a PostLikeEntity entry. Idempotent-safe via unique constraint.
   *
   * @param userId  The user ID (UUID) of the liker
   * @param postId  UUID of the post to like
   */
  async likePost(userId: string, postId: string): Promise<void> {
    // Verify post exists
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundException(postId);
    }

    // Check if already liked
    const existing = await this.postLikeRepository.findOne({
      where: { userId, postId },
    });
    if (existing) {
      throw new PostAlreadyLikedException(postId);
    }

    const like = this.postLikeRepository.create({ userId, postId });
    await this.postLikeRepository.save(like);

    this.logger.log(`User ${userId} liked post ${postId}`);

    // Send notification to post author (non-blocking)
    // Resolve the liker's account ID for the notification
    const liker = await this.userRepository.findOne({ where: { id: userId } });
    if (
      liker &&
      liker.hederaAccountId &&
      post.authorAccountId !== liker.hederaAccountId
    ) {
      this.notificationsService
        .notifyPostLiked(
          post.authorAccountId,
          liker.hederaAccountId,
          postId,
          liker.displayName ?? undefined,
        )
        .catch((error: unknown) => {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Failed to send post-liked notification for post ${postId}: ${reason}`,
          );
        });
    }
  }

  // ---------------------------------------------------------------------------
  // Unlike Post
  // ---------------------------------------------------------------------------

  /**
   * Unlike a post. Removes the PostLikeEntity entry.
   *
   * @param userId  The user ID (UUID) of the unliker
   * @param postId  UUID of the post to unlike
   */
  async unlikePost(userId: string, postId: string): Promise<void> {
    const existing = await this.postLikeRepository.findOne({
      where: { userId, postId },
    });
    if (!existing) {
      throw new PostLikeNotFoundException(postId);
    }

    await this.postLikeRepository.remove(existing);

    this.logger.log(`User ${userId} unliked post ${postId}`);
  }

  // ---------------------------------------------------------------------------
  // Delete Post
  // ---------------------------------------------------------------------------

  /**
   * Soft-delete a post. Only the post author can delete their own posts.
   *
   * @param userAccountId The Hedera account ID of the user requesting deletion
   * @param postId        UUID of the post to delete
   */
  async deletePost(userAccountId: string, postId: string): Promise<void> {
    const post = await this.postRepository.findOne({ where: { id: postId } });

    if (!post) {
      throw new PostNotFoundException(postId);
    }

    if (post.authorAccountId !== userAccountId) {
      throw new PostNotOwnedException(postId);
    }

    try {
      await this.postRepository.softRemove(post);
      await this.invalidateUserFeedCache(userAccountId);
      this.logger.log(`Post ${postId} deleted by ${userAccountId}`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to delete post ${postId}: ${message}`);
      throw new PostDeletionFailedException(message);
    }
  }

  // ---------------------------------------------------------------------------
  // Post Comments (GAP-007)
  // ---------------------------------------------------------------------------

  /**
   * Create a comment on a post.
   *
   * 1. Verify the post exists
   * 2. Submit comment event to the post's HCS topic for audit
   * 3. Index in PostgreSQL
   *
   * @param authorAccountId Hedera account ID of the commenter
   * @param postId          UUID of the post to comment on
   * @param text            Comment text content
   * @returns CommentResponse
   */
  async createComment(
    authorAccountId: string,
    postId: string,
    text: string,
  ): Promise<CommentResponse> {
    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundException(postId);
    }

    let hcsTopicId: string | null = null;
    let hcsSequenceNumber: number | null = null;

    // Submit comment event to the post's HCS topic for audit trail
    if (post.hcsTopicId) {
      try {
        const payloadBuffer = Buffer.from(
          JSON.stringify({
            v: "1.0",
            type: "comment",
            sender: authorAccountId,
            postId,
            content: { text },
          }),
        );

        const seqStr = await this.hederaService.submitMessage(
          post.hcsTopicId,
          payloadBuffer,
        );

        hcsTopicId = post.hcsTopicId;
        const parsed = parseInt(seqStr, 10);
        hcsSequenceNumber = Number.isNaN(parsed) ? null : parsed;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `HCS comment submission failed for post ${postId}, indexing locally only: ${message}`,
        );
      }
    }

    try {
      const comment = this.commentRepository.create({
        postId,
        authorAccountId,
        contentText: sanitizeHtml(text, {
          allowedTags: [],
          allowedAttributes: {},
        }).trim(),
        hcsTopicId,
        hcsSequenceNumber,
      });

      const saved = await this.commentRepository.save(comment);
      this.logger.log(
        `Comment ${saved.id} created on post ${postId} by ${authorAccountId}`,
      );

      // Look up author display name for the response
      const author = await this.userRepository.findOne({
        where: { hederaAccountId: authorAccountId },
      });

      return this.toCommentResponse(saved, author?.displayName ?? null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to create comment on post ${postId}: ${message}`,
      );
      throw new CommentCreationException(message);
    }
  }

  /**
   * Get paginated comments for a post, ordered by creation time ascending.
   *
   * Joins with the user table to include authorDisplayName in each comment.
   *
   * @param postId UUID of the post
   * @param limit  Max items to return (default 20, max 100)
   * @param cursor ISO timestamp cursor for pagination
   * @returns PaginatedCommentsResponse
   */
  async getComments(
    postId: string,
    limit = 20,
    cursor?: string,
  ): Promise<PaginatedCommentsResponse> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);

    const post = await this.postRepository.findOne({ where: { id: postId } });
    if (!post) {
      throw new PostNotFoundException(postId);
    }

    const qb = this.commentRepository
      .createQueryBuilder("c")
      .where("c.postId = :postId", { postId })
      .orderBy("c.createdAt", "ASC")
      .take(effectiveLimit + 1);

    if (cursor) {
      qb.andWhere("c.createdAt > :cursor", { cursor: new Date(cursor) });
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > effectiveLimit;
    const items = hasMore ? rows.slice(0, effectiveLimit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? items[items.length - 1].createdAt.toISOString()
        : null;

    // Batch-load author display names for all comments
    const authorAccountIds = [...new Set(items.map((c) => c.authorAccountId))];
    let authors: UserEntity[] = [];
    if (authorAccountIds.length > 0) {
      authors = await this.userRepository.find({
        where: { hederaAccountId: In(authorAccountIds) },
      });
    }
    const authorDisplayNameMap = new Map(
      authors.map((u) => [u.hederaAccountId, u.displayName ?? null]),
    );

    return {
      comments: items.map((c) =>
        this.toCommentResponse(
          c,
          authorDisplayNameMap.get(c.authorAccountId) ?? null,
        ),
      ),
      cursor: nextCursor,
      hasMore,
    };
  }

  /**
   * Soft-delete a comment. Only the comment author can delete their comment.
   *
   * @param authorAccountId Hedera account ID of the requesting user
   * @param commentId       UUID of the comment to delete
   */
  async deleteComment(
    authorAccountId: string,
    commentId: string,
  ): Promise<void> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
    });

    if (!comment) {
      throw new CommentNotFoundException(commentId);
    }

    if (comment.authorAccountId !== authorAccountId) {
      throw new CommentDeleteNotAllowedException(commentId, authorAccountId);
    }

    await this.commentRepository.softRemove(comment);
    this.logger.log(`Comment ${commentId} deleted by ${authorAccountId}`);
  }

  private toCommentResponse(
    comment: PostCommentEntity,
    authorDisplayName: string | null,
  ): CommentResponse {
    return {
      id: comment.id,
      postId: comment.postId,
      authorAccountId: comment.authorAccountId,
      authorDisplayName,
      contentText: comment.contentText,
      hcsTopicId: comment.hcsTopicId,
      hcsSequenceNumber:
        comment.hcsSequenceNumber !== null
          ? Number(comment.hcsSequenceNumber)
          : null,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Mirror Node Sync
  // ---------------------------------------------------------------------------

  /**
   * Sync posts from the Hedera Mirror Node.
   *
   * Fetches new messages from a topic and indexes them in PostgreSQL.
   * Used for backfill/catch-up when the local index is behind.
   *
   * @param topicId       HCS topic ID to sync from
   * @param afterSequence Optional sequence number to start after
   * @returns Number of new posts indexed
   */
  async syncPostsFromMirrorNode(
    topicId: string,
    afterSequence?: number,
  ): Promise<number> {
    try {
      const messages = await this.mirrorNodeService.getTopicMessages(topicId, {
        sequenceNumberGt: afterSequence,
        limit: 100,
      });

      let indexed = 0;

      for (const msg of messages) {
        // Check if already indexed
        const existing = await this.postRepository.findOne({
          where: {
            hcsTopicId: topicId,
            sequenceNumber: msg.sequence_number,
          },
        });

        if (existing) {
          continue;
        }

        // Decode and parse the message
        let payload: HcsPostPayload;
        try {
          const decoded = Buffer.from(msg.message, "base64").toString("utf-8");
          payload = JSON.parse(decoded) as HcsPostPayload;
        } catch (error: unknown) {
          const parseError =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Skipping unparseable message seq ${msg.sequence_number} on topic ${topicId}: ${parseError}`,
          );
          continue;
        }

        if (payload.type !== "post" || !payload.content?.text) {
          continue;
        }

        const mediaRefs = payload.content.media
          ? payload.content.media.map((m) => m.ref.replace("ipfs://", ""))
          : [];

        const postEntity = this.postRepository.create({
          id: randomUUID(),
          authorAccountId: payload.sender,
          hcsTopicId: topicId,
          sequenceNumber: msg.sequence_number,
          consensusTimestamp: new Date(
            parseFloat(msg.consensus_timestamp) * 1000,
          ),
          contentText: payload.content.text,
          hasMedia: mediaRefs.length > 0,
          mediaRefs: mediaRefs.length > 0 ? mediaRefs : undefined,
        });

        await this.postRepository.save(postEntity);
        indexed++;
      }

      this.logger.log(`Synced ${indexed} new posts from topic ${topicId}`);
      return indexed;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Mirror node sync failed for topic ${topicId}: ${message}`,
      );
      throw new MirrorNodeSyncFailedException(topicId, message);
    }
  }

  // ---------------------------------------------------------------------------
  // Redis Cache helpers
  // ---------------------------------------------------------------------------

  private async getFromCache(key: string): Promise<unknown | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const data = await this.redis.get(key);
      if (data) {
        return JSON.parse(data) as unknown;
      }
      return null;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis cache get failed for ${key}: ${message}`);
      return null;
    }
  }

  private async setInCache(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.setex(key, ttlSeconds, JSON.stringify(value));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Redis cache set failed for ${key}: ${message}`);
    }
  }

  private async invalidateHomeFeedCache(userAccountId: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const pattern = `${PostsService.FEED_CACHE_PREFIX}home:${userAccountId}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to invalidate home feed cache for ${userAccountId}: ${message}`,
      );
    }
  }

  private async invalidateTrendingCache(): Promise<void> {
    if (!this.redis) {
      return;
    }
    try {
      const pattern = `${PostsService.FEED_CACHE_PREFIX}trending:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Failed to invalidate trending cache: ${message}`);
    }
  }

  private async invalidateUserFeedCache(userAccountId: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const pattern = `${PostsService.FEED_CACHE_PREFIX}user:${userAccountId}:*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to invalidate user feed cache for ${userAccountId}: ${message}`,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Response mapping
  // ---------------------------------------------------------------------------

  private toPostResponse(
    post: PostIndexEntity,
    author?: UserEntity,
    likeCount = 0,
    commentCount = 0,
    isLiked = false,
  ): PostResponseDto {
    const media: PostMediaResponse[] = post.mediaRefs
      ? post.mediaRefs.map((cid) => ({
          type: "image" as const,
          ref: `ipfs://${cid}`,
          mimeType: "image/png",
          size: 0,
        }))
      : [];

    return {
      id: post.id,
      author: {
        accountId: post.authorAccountId,
        displayName: author?.displayName ?? null,
        avatarUrl: author?.avatarIpfsCid
          ? `${this.configService.get<string>("pinata.gatewayUrl", "")}/${author.avatarIpfsCid}`
          : null,
      },
      text: post.contentText,
      media,
      hcsTopicId: post.hcsTopicId,
      sequenceNumber:
        typeof post.sequenceNumber === "string"
          ? parseInt(String(post.sequenceNumber), 10)
          : post.sequenceNumber,
      consensusTimestamp: post.consensusTimestamp.toISOString(),
      createdAt: post.createdAt
        ? post.createdAt.toISOString()
        : post.consensusTimestamp.toISOString(),
      likeCount,
      commentCount,
      isLiked,
    };
  }

  /**
   * Fetch like counts, comment counts, and liked-by-user status for a list of post IDs.
   */
  private async fetchPostCounts(
    postIds: string[],
    currentUserAccountId?: string,
  ): Promise<{
    likeCounts: Map<string, number>;
    commentCounts: Map<string, number>;
    likedPostIds: Set<string>;
  }> {
    if (postIds.length === 0) {
      return {
        likeCounts: new Map(),
        commentCounts: new Map(),
        likedPostIds: new Set(),
      };
    }

    const [likeRows, commentRows, likedRows] = await Promise.all([
      this.postLikeRepository
        .createQueryBuilder("l")
        .select("l.postId", "postId")
        .addSelect("COUNT(*)", "count")
        .where("l.postId IN (:...ids)", { ids: postIds })
        .groupBy("l.postId")
        .getRawMany<{ postId: string; count: string }>(),
      this.commentRepository
        .createQueryBuilder("c")
        .select("c.postId", "postId")
        .addSelect("COUNT(*)", "count")
        .where("c.postId IN (:...ids)", { ids: postIds })
        .groupBy("c.postId")
        .getRawMany<{ postId: string; count: string }>(),
      currentUserAccountId
        ? this.postLikeRepository.find({
            where: { postId: In(postIds), userId: currentUserAccountId },
            select: ["postId"],
          })
        : Promise.resolve([]),
    ]);

    const likeCounts = new Map(
      likeRows.map((r) => [r.postId, parseInt(r.count, 10)]),
    );
    const commentCounts = new Map(
      commentRows.map((r) => [r.postId, parseInt(r.count, 10)]),
    );
    const likedPostIds = new Set(likedRows.map((r) => r.postId));

    return { likeCounts, commentCounts, likedPostIds };
  }
}
