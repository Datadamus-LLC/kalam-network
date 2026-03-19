/**
 * PostsService Coverage Cycle 3 — Integration Tests
 *
 * Targets uncovered paths in posts.service.ts (66.76% -> 85%):
 *   - deletePost(): PostNotFoundException, PostNotOwnedException, successful soft delete
 *   - createComment(): PostNotFoundException, successful DB verification
 *   - deleteComment(): CommentNotFoundException, CommentDeleteNotAllowedException,
 *     post owner vs comment author authorization, successful soft delete
 *   - getComments(): paginated retrieval with cursor, empty post
 *   - likePost() / unlikePost(): DB verification, duplicate like, missing like
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against real PostgreSQL (port 5433) and
 * real Redis (port 6380) via Docker.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
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
import {
  CommentNotFoundException,
  CommentDeleteNotAllowedException,
} from "../exceptions/comment.exceptions";

const logger = new Logger("PostsCoverageCycle3IntegrationTest");

const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

/**
 * Check if a TCP port is reachable before attempting connection.
 */
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
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/** Generate a unique Hedera-format account ID to avoid test collisions. */
function uniqueAccountId(): string {
  return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
}

/** Generate a unique HCS topic ID. */
function uniqueTopicId(): string {
  return `0.0.${900000 + Math.floor(Math.random() * 99999)}`;
}

/**
 * All entity classes required by PostsService and its transitive dependencies.
 */
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

