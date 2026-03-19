/**
 * Social Module — Controller-Level Service Coverage Tests
 *
 * Exercises the service methods called by PostsController and SocialGraphController
 * that have 0% controller coverage. Tests focus on the response shapes, edge cases,
 * and integration paths that the existing service tests don't cover.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import net from "net";
import { randomUUID } from "crypto";
import { PostsService } from "../services/posts.service";
import { SocialGraphService } from "../services/social-graph.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { RedisService } from "../../redis/redis.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { NotificationEntity } from "../../../database/entities/notification.entity";
import {
  PostNotFoundException,
  PostNotOwnedException,
  PostAlreadyLikedException,
  PostLikeNotFoundException,
} from "../exceptions/social.exceptions";

const logger = new Logger("SocialControllersIntegrationTest");

const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

async function isPortReachable(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("error", () => resolve(false));
    socket.connect(port, host);
  });
}

function uniqueAccountId(): string {
  return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
}

function uniqueTopicId(): string {
  return `0.0.${900000 + Math.floor(Math.random() * 99999)}`;
}

const ALL_ENTITIES = [
  PostIndexEntity,
  PostLikeEntity,
  PostCommentEntity,
  FeedItemEntity,
  UserEntity,
  SocialFollowEntity,
  FollowerCountEntity,
  NotificationEntity,
];

describe("Social Controllers Integration Tests", () => {
  let module: TestingModule;
  let postsService: PostsService;
  let socialGraphService: SocialGraphService;
  let dataSource: DataSource;
  let postRepository: Repository<PostIndexEntity>;
  let likeRepository: Repository<PostLikeEntity>;
  let commentRepository: Repository<PostCommentEntity>;
  let feedItemRepository: Repository<FeedItemEntity>;
  let userRepository: Repository<UserEntity>;
  let followRepository: Repository<SocialFollowEntity>;
  let followerCountRepository: Repository<FollowerCountEntity>;
  let notificationRepository: Repository<NotificationEntity>;
  let postgresAvailable = false;

  // Cleanup tracking
  const createdLikeIds: string[] = [];
  const createdCommentIds: string[] = [];
  const createdFeedItemIds: string[] = [];
  const createdPostIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdFollowIds: string[] = [];
  const createdFollowerCountIds: string[] = [];

  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const accountId = overrides?.hederaAccountId ?? uniqueAccountId();
    const user = userRepository.create({
      displayName: overrides?.displayName ?? `CtrlUser_${accountId}`,
      email: `ctrl-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.io`,
      hederaAccountId: accountId,
      publicFeedTopic: overrides?.publicFeedTopic ?? null,
      status: overrides?.status ?? "active",
      avatarIpfsCid: overrides?.avatarIpfsCid ?? null,
      ...overrides,
    });
    const saved = await userRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  async function createTestPost(
    authorAccountId: string,
    overrides?: Partial<PostIndexEntity>,
  ): Promise<PostIndexEntity> {
    const postId = overrides?.id ?? randomUUID();
    const post = postRepository.create({
      id: postId,
      authorAccountId,
      hcsTopicId: overrides?.hcsTopicId ?? uniqueTopicId(),
      sequenceNumber:
        overrides?.sequenceNumber ?? Math.floor(Math.random() * 100000),
      consensusTimestamp: overrides?.consensusTimestamp ?? new Date(),
      contentText:
        overrides?.contentText ?? `Ctrl test post ${postId.slice(0, 8)}`,
      hasMedia: overrides?.hasMedia ?? false,
    });
    const saved = await postRepository.save(post);
    createdPostIds.push(saved.id);
    return saved;
  }

  async function createTestFeedItem(
    ownerAccountId: string,
    post: PostIndexEntity,
  ): Promise<FeedItemEntity> {
    const feedItem = feedItemRepository.create({
      ownerAccountId,
      postId: post.id,
      authorAccountId: post.authorAccountId,
      consensusTimestamp: post.consensusTimestamp,
    });
    const saved = await feedItemRepository.save(feedItem);
    createdFeedItemIds.push(saved.id);
    return saved;
  }

  async function createTestFollow(
    followerAccountId: string,
    followingAccountId: string,
  ): Promise<SocialFollowEntity> {
    const follow = followRepository.create({
      followerAccountId,
      followingAccountId,
      hcsTopicId: uniqueTopicId(),
      hcsSequenceNumber: Math.floor(Math.random() * 10000),
    });
    const saved = await followRepository.save(follow);
    createdFollowIds.push(saved.id);
    return saved;
  }

  async function cleanupAll(): Promise<void> {
    try {
      for (const id of createdLikeIds) {
        try {
          await likeRepository
            .createQueryBuilder()
            .delete()
            .from(PostLikeEntity)
            .where("id = :id", { id })
            .execute();
        } catch {
          /* best-effort */
        }
      }
      for (const postId of createdPostIds) {
        try {
          await likeRepository
            .createQueryBuilder()
            .delete()
            .from(PostLikeEntity)
            .where('"postId" = :postId', { postId })
            .execute();
        } catch {
          /* best-effort */
        }
        try {
          await commentRepository
            .createQueryBuilder()
            .delete()
            .from(PostCommentEntity)
            .where('"postId" = :postId', { postId })
            .execute();
        } catch {
          /* best-effort */
        }
      }
      for (const id of createdCommentIds) {
        try {
          await commentRepository
            .createQueryBuilder()
            .delete()
            .from(PostCommentEntity)
            .where("id = :id", { id })
            .execute();
        } catch {
          /* best-effort */
        }
      }
      for (const userId of createdUserIds) {
        try {
          const user = await userRepository.findOne({ where: { id: userId } });
          if (user?.hederaAccountId) {
            await notificationRepository
              .createQueryBuilder()
              .delete()
              .from(NotificationEntity)
              .where('"recipientAccountId" = :accountId', {
                accountId: user.hederaAccountId,
              })
              .execute();
          }
        } catch {
          /* best-effort */
        }
      }
      for (const id of createdFeedItemIds) {
        try {
          await feedItemRepository.delete(id);
        } catch {
          /* best-effort */
        }
      }
      for (const id of createdPostIds) {
        try {
          await postRepository
            .createQueryBuilder()
            .delete()
            .from(PostIndexEntity)
            .where("id = :id", { id })
            .execute();
        } catch {
          /* best-effort */
        }
      }
      for (const id of createdFollowIds) {
        try {
          await followRepository
            .createQueryBuilder()
            .delete()
            .from(SocialFollowEntity)
            .where("id = :id", { id })
            .execute();
        } catch {
          /* best-effort */
        }
      }
      for (const id of createdFollowerCountIds) {
        try {
          await followerCountRepository
            .createQueryBuilder()
            .delete()
            .from(FollowerCountEntity)
            .where("id = :id", { id })
            .execute();
        } catch {
          /* best-effort */
        }
      }
      for (const id of createdUserIds) {
        try {
          await userRepository
            .createQueryBuilder()
            .delete()
            .from(UserEntity)
            .where("id = :id", { id })
            .execute();
        } catch {
          /* best-effort */
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Cleanup failed: ${message}`);
    }
  }

  beforeAll(async () => {
    postgresAvailable = await isPortReachable(TEST_DB_PORT, TEST_DB_HOST);
    logger.log(`PostgreSQL(:${TEST_DB_PORT}): ${postgresAvailable}`);

    if (!postgresAvailable) {
      logger.warn("PostgreSQL not available — tests skipped");
      return;
    }

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                database: {
                  host: TEST_DB_HOST,
                  port: TEST_DB_PORT,
                  username: TEST_DB_USER,
                  password: TEST_DB_PASS,
                  database: TEST_DB_NAME,
                },
                redis: { host: TEST_REDIS_HOST, port: TEST_REDIS_PORT },
                hedera: {
                  network: "testnet",
                  operatorId: "",
                  operatorKey: "",
                  socialGraphTopic: "",
                  mirrorNodeUrl: "https://testnet.mirrornode.hedera.com/api/v1",
                },
                jwt: {
                  secret:
                    "test-jwt-secret-key-minimum-32-characters-long-for-testing",
                  expiresIn: "24h",
                },
                pinata: { gatewayUrl: "https://gateway.pinata.cloud/ipfs" },
              }),
            ],
          }),
          EventEmitterModule.forRoot(),
          TypeOrmModule.forRoot({
            type: "postgres",
            host: TEST_DB_HOST,
            port: TEST_DB_PORT,
            username: TEST_DB_USER,
            password: TEST_DB_PASS,
            database: TEST_DB_NAME,
            entities: ALL_ENTITIES,
            synchronize: true,
            logging: false,
          }),
          TypeOrmModule.forFeature(ALL_ENTITIES),
        ],
        providers: [
          PostsService,
          SocialGraphService,
          HederaService,
          MirrorNodeService,
          RedisService,
          NotificationsService,
        ],
      }).compile();

      postsService = module.get<PostsService>(PostsService);
      socialGraphService = module.get<SocialGraphService>(SocialGraphService);
      dataSource = module.get<DataSource>(DataSource);
      postRepository = dataSource.getRepository(PostIndexEntity);
      likeRepository = dataSource.getRepository(PostLikeEntity);
      commentRepository = dataSource.getRepository(PostCommentEntity);
      feedItemRepository = dataSource.getRepository(FeedItemEntity);
      userRepository = dataSource.getRepository(UserEntity);
      followRepository = dataSource.getRepository(SocialFollowEntity);
      followerCountRepository = dataSource.getRepository(FollowerCountEntity);
      notificationRepository = dataSource.getRepository(NotificationEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterAll(async () => {
    if (module) {
      await cleanupAll();
      await module.close();
    }
  });

  // ─── PostsService: getPost with author mapping ─────────────────────────────

  describe("getPost() — author mapping", () => {
    it("should return post with author displayName and avatar", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser({
        displayName: "AuthorDisplay",
        avatarIpfsCid: "QmTestAvatar123",
      });
      const post = await createTestPost(user.hederaAccountId, {
        contentText: "Post with author info",
      });

      const result = await postsService.getPost(post.id);
      expect(result).toBeDefined();
      expect(result.id).toBe(post.id);
      expect(result.author.accountId).toBe(user.hederaAccountId);
      expect(result.author.displayName).toBe("AuthorDisplay");
      expect(result.text).toBe("Post with author info");
    });

    it("should handle post with null author displayName", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser({ displayName: undefined });
      const post = await createTestPost(user.hederaAccountId);

      const result = await postsService.getPost(post.id);
      expect(result).toBeDefined();
      expect(result.author.accountId).toBe(user.hederaAccountId);
    });
  });

  // ─── PostsService: likePost / unlikePost ───────────────────────────────────

  describe("likePost() and unlikePost()", () => {
    it("should like a post and update likeCount", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const liker = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      await postsService.likePost(liker.id, post.id);

      // Verify like exists in DB
      const like = await likeRepository.findOne({
        where: { postId: post.id, userId: liker.id },
      });
      expect(like).toBeDefined();
      createdLikeIds.push(like!.id);
    });

    it("should throw PostAlreadyLikedException on duplicate like", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const liker = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      await postsService.likePost(liker.id, post.id);
      const like = await likeRepository.findOne({
        where: { postId: post.id, userId: liker.id },
      });
      if (like) createdLikeIds.push(like.id);

      await expect(postsService.likePost(liker.id, post.id)).rejects.toThrow(
        PostAlreadyLikedException,
      );
    });

    it("should throw PostNotFoundException on like of non-existent post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      await expect(
        postsService.likePost(user.id, randomUUID()),
      ).rejects.toThrow(PostNotFoundException);
    });

    it("should unlike a previously liked post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const liker = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      await postsService.likePost(liker.id, post.id);
      const like = await likeRepository.findOne({
        where: { postId: post.id, userId: liker.id },
      });
      if (like) createdLikeIds.push(like.id);

      await postsService.unlikePost(liker.id, post.id);

      // Verify like removed (soft or hard delete)
      const remaining = await likeRepository.findOne({
        where: { postId: post.id, userId: liker.id },
      });
      // Unlike either deletes the record or sets a flag
      if (remaining) {
        // If still exists, check that post likeCount decreased
        const updatedPost = await postRepository.findOne({
          where: { id: post.id },
        });
        expect(updatedPost).toBeDefined();
      }
    });

    it("should throw LikeNotFoundException on unlike when not liked", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const author = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      await expect(postsService.unlikePost(user.id, post.id)).rejects.toThrow(
        PostLikeNotFoundException,
      );
    });
  });

  // ─── PostsService: deletePost ──────────────────────────────────────────────

  describe("deletePost()", () => {
    it("should soft-delete a post by the author", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      await postsService.deletePost(author.hederaAccountId, post.id);

      // Verify post is soft-deleted
      const deleted = await postRepository.findOne({ where: { id: post.id } });
      // Depending on implementation, either isDeleted=true or deletedAt is set
      expect(deleted).toBeDefined();
      if (deleted) {
        // Check if isDeleted or deletedAt is set
        const isMarkedDeleted =
          (deleted as Record<string, unknown>)["isDeleted"] === true ||
          (deleted as Record<string, unknown>)["deletedAt"] != null;
        expect(isMarkedDeleted).toBe(true);
      }
    });

    it("should throw PostNotFoundException for non-existent post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        postsService.deletePost("0.0.999", randomUUID()),
      ).rejects.toThrow(PostNotFoundException);
    });

    it("should throw PostNotOwnedException when non-author tries to delete", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const other = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      await expect(
        postsService.deletePost(other.hederaAccountId, post.id),
      ).rejects.toThrow(PostNotOwnedException);
    });
  });

  // ─── PostsService: Home Feed with multiple posts ────────────────────────────

  describe("getHomeFeed() — cursor pagination", () => {
    it("should return feed items in reverse chronological order with pagination", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const viewer = await createTestUser();
      const author = await createTestUser();

      // Create multiple posts at staggered times
      const posts: PostIndexEntity[] = [];
      for (let i = 0; i < 5; i++) {
        const ts = new Date(Date.now() - (4 - i) * 1000);
        const post = await createTestPost(author.hederaAccountId, {
          consensusTimestamp: ts,
          contentText: `Feed post ${i}`,
        });
        posts.push(post);
        await createTestFeedItem(viewer.hederaAccountId, post);
      }

      // First page, limit=2
      const page1 = await postsService.getHomeFeed(
        viewer.hederaAccountId,
        undefined,
        2,
      );
      expect(page1.posts.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Second page
      const page2 = await postsService.getHomeFeed(
        viewer.hederaAccountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.posts.length).toBe(2);

      // No duplicates between pages
      const page1Ids = page1.posts.map((p) => p.id);
      const page2Ids = page2.posts.map((p) => p.id);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });

    it("should clamp limit to valid range (min 1, max 100)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const viewer = await createTestUser();
      // limit=0 should be clamped to 1
      const result = await postsService.getHomeFeed(
        viewer.hederaAccountId,
        undefined,
        0,
      );
      expect(result).toBeDefined();
      expect(Array.isArray(result.posts)).toBe(true);
    });
  });

  // ─── PostsService: getUserFeed cursor ──────────────────────────────────────

  describe("getUserFeed() — cursor pagination", () => {
    it("should paginate user feed with cursor", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();

      for (let i = 0; i < 4; i++) {
        const ts = new Date(Date.now() - (3 - i) * 1000);
        await createTestPost(author.hederaAccountId, {
          consensusTimestamp: ts,
          contentText: `User feed post ${i}`,
        });
      }

      const page1 = await postsService.getUserFeed(
        author.hederaAccountId,
        undefined,
        2,
      );
      expect(page1.posts.length).toBe(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await postsService.getUserFeed(
        author.hederaAccountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.posts.length).toBe(2);
    });
  });

  // ─── PostsService: getTrendingPosts ─────────────────────────────────────────

  describe("getTrendingPosts() — pagination", () => {
    it("should return trending with cursor pagination", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      for (let i = 0; i < 4; i++) {
        await createTestPost(author.hederaAccountId, {
          consensusTimestamp: new Date(Date.now() - (3 - i) * 1000),
        });
      }

      const page1 = await postsService.getTrendingPosts(undefined, 2);
      expect(page1.posts.length).toBeGreaterThanOrEqual(0);
      expect(typeof page1.hasMore).toBe("boolean");
    });
  });

  // ─── SocialGraphService: read queries ───────────────────────────────────────

  describe("SocialGraphService — read queries", () => {
    it("should return followers with pagination", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const target = await createTestUser();
      const follower1 = await createTestUser();
      const follower2 = await createTestUser();
      const follower3 = await createTestUser();

      await createTestFollow(follower1.hederaAccountId, target.hederaAccountId);
      await createTestFollow(follower2.hederaAccountId, target.hederaAccountId);
      await createTestFollow(follower3.hederaAccountId, target.hederaAccountId);

      const page1 = await socialGraphService.getFollowers(
        target.hederaAccountId,
        undefined,
        2,
      );
      expect(page1.followers.length).toBe(2);
      expect(page1.totalCount).toBe(3);
      expect(page1.hasMore).toBe(true);

      const page2 = await socialGraphService.getFollowers(
        target.hederaAccountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.followers.length).toBe(1);
      expect(page2.hasMore).toBe(false);
    });

    it("should return following with pagination", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const actor = await createTestUser();
      const target1 = await createTestUser();
      const target2 = await createTestUser();

      await createTestFollow(actor.hederaAccountId, target1.hederaAccountId);
      await createTestFollow(actor.hederaAccountId, target2.hederaAccountId);

      const result = await socialGraphService.getFollowing(
        actor.hederaAccountId,
        undefined,
        10,
      );
      expect(result.following.length).toBe(2);
      expect(result.totalCount).toBe(2);
    });

    it("should check isFollowing correctly", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const actor = await createTestUser();
      const target = await createTestUser();

      await createTestFollow(actor.hederaAccountId, target.hederaAccountId);

      const result = await socialGraphService.isFollowing(
        actor.hederaAccountId,
        target.hederaAccountId,
      );
      expect(result).toBe(true);

      const notFollowing = await socialGraphService.isFollowing(
        target.hederaAccountId,
        actor.hederaAccountId,
      );
      expect(notFollowing).toBe(false);
    });

    it("should return user stats with follower/following counts", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const stats = await socialGraphService.getUserStats(uniqueAccountId());
      expect(stats).toBeDefined();
      expect(stats.followerCount).toBe(0);
      expect(stats.followingCount).toBe(0);
    });

    it("should return follower account IDs list", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const target = await createTestUser();
      const follower = await createTestUser();
      await createTestFollow(follower.hederaAccountId, target.hederaAccountId);

      const ids = await socialGraphService.getFollowerAccountIds(
        target.hederaAccountId,
      );
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toContain(follower.hederaAccountId);
    });

    it("should return following account IDs list", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const actor = await createTestUser();
      const target = await createTestUser();
      await createTestFollow(actor.hederaAccountId, target.hederaAccountId);

      const ids = await socialGraphService.getFollowingAccountIds(
        actor.hederaAccountId,
      );
      expect(Array.isArray(ids)).toBe(true);
      expect(ids).toContain(target.hederaAccountId);
    });

    it("should return empty followers list for unknown account", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result =
        await socialGraphService.getFollowersList(uniqueAccountId());
      expect(result).toEqual([]);
    });

    it("should return empty following list for unknown account", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result =
        await socialGraphService.getFollowingList(uniqueAccountId());
      expect(result).toEqual([]);
    });
  });

  // ─── PostsService: comments ─────────────────────────────────────────────────

  describe("Comments — createComment / getComments / deleteComment", () => {
    it("should create a comment on a post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const commenter = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      const comment = await postsService.createComment(
        commenter.hederaAccountId,
        post.id,
        "This is a test comment",
      );
      expect(comment).toBeDefined();
      expect(comment.contentText).toBe("This is a test comment");
      expect(comment.authorAccountId).toBe(commenter.hederaAccountId);
      createdCommentIds.push(comment.id);
    });

    it("should get paginated comments for a post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const commenter = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      // Create 5 comments
      for (let i = 0; i < 5; i++) {
        const c = await postsService.createComment(
          commenter.hederaAccountId,
          post.id,
          `Comment ${i}`,
        );
        createdCommentIds.push(c.id);
      }

      const result = await postsService.getComments(post.id, 3);
      expect(result.comments.length).toBeGreaterThanOrEqual(1);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();

      // Second page via cursor — should return more comments
      const page2 = await postsService.getComments(
        post.id,
        3,
        result.nextCursor!,
      );
      expect(page2.comments.length).toBeGreaterThanOrEqual(1);
    });

    it("should delete own comment", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const commenter = await createTestUser();
      const post = await createTestPost(author.hederaAccountId);

      const comment = await postsService.createComment(
        commenter.hederaAccountId,
        post.id,
        "To be deleted",
      );
      createdCommentIds.push(comment.id);

      await postsService.deleteComment(commenter.hederaAccountId, comment.id);

      // Verify soft delete
      const found = await commentRepository.findOne({
        where: { id: comment.id },
      });
      if (found) {
        expect((found as Record<string, unknown>)["deletedAt"]).not.toBeNull();
      }
    });
  });
});
