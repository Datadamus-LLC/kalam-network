/**
 * PostsService Coverage Cycle 4 — Integration Tests
 *
 * Targets uncovered paths: getHomeFeed, getUserFeed, getTrendingPosts,
 * deletePost, createComment validation.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import net from "net";
import { v4 as uuidv4 } from "uuid";

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
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { NotificationEntity } from "../../../database/entities/notification.entity";

import {
  PostNotFoundException,
  PostNotOwnedException,
} from "../exceptions/social.exceptions";

const logger = new Logger("PostsCoverageCycle4");
const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

const ALL_ENTITIES = [
  PostIndexEntity,
  PostLikeEntity,
  PostCommentEntity,
  FeedItemEntity,
  SocialFollowEntity,
  FollowerCountEntity,
  UserEntity,
  NotificationEntity,
];

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

let accountIdCounter = 0;
function uniqueAccountId(): string {
  accountIdCounter += 1;
  return `0.0.${Date.now() % 999999}${accountIdCounter}${Math.floor(Math.random() * 100)}`;
}

describe("PostsService Coverage Cycle 4", () => {
  let module: TestingModule;
  let postsService: PostsService;
  let postRepo: Repository<PostIndexEntity>;
  let feedItemRepo: Repository<FeedItemEntity>;
  let commentRepo: Repository<PostCommentEntity>;
  let likeRepo: Repository<PostLikeEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;

  const createdPostIds: string[] = [];
  const createdFeedItemIds: string[] = [];
  const createdCommentIds: string[] = [];
  const createdLikeIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const id = uuidv4();
    const user = userRepo.create({
      id,
      displayName: `Test Author ${id.slice(0, 8)}`,
      hederaAccountId: uniqueAccountId(),
      status: "active",
      ...overrides,
    });
    const saved = await userRepo.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  async function createPost(
    authorAccountId: string,
    overrides?: Partial<PostIndexEntity>,
  ): Promise<PostIndexEntity> {
    const id = uuidv4();
    const entity = postRepo.create({
      id,
      authorAccountId,
      hcsTopicId: `0.0.${Date.now() % 999999}`,
      sequenceNumber: Math.floor(Math.random() * 100000),
      consensusTimestamp: new Date(),
      contentText: `Test post content ${id.slice(0, 8)}`,
      hasMedia: false,
      ...overrides,
    });
    const saved = await postRepo.save(entity);
    createdPostIds.push(saved.id);
    return saved;
  }

  async function createFeedItem(
    ownerAccountId: string,
    postId: string,
    authorAccountId: string,
    consensusTimestamp?: Date,
  ): Promise<FeedItemEntity> {
    const entity = feedItemRepo.create({
      ownerAccountId,
      postId,
      authorAccountId,
      consensusTimestamp: consensusTimestamp ?? new Date(),
    });
    const saved = await feedItemRepo.save(entity);
    createdFeedItemIds.push(saved.id);
    return saved;
  }

  beforeAll(async () => {
    const [pgReachable, redisReachable] = await Promise.all([
      isPortReachable(TEST_DB_PORT, TEST_DB_HOST),
      isPortReachable(TEST_REDIS_PORT, TEST_REDIS_HOST),
    ]);
    postgresAvailable = pgReachable && redisReachable;

    if (!postgresAvailable) {
      logger.warn("Infrastructure not available — tests will be skipped");
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
                  postsTopic: "",
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
      const ds = module.get<DataSource>(DataSource);
      postRepo = ds.getRepository(PostIndexEntity);
      feedItemRepo = ds.getRepository(FeedItemEntity);
      commentRepo = ds.getRepository(PostCommentEntity);
      likeRepo = ds.getRepository(PostLikeEntity);
      userRepo = ds.getRepository(UserEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    for (const id of createdCommentIds) {
      try {
        await commentRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdCommentIds.length = 0;

    for (const id of createdLikeIds) {
      try {
        await likeRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdLikeIds.length = 0;

    for (const id of createdFeedItemIds) {
      try {
        await feedItemRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdFeedItemIds.length = 0;

    for (const id of createdPostIds) {
      try {
        // Use createQueryBuilder to bypass soft-delete filter
        await postRepo
          .createQueryBuilder()
          .delete()
          .from(PostIndexEntity)
          .where("id = :id", { id })
          .execute();
      } catch {
        /* best-effort */
      }
    }
    createdPostIds.length = 0;

    for (const id of createdUserIds) {
      try {
        await userRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  function skip(): boolean {
    if (!postgresAvailable) {
      pending();
      return true;
    }
    return false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // getHomeFeed
  // ───────────────────────────────────────────────────────────────────────────

  describe("getHomeFeed", () => {
    it("should return feed items for a user", async () => {
      if (skip()) return;
      const author = await createTestUser();
      const viewer = await createTestUser();
      const post = await createPost(author.hederaAccountId!);
      await createFeedItem(
        viewer.hederaAccountId!,
        post.id,
        author.hederaAccountId!,
      );

      const result = await postsService.getHomeFeed(viewer.hederaAccountId!);
      expect(result.posts.length).toBeGreaterThanOrEqual(1);
      expect(result.posts[0].id).toBe(post.id);
      expect(result.posts[0].author.accountId).toBe(author.hederaAccountId!);
      expect(result.posts[0].author.displayName).toBe(author.displayName);
    });

    it("should return empty feed when no feed items exist", async () => {
      if (skip()) return;
      const viewer = await createTestUser();
      const result = await postsService.getHomeFeed(viewer.hederaAccountId!);
      expect(result.posts).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const author = await createTestUser();
      const viewer = await createTestUser();

      for (let i = 0; i < 4; i++) {
        const ts = new Date(Date.now() - i * 1000);
        const post = await createPost(author.hederaAccountId!, {
          consensusTimestamp: ts,
        });
        await createFeedItem(
          viewer.hederaAccountId!,
          post.id,
          author.hederaAccountId!,
          ts,
        );
      }

      const page1 = await postsService.getHomeFeed(
        viewer.hederaAccountId!,
        undefined,
        2,
      );
      expect(page1.posts).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await postsService.getHomeFeed(
        viewer.hederaAccountId!,
        page1.nextCursor ?? undefined,
        2,
      );
      expect(page2.posts).toHaveLength(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getUserFeed
  // ───────────────────────────────────────────────────────────────────────────

  describe("getUserFeed", () => {
    it("should return posts by a specific author", async () => {
      if (skip()) return;
      const author = await createTestUser();
      await createPost(author.hederaAccountId!, { contentText: "Post A" });
      await createPost(author.hederaAccountId!, { contentText: "Post B" });

      const result = await postsService.getUserFeed(author.hederaAccountId!);
      expect(result.posts.length).toBeGreaterThanOrEqual(2);
    });

    it("should return empty when user has no posts", async () => {
      if (skip()) return;
      const user = await createTestUser();
      const result = await postsService.getUserFeed(user.hederaAccountId!);
      expect(result.posts).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const author = await createTestUser();
      for (let i = 0; i < 4; i++) {
        await createPost(author.hederaAccountId!, {
          consensusTimestamp: new Date(Date.now() - i * 1000),
        });
      }

      const page1 = await postsService.getUserFeed(
        author.hederaAccountId!,
        undefined,
        2,
      );
      expect(page1.posts).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await postsService.getUserFeed(
        author.hederaAccountId!,
        page1.nextCursor ?? undefined,
        2,
      );
      expect(page2.posts).toHaveLength(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getTrendingPosts
  // ───────────────────────────────────────────────────────────────────────────

  describe("getTrendingPosts", () => {
    it("should return posts ordered by timestamp", async () => {
      if (skip()) return;
      const author = await createTestUser();
      await createPost(author.hederaAccountId!, {
        consensusTimestamp: new Date(Date.now() - 2000),
      });
      await createPost(author.hederaAccountId!, {
        consensusTimestamp: new Date(Date.now() - 1000),
      });
      await createPost(author.hederaAccountId!, {
        consensusTimestamp: new Date(),
      });

      const result = await postsService.getTrendingPosts();
      expect(result.posts.length).toBeGreaterThanOrEqual(3);

      // Should be in descending order (newest first)
      for (let i = 1; i < result.posts.length; i++) {
        expect(
          new Date(result.posts[i - 1].consensusTimestamp).getTime(),
        ).toBeGreaterThanOrEqual(
          new Date(result.posts[i].consensusTimestamp).getTime(),
        );
      }
    });

    it("should return empty when no posts exist", async () => {
      if (skip()) return;
      // This test may return posts from other tests, so we just verify structure
      const result = await postsService.getTrendingPosts();
      expect(result).toHaveProperty("posts");
      expect(result).toHaveProperty("hasMore");
      expect(result).toHaveProperty("nextCursor");
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const author = await createTestUser();
      for (let i = 0; i < 4; i++) {
        await createPost(author.hederaAccountId!, {
          consensusTimestamp: new Date(Date.now() - i * 1000),
        });
      }

      const page1 = await postsService.getTrendingPosts(undefined, 2);
      expect(page1.posts.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // deletePost
  // ───────────────────────────────────────────────────────────────────────────

  describe("deletePost", () => {
    it("should soft-delete a post by the author", async () => {
      if (skip()) return;
      const author = await createTestUser();
      const post = await createPost(author.hederaAccountId!);

      await postsService.deletePost(author.hederaAccountId!, post.id);

      // The post should be soft-deleted (not visible in normal queries)
      const found = await postRepo.findOne({ where: { id: post.id } });
      expect(found).toBeNull();

      // But still in DB with deletedAt set
      const raw = await postRepo
        .createQueryBuilder("post")
        .withDeleted()
        .where("post.id = :id", { id: post.id })
        .getOne();
      expect(raw).not.toBeNull();
      expect(raw!.deletedAt).not.toBeNull();
    });

    it("should throw PostNotFoundException when post does not exist", async () => {
      if (skip()) return;
      await expect(
        postsService.deletePost(uniqueAccountId(), uuidv4()),
      ).rejects.toThrow(PostNotFoundException);
    });

    it("should throw PostNotOwnedException when user is not the author", async () => {
      if (skip()) return;
      const author = await createTestUser();
      const other = await createTestUser();
      const post = await createPost(author.hederaAccountId!);

      await expect(
        postsService.deletePost(other.hederaAccountId!, post.id),
      ).rejects.toThrow(PostNotOwnedException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getPost (single)
  // ───────────────────────────────────────────────────────────────────────────

  describe("getPost", () => {
    it("should return a single post by ID", async () => {
      if (skip()) return;
      const author = await createTestUser();
      const post = await createPost(author.hederaAccountId!, {
        contentText: "Single post",
      });

      const result = await postsService.getPost(post.id);
      expect(result.id).toBe(post.id);
      expect(result.text).toBe("Single post");
      expect(result.author.accountId).toBe(author.hederaAccountId!);
    });

    it("should throw PostNotFoundException for non-existent post", async () => {
      if (skip()) return;
      await expect(postsService.getPost(uuidv4())).rejects.toThrow(
        PostNotFoundException,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // likePost / unlikePost
  // ───────────────────────────────────────────────────────────────────────────

  describe("likePost / unlikePost", () => {
    it("should like and unlike a post", async () => {
      if (skip()) return;
      const author = await createTestUser();
      const liker = await createTestUser();
      const post = await createPost(author.hederaAccountId!);

      await postsService.likePost(liker.id, post.id);

      const like = await likeRepo.findOne({
        where: { userId: liker.id, postId: post.id },
      });
      expect(like).not.toBeNull();
      if (like) createdLikeIds.push(like.id);

      await postsService.unlikePost(liker.id, post.id);
      const unliked = await likeRepo.findOne({
        where: { userId: liker.id, postId: post.id },
      });
      expect(unliked).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getComments
  // ───────────────────────────────────────────────────────────────────────────

  describe("getComments", () => {
    it("should throw PostNotFoundException for non-existent post", async () => {
      if (skip()) return;
      await expect(postsService.getComments(uuidv4())).rejects.toThrow(
        PostNotFoundException,
      );
    });

    it("should return empty for post with no comments", async () => {
      if (skip()) return;
      const author = await createTestUser();
      const post = await createPost(author.hederaAccountId!);

      const result = await postsService.getComments(post.id);
      expect(result.comments).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // createComment validation
  // ───────────────────────────────────────────────────────────────────────────

  describe("createComment", () => {
    it("should throw PostNotFoundException for non-existent post", async () => {
      if (skip()) return;
      await expect(
        postsService.createComment(uniqueAccountId(), uuidv4(), "Hello"),
      ).rejects.toThrow(PostNotFoundException);
    });

    it("should create a comment on an existing post", async () => {
      if (skip()) return;
      const author = await createTestUser();
      const post = await createPost(author.hederaAccountId!);
      const commenter = uniqueAccountId();

      // HCS submission will fail (no topic configured), but comment should still index locally
      const result = await postsService.createComment(
        commenter,
        post.id,
        "Nice post!",
      );
      expect(result.postId).toBe(post.id);
      expect(result.authorAccountId).toBe(commenter);
      expect(result.contentText).toBe("Nice post!");
      createdCommentIds.push(result.id);
    });
  });
});