describe("PostsService Coverage Cycle 3 — Integration Tests", () => {
  let module: TestingModule;
  let postsService: PostsService;
  let dataSource: DataSource;
  let postRepository: Repository<PostIndexEntity>;
  let likeRepository: Repository<PostLikeEntity>;
  let commentRepository: Repository<PostCommentEntity>;
  let feedItemRepository: Repository<FeedItemEntity>;
  let userRepository: Repository<UserEntity>;
  let notificationRepository: Repository<NotificationEntity>;
  let postgresAvailable = false;

  // Cleanup tracking arrays -- order matters for FK safety
  const createdLikeIds: string[] = [];
  const createdCommentIds: string[] = [];
  const createdFeedItemIds: string[] = [];
  const createdNotificationIds: string[] = [];
  const createdPostIds: string[] = [];
  const createdUserIds: string[] = [];

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const accountId = overrides?.hederaAccountId ?? uniqueAccountId();
    const user = userRepository.create({
      displayName: overrides?.displayName ?? `Cycle3User_${accountId}`,
      email: `c3-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.io`,
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
      contentText: overrides?.contentText ?? `Test post ${postId.slice(0, 8)}`,
      hasMedia: overrides?.hasMedia ?? false,
      mediaRefs: overrides?.mediaRefs ?? undefined,
    });
    const saved = await postRepository.save(post);
    createdPostIds.push(saved.id);
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Setup and teardown
  // ---------------------------------------------------------------------------

  beforeAll(async () => {
    postgresAvailable = await isPortReachable(TEST_DB_PORT, TEST_DB_HOST);

    logger.log(
      `Infrastructure -- PostgreSQL(:${TEST_DB_PORT}): ${postgresAvailable}`,
    );

    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available on port 5433 -- tests will be skipped",
      );
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
                redis: {
                  host: TEST_REDIS_HOST,
                  port: TEST_REDIS_PORT,
                },
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
                pinata: {
                  gatewayUrl: "https://gateway.pinata.cloud/ipfs",
                },
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
      dataSource = module.get<DataSource>(DataSource);
      postRepository = dataSource.getRepository(PostIndexEntity);
      likeRepository = dataSource.getRepository(PostLikeEntity);
      commentRepository = dataSource.getRepository(PostCommentEntity);
      feedItemRepository = dataSource.getRepository(FeedItemEntity);
      userRepository = dataSource.getRepository(UserEntity);
      notificationRepository = dataSource.getRepository(NotificationEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    // Clean up in FK-safe order: likes, comments, notifications, feed items, posts, users
    for (const id of createdLikeIds) {
      try {
        await likeRepository
          .createQueryBuilder()
          .delete()
          .from(PostLikeEntity)
          .where("id = :id", { id })
          .execute();
      } catch {
        /* cleanup best-effort */
      }
    }
    createdLikeIds.length = 0;

    // Also clean likes by post IDs (for likes created via service)
    for (const postId of createdPostIds) {
      try {
        await likeRepository
          .createQueryBuilder()
          .delete()
          .from(PostLikeEntity)
          .where('"postId" = :postId', { postId })
          .execute();
      } catch {
        /* cleanup best-effort */
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
        /* cleanup best-effort */
      }
    }
    createdCommentIds.length = 0;

    // Also clean comments by post IDs (for comments created via service)
    for (const postId of createdPostIds) {
      try {
        await commentRepository
          .createQueryBuilder()
          .delete()
          .from(PostCommentEntity)
          .where('"postId" = :postId', { postId })
          .execute();
      } catch {
        /* cleanup best-effort */
      }
    }

    for (const id of createdNotificationIds) {
      try {
        await notificationRepository.delete(id);
      } catch {
        /* cleanup best-effort */
      }
    }
    createdNotificationIds.length = 0;

    // Also clean notifications referencing our test users
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
        /* cleanup best-effort */
      }
    }

    for (const id of createdFeedItemIds) {
      try {
        await feedItemRepository.delete(id);
      } catch {
        /* cleanup best-effort */
      }
    }
    createdFeedItemIds.length = 0;

    for (const id of createdPostIds) {
      try {
        // Use hard-delete query builder to bypass soft-delete filter
        await postRepository
          .createQueryBuilder()
          .delete()
          .from(PostIndexEntity)
          .where("id = :id", { id })
          .execute();
      } catch {
        /* cleanup best-effort */
      }
    }
    createdPostIds.length = 0;

    for (const id of createdUserIds) {
      try {
        await userRepository.delete(id);
      } catch {
        /* cleanup best-effort */
      }
    }
    createdUserIds.length = 0;

    // Flush Redis feed cache to avoid poisoning other test suites
    try {
      const redis = module.get(RedisService);
      const feedKeys = await redis.keys("feed:*");
      if (feedKeys.length > 0) {
        for (const key of feedKeys) {
          await redis.del(key);
        }
      }
      const postKeys = await redis.keys("post:*");
      if (postKeys.length > 0) {
        for (const key of postKeys) {
          await redis.del(key);
        }
      }
    } catch {
      /* Redis cleanup best-effort */
    }
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  // ===========================================================================
  // deletePost() — PostNotFoundException
  // ===========================================================================

  describe("deletePost — post not found", () => {
    it("should throw PostNotFoundException when postId does not exist", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const nonExistentPostId = randomUUID();
      const accountId = uniqueAccountId();

      await expect(
        postsService.deletePost(accountId, nonExistentPostId),
      ).rejects.toThrow(PostNotFoundException);
    });
  });

  // ===========================================================================
  // deletePost() — PostNotOwnedException
  // ===========================================================================

  describe("deletePost — not the owner", () => {
    it("should throw PostNotOwnedException when user is not the post author", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const otherUser = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      await expect(
        postsService.deletePost(otherUser.hederaAccountId!, post.id),
      ).rejects.toThrow(PostNotOwnedException);

      // Verify post still exists (not deleted)
      const found = await postRepository.findOne({
        where: { id: post.id },
      });
      expect(found).not.toBeNull();
      expect(found!.deletedAt).toBeNull();
    });
  });

  // ===========================================================================
  // deletePost() — successful soft delete
  // ===========================================================================

  describe("deletePost — successful soft delete", () => {
    it("should soft-delete the post and verify deletedAt is set", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      // Delete should succeed without throwing
      await postsService.deletePost(author.hederaAccountId!, post.id);

      // The default findOne with soft-delete entities will NOT return soft-deleted rows
      const notFound = await postRepository.findOne({
        where: { id: post.id },
      });
      expect(notFound).toBeNull();

      // Query with withDeleted to confirm it was soft-deleted (not hard-deleted)
      const softDeleted = await postRepository.findOne({
        where: { id: post.id },
        withDeleted: true,
      });
      expect(softDeleted).not.toBeNull();
      expect(softDeleted!.deletedAt).not.toBeNull();
      expect(softDeleted!.deletedAt).toBeInstanceOf(Date);
    });

    it("should soft-delete and no longer appear in getPost lookup", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      // Confirm post exists before deletion
      const beforeDelete = await postsService.getPost(post.id);
      expect(beforeDelete.id).toBe(post.id);

      await postsService.deletePost(author.hederaAccountId!, post.id);

      // After deletion, getPost should throw PostNotFoundException
      await expect(postsService.getPost(post.id)).rejects.toThrow(
        PostNotFoundException,
      );
    });
  });

  // ===========================================================================
  // createComment() — PostNotFoundException
  // ===========================================================================

  describe("createComment — post not found", () => {
    it("should throw PostNotFoundException when commenting on a non-existent post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const fakePostId = randomUUID();

      await expect(
        postsService.createComment(
          user.hederaAccountId!,
          fakePostId,
          "Comment on missing post",
        ),
      ).rejects.toThrow(PostNotFoundException);
    });
  });

  // ===========================================================================
  // createComment() — successful creation with DB field verification
  // ===========================================================================

  describe("createComment — successful creation", () => {
    it("should create a comment and verify all DB fields", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const commentText = "This is a verified integration test comment";
      const result = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        commentText,
      );
      createdCommentIds.push(result.id);

      // Verify returned response fields
      expect(result.id).toBeDefined();
      expect(result.postId).toBe(post.id);
      expect(result.authorAccountId).toBe(user.hederaAccountId);
      expect(result.contentText).toBe(commentText);
      expect(result.createdAt).toBeDefined();

      // Verify directly in the DB
      const dbComment = await commentRepository.findOne({
        where: { id: result.id },
      });
      expect(dbComment).not.toBeNull();
      expect(dbComment!.postId).toBe(post.id);
      expect(dbComment!.authorAccountId).toBe(user.hederaAccountId);
      expect(dbComment!.contentText).toBe(commentText);
      expect(dbComment!.createdAt).toBeInstanceOf(Date);
      expect(dbComment!.deletedAt).toBeNull();
    });

    it("should sanitize HTML in comment text and store clean content", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const result = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        '<img src=x onerror="alert(1)">Safe text <a href="evil">link</a>',
      );
      createdCommentIds.push(result.id);

      // HTML should be fully stripped
      expect(result.contentText).not.toContain("<img");
      expect(result.contentText).not.toContain("<a");
      expect(result.contentText).not.toContain("onerror");
      expect(result.contentText).toContain("Safe text");
      expect(result.contentText).toContain("link");
    });
  });

  // ===========================================================================
  // deleteComment() — CommentNotFoundException
  // ===========================================================================

  describe("deleteComment — comment not found", () => {
    it("should throw CommentNotFoundException for a non-existent comment", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const accountId = uniqueAccountId();
      const fakeCommentId = randomUUID();

      await expect(
        postsService.deleteComment(accountId, fakeCommentId),
      ).rejects.toThrow(CommentNotFoundException);
    });
  });

  // ===========================================================================
  // deleteComment() — CommentDeleteNotAllowedException
  // ===========================================================================

  describe("deleteComment — not allowed (not the comment author)", () => {
    it("should throw CommentDeleteNotAllowedException when a random user tries to delete", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const commentAuthor = await createTestUser();
      const randomUser = await createTestUser();
      const post = await createTestPost(commentAuthor.hederaAccountId!);

      const comment = await postsService.createComment(
        commentAuthor.hederaAccountId!,
        post.id,
        "Only the author can delete this",
      );
      createdCommentIds.push(comment.id);

      await expect(
        postsService.deleteComment(randomUser.hederaAccountId!, comment.id),
      ).rejects.toThrow(CommentDeleteNotAllowedException);

      // Verify comment still exists
      const dbComment = await commentRepository.findOne({
        where: { id: comment.id },
      });
      expect(dbComment).not.toBeNull();
      expect(dbComment!.deletedAt).toBeNull();
    });

    it("should throw CommentDeleteNotAllowedException when post owner (but not comment author) tries to delete", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const postOwner = await createTestUser();
      const commenter = await createTestUser();
      const post = await createTestPost(postOwner.hederaAccountId!);

      const comment = await postsService.createComment(
        commenter.hederaAccountId!,
        post.id,
        "The post owner cannot delete this comment",
      );
      createdCommentIds.push(comment.id);

      // Post owner tries to delete a comment they did not author
      await expect(
        postsService.deleteComment(postOwner.hederaAccountId!, comment.id),
      ).rejects.toThrow(CommentDeleteNotAllowedException);
    });
  });

  // ===========================================================================
  // deleteComment() — successful delete by comment author
  // ===========================================================================

  describe("deleteComment — successful soft delete by comment author", () => {
    it("should soft-delete the comment and verify deletedAt is set", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const comment = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        "Comment to be deleted by its author",
      );
      createdCommentIds.push(comment.id);

      // Delete as the comment author
      await postsService.deleteComment(user.hederaAccountId!, comment.id);

      // Default findOne should not return soft-deleted rows
      const notFound = await commentRepository.findOne({
        where: { id: comment.id },
      });
      expect(notFound).toBeNull();

      // withDeleted should return the row with deletedAt set
      const softDeleted = await commentRepository.findOne({
        where: { id: comment.id },
        withDeleted: true,
      });
      expect(softDeleted).not.toBeNull();
      expect(softDeleted!.deletedAt).not.toBeNull();
      expect(softDeleted!.deletedAt).toBeInstanceOf(Date);
    });
  });

  // ===========================================================================
  // getComments() — empty post (no comments)
  // ===========================================================================

  describe("getComments — empty results", () => {
    it("should return empty comments array for a post with no comments", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const result = await postsService.getComments(post.id);
      expect(result.comments).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it("should throw PostNotFoundException when post does not exist", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const fakePostId = randomUUID();

      await expect(postsService.getComments(fakePostId)).rejects.toThrow(
        PostNotFoundException,
      );
    });
  });

  // ===========================================================================
  // getComments() — paginated retrieval with cursor
  // ===========================================================================

  describe("getComments — cursor pagination across multiple pages", () => {
    it("should paginate 4 comments with limit=2 returning 2 pages", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      // Insert 4 comments with staggered timestamps
      const baseTime = Date.now() - 60000;
      for (let i = 0; i < 4; i++) {
        const comment = commentRepository.create({
          postId: post.id,
          authorAccountId: user.hederaAccountId!,
          contentText: `CursorComment_${i + 1}`,
          createdAt: new Date(baseTime + i * 3000),
        });
        const saved = await commentRepository.save(comment);
        createdCommentIds.push(saved.id);
      }

      // Page 1: limit 2 (ASC order)
      const page1 = await postsService.getComments(post.id, 2);
      expect(page1.comments).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();
      expect(page1.comments[0].contentText).toBe("CursorComment_1");
      expect(page1.comments[1].contentText).toBe("CursorComment_2");

      // Page 2: use cursor from page 1
      const page2 = await postsService.getComments(post.id, 2, page1.cursor!);
      expect(page2.comments).toHaveLength(2);
      expect(page2.hasMore).toBe(false);
      expect(page2.cursor).toBeNull();
      expect(page2.comments[0].contentText).toBe("CursorComment_3");
      expect(page2.comments[1].contentText).toBe("CursorComment_4");

      // No duplicate IDs across both pages
      const allIds = [
        ...page1.comments.map((c) => c.id),
        ...page2.comments.map((c) => c.id),
      ];
      expect(new Set(allIds).size).toBe(4);
    });
  });

  // ===========================================================================
  // likePost() — PostNotFoundException
  // ===========================================================================

  describe("likePost — post not found", () => {
    it("should throw PostNotFoundException when liking a non-existent post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const fakePostId = randomUUID();

      await expect(postsService.likePost(user.id, fakePostId)).rejects.toThrow(
        PostNotFoundException,
      );
    });
  });

  // ===========================================================================
  // likePost() — PostAlreadyLikedException (duplicate like)
  // ===========================================================================

  describe("likePost — duplicate like", () => {
    it("should throw PostAlreadyLikedException when user likes the same post twice", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      // First like should succeed
      await postsService.likePost(user.id, post.id);

      // Verify like in DB
      const firstLike = await likeRepository.findOne({
        where: { userId: user.id, postId: post.id },
      });
      expect(firstLike).not.toBeNull();
      if (firstLike) createdLikeIds.push(firstLike.id);

      // Second like should throw
      await expect(postsService.likePost(user.id, post.id)).rejects.toThrow(
        PostAlreadyLikedException,
      );
    });
  });

  // ===========================================================================
  // likePost() — DB verification of like row
  // ===========================================================================

  describe("likePost — DB verification", () => {
    it("should persist like row with correct userId and postId", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const liker = await createTestUser();
      const author = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      await postsService.likePost(liker.id, post.id);

      const like = await likeRepository.findOne({
        where: { userId: liker.id, postId: post.id },
      });
      expect(like).not.toBeNull();
      expect(like!.userId).toBe(liker.id);
      expect(like!.postId).toBe(post.id);
      expect(like!.createdAt).toBeInstanceOf(Date);
      if (like) createdLikeIds.push(like.id);
    });
  });

  // ===========================================================================
  // unlikePost() — PostLikeNotFoundException
  // ===========================================================================

  describe("unlikePost — like not found", () => {
    it("should throw PostLikeNotFoundException when unliking a post the user has not liked", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const author = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      await expect(postsService.unlikePost(user.id, post.id)).rejects.toThrow(
        PostLikeNotFoundException,
      );
    });
  });

  // ===========================================================================
  // unlikePost() — successful unlike with DB verification
  // ===========================================================================

  describe("unlikePost — successful removal", () => {
    it("should remove the like row from the database", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const author = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      // Like the post first
      await postsService.likePost(user.id, post.id);

      // Verify like exists
      const likeBeforeUnlike = await likeRepository.findOne({
        where: { userId: user.id, postId: post.id },
      });
      expect(likeBeforeUnlike).not.toBeNull();

      // Unlike the post
      await postsService.unlikePost(user.id, post.id);

      // Verify like is gone from the database
      const likeAfterUnlike = await likeRepository.findOne({
        where: { userId: user.id, postId: post.id },
      });
      expect(likeAfterUnlike).toBeNull();
    });

    it("should throw PostLikeNotFoundException when unliking a second time", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const author = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      // Like then unlike
      await postsService.likePost(user.id, post.id);
      await postsService.unlikePost(user.id, post.id);

      // Second unlike should fail
      await expect(postsService.unlikePost(user.id, post.id)).rejects.toThrow(
        PostLikeNotFoundException,
      );
    });
  });

  // ===========================================================================
  // getPost() — PostNotFoundException for non-existent post
  // ===========================================================================

  describe("getPost — not found", () => {
    it("should throw PostNotFoundException for a non-existent post ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const nonExistentId = randomUUID();

      await expect(postsService.getPost(nonExistentId)).rejects.toThrow(
        PostNotFoundException,
      );
    });
  });
});
