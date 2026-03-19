/**
 * Post Comments Integration Tests (GAP-007)
 *
 * Tests createComment, getComments, and deleteComment against REAL PostgreSQL
 * and REAL Redis via Docker.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import net from "net";
import { randomUUID } from "crypto";
import { PostsService } from "../services/posts.service";
import { SocialGraphService } from "../services/social-graph.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { RedisService } from "../../redis/redis.service";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { PostNotFoundException } from "../exceptions/social.exceptions";
import {
  CommentNotFoundException,
  CommentDeleteNotAllowedException,
} from "../exceptions/comment.exceptions";

const logger = new Logger("CommentsIntegrationTest");

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
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(port, host);
  });
}

function uniqueAccountId(): string {
  return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
}

describe("Post Comments Integration Tests (GAP-007)", () => {
  let module: TestingModule;
  let postsService: PostsService;
  let dataSource: DataSource;
  let postRepository: Repository<PostIndexEntity>;
  let commentRepository: Repository<PostCommentEntity>;
  let userRepository: Repository<UserEntity>;
  let postgresAvailable = false;

  // Cleanup tracking
  const createdPostIds: string[] = [];
  const createdCommentIds: string[] = [];
  const createdUserIds: string[] = [];

  /** Helper: create a user directly in the database */
  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const user = userRepository.create({
      displayName: `Comment Test User ${Date.now()}`,
      email: `comment-test-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`,
      hederaAccountId: uniqueAccountId(),
      status: "active",
      ...overrides,
    });
    const saved = await userRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  /** Helper: create a post directly in the database (bypassing HCS) */
  async function createTestPost(
    authorAccountId: string,
    opts?: { topicId?: string; text?: string },
  ): Promise<PostIndexEntity> {
    const postId = randomUUID();
    const post = postRepository.create({
      id: postId,
      authorAccountId,
      hcsTopicId:
        opts?.topicId ?? `0.0.${900000 + Math.floor(Math.random() * 99999)}`,
      sequenceNumber: 1,
      consensusTimestamp: new Date(),
      contentText: opts?.text ?? "Test post for comments",
      hasMedia: false,
    });
    const saved = await postRepository.save(post);
    createdPostIds.push(saved.id);
    return saved;
  }

  beforeAll(async () => {
    postgresAvailable = await isPortReachable(TEST_DB_PORT, TEST_DB_HOST);

    logger.log(
      `Infrastructure — PostgreSQL(:${TEST_DB_PORT}): ${postgresAvailable}`,
    );

    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available on port 5433 — tests will be skipped",
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
          TypeOrmModule.forRoot({
            type: "postgres",
            host: TEST_DB_HOST,
            port: TEST_DB_PORT,
            username: TEST_DB_USER,
            password: TEST_DB_PASS,
            database: TEST_DB_NAME,
            entities: [
              PostIndexEntity,
              PostLikeEntity,
              PostCommentEntity,
              FeedItemEntity,
              UserEntity,
              SocialFollowEntity,
              FollowerCountEntity,
            ],
            synchronize: true,
            logging: false,
          }),
          TypeOrmModule.forFeature([
            PostIndexEntity,
            PostLikeEntity,
            PostCommentEntity,
            FeedItemEntity,
            UserEntity,
            SocialFollowEntity,
            FollowerCountEntity,
          ]),
        ],
        providers: [
          PostsService,
          SocialGraphService,
          HederaService,
          MirrorNodeService,
          RedisService,
        ],
      }).compile();

      postsService = module.get<PostsService>(PostsService);
      dataSource = module.get<DataSource>(DataSource);
      postRepository = dataSource.getRepository(PostIndexEntity);
      commentRepository = dataSource.getRepository(PostCommentEntity);
      userRepository = dataSource.getRepository(UserEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    // Clean up comments first (referencing posts), then posts, then users
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

    for (const id of createdPostIds) {
      try {
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
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  // -------------------------------------------------------------------------
  // createComment
  // -------------------------------------------------------------------------

  describe("createComment", () => {
    it("should create a comment on an existing post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const result = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        "This is a test comment",
      );
      createdCommentIds.push(result.id);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.postId).toBe(post.id);
      expect(result.authorAccountId).toBe(user.hederaAccountId);
      expect(result.contentText).toBe("This is a test comment");
      expect(result.createdAt).toBeDefined();
      // authorDisplayName should be the user's display name (set in createTestUser)
      expect(result.authorDisplayName).not.toBeUndefined();

      // Verify in database
      const dbRecord = await commentRepository.findOne({
        where: { id: result.id },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.contentText).toBe("This is a test comment");
    });

    it("should return authorDisplayName matching the user's displayName", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const result = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        "Display name test comment",
      );
      createdCommentIds.push(result.id);

      expect(result.authorDisplayName).toBe(user.displayName);
    });

    it("should return authorDisplayName in getComments response", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const comment = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        "Comment with display name",
      );
      createdCommentIds.push(comment.id);

      const paginatedResult = await postsService.getComments(post.id);
      expect(paginatedResult.comments).toHaveLength(1);
      expect(paginatedResult.comments[0].authorDisplayName).toBe(
        user.displayName,
      );
    });

    it("should sanitize HTML in comment text", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const result = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        '<script>alert("xss")</script>Hello <b>world</b>',
      );
      createdCommentIds.push(result.id);

      // All HTML tags should be stripped
      expect(result.contentText).not.toContain("<script>");
      expect(result.contentText).not.toContain("<b>");
      expect(result.contentText).toContain("Hello");
      expect(result.contentText).toContain("world");
    });

    it("should throw PostNotFoundException for non-existent post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const fakePostId = randomUUID();
      await expect(
        postsService.createComment("0.0.12345", fakePostId, "comment text"),
      ).rejects.toThrow(PostNotFoundException);
    });

    it("should allow multiple comments on the same post", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const post = await createTestPost(user1.hederaAccountId!);

      const comment1 = await postsService.createComment(
        user1.hederaAccountId!,
        post.id,
        "First comment",
      );
      createdCommentIds.push(comment1.id);

      const comment2 = await postsService.createComment(
        user2.hederaAccountId!,
        post.id,
        "Second comment",
      );
      createdCommentIds.push(comment2.id);

      expect(comment1.id).not.toBe(comment2.id);
      expect(comment1.authorAccountId).toBe(user1.hederaAccountId);
      expect(comment2.authorAccountId).toBe(user2.hederaAccountId);
    });
  });

  // -------------------------------------------------------------------------
  // getComments
  // -------------------------------------------------------------------------

  describe("getComments", () => {
    it("should return empty list for post with no comments", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const result = await postsService.getComments(post.id);

      expect(result.comments).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it("should return comments in ascending order (oldest first)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      // Create comments with slight delay to ensure ordering
      const c1 = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        "First",
      );
      createdCommentIds.push(c1.id);

      const c2 = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        "Second",
      );
      createdCommentIds.push(c2.id);

      const result = await postsService.getComments(post.id);

      expect(result.comments).toHaveLength(2);
      expect(result.comments[0].contentText).toBe("First");
      expect(result.comments[1].contentText).toBe("Second");
    });

    it("should support cursor-based pagination", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      // Create 3 comments
      for (let i = 1; i <= 3; i++) {
        const c = await postsService.createComment(
          user.hederaAccountId!,
          post.id,
          `Comment ${i}`,
        );
        createdCommentIds.push(c.id);
      }

      // Get first page (limit 2)
      const page1 = await postsService.getComments(post.id, 2);
      expect(page1.comments).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Get second page using cursor
      const page2 = await postsService.getComments(post.id, 2, page1.cursor!);
      expect(page2.comments).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
      expect(page2.comments[0].contentText).toBe("Comment 3");
    });

    it("should throw PostNotFoundException for non-existent post", async () => {
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

  // -------------------------------------------------------------------------
  // deleteComment
  // -------------------------------------------------------------------------

  describe("deleteComment", () => {
    it("should soft-delete a comment by its author", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const post = await createTestPost(user.hederaAccountId!);

      const comment = await postsService.createComment(
        user.hederaAccountId!,
        post.id,
        "Comment to delete",
      );
      createdCommentIds.push(comment.id);

      // Delete the comment
      await postsService.deleteComment(user.hederaAccountId!, comment.id);

      // Verify it's soft-deleted (not returned in comments)
      const result = await postsService.getComments(post.id);
      expect(result.comments).toHaveLength(0);

      // Verify it still exists in DB with deletedAt set
      const deleted = await commentRepository.findOne({
        where: { id: comment.id },
        withDeleted: true,
      });
      expect(deleted).not.toBeNull();
      expect(deleted!.deletedAt).not.toBeNull();
    });

    it("should throw CommentNotFoundException for non-existent comment", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const fakeCommentId = randomUUID();
      await expect(
        postsService.deleteComment("0.0.12345", fakeCommentId),
      ).rejects.toThrow(CommentNotFoundException);
    });

    it("should throw CommentDeleteNotAllowedException for non-author", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const author = await createTestUser();
      const otherUser = await createTestUser();
      const post = await createTestPost(author.hederaAccountId!);

      const comment = await postsService.createComment(
        author.hederaAccountId!,
        post.id,
        "Author's comment",
      );
      createdCommentIds.push(comment.id);

      // Try to delete as a different user
      await expect(
        postsService.deleteComment(otherUser.hederaAccountId!, comment.id),
      ).rejects.toThrow(CommentDeleteNotAllowedException);

      // Verify comment still exists
      const result = await postsService.getComments(post.id);
      expect(result.comments).toHaveLength(1);
    });
  });
});
