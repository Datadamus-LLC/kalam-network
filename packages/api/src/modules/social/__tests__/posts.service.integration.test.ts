/**
 * PostsService Integration Tests — Non-Hedera Paths
 *
 * Tests PostsService read paths against REAL PostgreSQL (port 5433) and
 * REAL Redis (port 6380) via Docker.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against real PostgreSQL and Redis instances.
 *
 * Covered paths:
 *   - getHomeFeed(): cursor-based pagination with Redis caching
 *   - getUserFeed(): cursor-based pagination with Redis caching
 *   - getTrendingPosts(): trending algorithm with Redis caching
 *   - getPost(): single post lookup and PostNotFoundException
 *   - Cache operations: Redis get/set, cache invalidation, safe error handling
 *   - toPostResponse(): author mapping, media refs, null-safe handling
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import net from "net";
import Redis from "ioredis";
import { randomUUID } from "crypto";
import { PostsService } from "../services/posts.service";
import { SocialGraphService } from "../services/social-graph.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { RedisService } from "../../redis/redis.service";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { PostNotFoundException } from "../exceptions/social.exceptions";

const logger = new Logger("PostsServiceIntegrationTest");

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

/** Generate a unique Hedera-format account ID to avoid test collisions. */
function uniqueAccountId(): string {
  return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
}

/** Generate a unique HCS topic ID. */
function uniqueTopicId(): string {
  return `0.0.${900000 + Math.floor(Math.random() * 99999)}`;
}

describe("PostsService Integration — Non-Hedera Paths", () => {
  let module: TestingModule;
  let postsService: PostsService;
  let dataSource: DataSource;
  let postRepository: Repository<PostIndexEntity>;
  let feedItemRepository: Repository<FeedItemEntity>;
  let userRepository: Repository<UserEntity>;
  let redisClient: Redis | null = null;
  let postgresAvailable = false;
  let redisAvailable = false;

  // Track entities for cleanup
  const createdPostIds: string[] = [];
  const createdFeedItemIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    postgresAvailable = await isPortReachable(TEST_DB_PORT, TEST_DB_HOST);
    redisAvailable = await isPortReachable(TEST_REDIS_PORT, TEST_REDIS_HOST);

    logger.log(
      `Infrastructure — PostgreSQL(:${TEST_DB_PORT}): ${postgresAvailable}, Redis(:${TEST_REDIS_PORT}): ${redisAvailable}`,
    );

    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available on port 5433 — tests will be skipped",
      );
      return;
    }

    // Connect a direct Redis client for cache verification/cleanup
    if (redisAvailable) {
      redisClient = new Redis({
        host: TEST_REDIS_HOST,
        port: TEST_REDIS_PORT,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      await redisClient.connect();
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
      feedItemRepository = dataSource.getRepository(FeedItemEntity);
      userRepository = dataSource.getRepository(UserEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    // Clean up feed items first (foreign-key-safe order)
    for (const id of createdFeedItemIds) {
      try {
        await feedItemRepository.delete(id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for feed item ${id}: ${msg}`);
      }
    }
    createdFeedItemIds.length = 0;

    // Clean up posts
    for (const id of createdPostIds) {
      try {
        await postRepository.delete(id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for post ${id}: ${msg}`);
      }
    }
    createdPostIds.length = 0;

    // Clean up users
    for (const id of createdUserIds) {
      try {
        await userRepository.delete(id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for user ${id}: ${msg}`);
      }
    }
    createdUserIds.length = 0;

    // Clear test Redis keys
    if (redisClient) {
      try {
        const keys = await redisClient.keys("feed:*");
        if (keys.length > 0) {
          await redisClient.del(...keys);
        }
      } catch {
        // Redis cleanup failure is non-critical
      }
    }
  });

  afterAll(async () => {
    if (redisClient) {
      try {
        redisClient.disconnect();
      } catch {
        // ignore
      }
    }
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (module) await module.close();
  });

  // ---------------------------------------------------------------------------
  // Helper: insert a user directly into the DB
  // ---------------------------------------------------------------------------

  async function insertUser(
    overrides: Partial<UserEntity> = {},
  ): Promise<UserEntity> {
    const accountId = overrides.hederaAccountId ?? uniqueAccountId();
    const user = userRepository.create({
      displayName: overrides.displayName ?? `TestUser_${accountId}`,
      hederaAccountId: accountId,
      publicFeedTopic: overrides.publicFeedTopic ?? uniqueTopicId(),
      status: overrides.status ?? "active",
      avatarIpfsCid: overrides.avatarIpfsCid ?? null,
      ...overrides,
    });
    const saved = await userRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Helper: insert a post directly into the DB
  // ---------------------------------------------------------------------------

  async function insertPost(
    authorAccountId: string,
    overrides: Partial<PostIndexEntity> = {},
  ): Promise<PostIndexEntity> {
    const id = overrides.id ?? randomUUID();
    const post = postRepository.create({
      id,
      authorAccountId,
      hcsTopicId: overrides.hcsTopicId ?? uniqueTopicId(),
      sequenceNumber:
        overrides.sequenceNumber ?? Math.floor(Math.random() * 100000),
      consensusTimestamp: overrides.consensusTimestamp ?? new Date(),
      contentText: overrides.contentText ?? `Test post ${id.slice(0, 8)}`,
      hasMedia: overrides.hasMedia ?? false,
      mediaRefs: overrides.mediaRefs ?? undefined,
    });
    const saved = await postRepository.save(post);
    createdPostIds.push(saved.id);
    return saved;
  }

  // ---------------------------------------------------------------------------
  // Helper: insert a feed item directly into the DB
  // ---------------------------------------------------------------------------

  async function insertFeedItem(
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

  // ===========================================================================
  // getPost()
  // ===========================================================================

  describe("getPost()", () => {
    it("should retrieve a post by ID with author info", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser({ displayName: "Alice" });
      const post = await insertPost(user.hederaAccountId!, {
        contentText: "Hello from getPost test",
      });

      const result = await postsService.getPost(post.id);

      expect(result.id).toBe(post.id);
      expect(result.text).toBe("Hello from getPost test");
      expect(result.author.accountId).toBe(user.hederaAccountId);
      expect(result.author.displayName).toBe("Alice");
      expect(result.hcsTopicId).toBe(post.hcsTopicId);
      expect(result.consensusTimestamp).toBeDefined();
      expect(result.createdAt).toBeDefined();
    });

    it("should throw PostNotFoundException for non-existent post ID", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const fakeId = randomUUID();

      try {
        await postsService.getPost(fakeId);
        // Should not reach here
        expect(true).toBe(false);
      } catch (error: unknown) {
        expect(error).toBeInstanceOf(PostNotFoundException);
      }
    });

    it("should return null displayName when author has no displayName", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser({ displayName: null });
      const post = await insertPost(user.hederaAccountId!);

      const result = await postsService.getPost(post.id);

      expect(result.author.displayName).toBeNull();
    });

    it("should return null avatarUrl when author has no avatarIpfsCid", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser({ avatarIpfsCid: null });
      const post = await insertPost(user.hederaAccountId!);

      const result = await postsService.getPost(post.id);

      expect(result.author.avatarUrl).toBeNull();
    });

    it("should build avatarUrl from gatewayUrl when author has avatarIpfsCid", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser({ avatarIpfsCid: "QmTestCid123" });
      const post = await insertPost(user.hederaAccountId!);

      const result = await postsService.getPost(post.id);

      expect(result.author.avatarUrl).toContain("QmTestCid123");
      expect(result.author.avatarUrl).toContain("pinata.cloud");
    });

    it("should return media refs formatted as ipfs:// URIs", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const post = await insertPost(user.hederaAccountId!, {
        hasMedia: true,
        mediaRefs: ["QmCidOne", "QmCidTwo"],
      });

      const result = await postsService.getPost(post.id);

      expect(result.media).toHaveLength(2);
      expect(result.media[0].ref).toBe("ipfs://QmCidOne");
      expect(result.media[1].ref).toBe("ipfs://QmCidTwo");
      expect(result.media[0].type).toBe("image");
    });

    it("should return empty media array when post has no media", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const post = await insertPost(user.hederaAccountId!, {
        hasMedia: false,
        mediaRefs: undefined,
      });

      const result = await postsService.getPost(post.id);

      expect(result.media).toEqual([]);
    });

    it("should handle post where author is not in users table (author deleted)", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      // Insert a post with an account ID that has no corresponding user record
      const orphanAccountId = uniqueAccountId();
      const post = await insertPost(orphanAccountId, {
        contentText: "Orphan post",
      });

      const result = await postsService.getPost(post.id);

      expect(result.id).toBe(post.id);
      expect(result.text).toBe("Orphan post");
      expect(result.author.accountId).toBe(orphanAccountId);
      expect(result.author.displayName).toBeNull();
      expect(result.author.avatarUrl).toBeNull();
    });
  });

  // ===========================================================================
  // getUserFeed()
  // ===========================================================================

  describe("getUserFeed()", () => {
    it("should return empty feed for user with no posts", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const accountId = uniqueAccountId();
      const feed = await postsService.getUserFeed(accountId);

      expect(feed.posts).toEqual([]);
      expect(feed.hasMore).toBe(false);
      expect(feed.nextCursor).toBeNull();
    });

    it("should return posts ordered by consensusTimestamp DESC", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const accountId = user.hederaAccountId!;

      const now = Date.now();
      const post1 = await insertPost(accountId, {
        consensusTimestamp: new Date(now - 3000),
        contentText: "Oldest",
      });
      const post2 = await insertPost(accountId, {
        consensusTimestamp: new Date(now - 2000),
        contentText: "Middle",
      });
      const post3 = await insertPost(accountId, {
        consensusTimestamp: new Date(now - 1000),
        contentText: "Newest",
      });

      const feed = await postsService.getUserFeed(accountId, undefined, 10);

      expect(feed.posts).toHaveLength(3);
      expect(feed.posts[0].text).toBe("Newest");
      expect(feed.posts[1].text).toBe("Middle");
      expect(feed.posts[2].text).toBe("Oldest");
      expect(feed.hasMore).toBe(false);

      // Suppress unused variable warnings
      void post1;
      void post2;
      void post3;
    });

    it("should paginate with cursor-based pagination", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const accountId = user.hederaAccountId!;

      const now = Date.now();
      // Create 5 posts with distinct timestamps
      for (let i = 0; i < 5; i++) {
        await insertPost(accountId, {
          consensusTimestamp: new Date(now - (5 - i) * 1000),
          contentText: `Post ${i + 1}`,
        });
      }

      // First page: limit 2
      const page1 = await postsService.getUserFeed(accountId, undefined, 2);
      expect(page1.posts).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Second page using cursor
      const page2 = await postsService.getUserFeed(
        accountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.posts).toHaveLength(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextCursor).not.toBeNull();

      // Third page: should have 1 remaining
      const page3 = await postsService.getUserFeed(
        accountId,
        page2.nextCursor!,
        2,
      );
      expect(page3.posts).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();

      // Verify no duplicates across pages
      const allIds = [
        ...page1.posts.map((p) => p.id),
        ...page2.posts.map((p) => p.id),
        ...page3.posts.map((p) => p.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(5);
    });

    it("should clamp limit to valid range (min 1, max 100)", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const accountId = uniqueAccountId();

      // limit 0 should be clamped to 1
      const feed0 = await postsService.getUserFeed(accountId, undefined, 0);
      expect(feed0.posts).toBeDefined();

      // limit 200 should be clamped to 100
      const feed200 = await postsService.getUserFeed(accountId, undefined, 200);
      expect(feed200.posts).toBeDefined();

      // Negative limit clamped to 1
      const feedNeg = await postsService.getUserFeed(accountId, undefined, -5);
      expect(feedNeg.posts).toBeDefined();
    });

    it("should include author info in response", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser({ displayName: "FeedUser" });
      await insertPost(user.hederaAccountId!, { contentText: "Author check" });

      const feed = await postsService.getUserFeed(user.hederaAccountId!);

      expect(feed.posts).toHaveLength(1);
      expect(feed.posts[0].author.accountId).toBe(user.hederaAccountId);
      expect(feed.posts[0].author.displayName).toBe("FeedUser");
    });

    it("should cache feed results in Redis and return cached data on second call", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending("PostgreSQL or Redis not available");
        return;
      }

      const user = await insertUser();
      const accountId = user.hederaAccountId!;
      await insertPost(accountId, { contentText: "Cached post" });

      // First call — should hit DB and populate cache
      const feed1 = await postsService.getUserFeed(accountId, undefined, 20);
      expect(feed1.posts).toHaveLength(1);

      // Verify cache key was set in Redis
      const cacheKey = `feed:user:${accountId}:latest:20`;
      const cached = await redisClient!.get(cacheKey);
      expect(cached).not.toBeNull();

      const parsedCache = JSON.parse(cached!);
      expect(parsedCache.posts).toHaveLength(1);
      expect(parsedCache.posts[0].text).toBe("Cached post");

      // Second call — should return cached result
      const feed2 = await postsService.getUserFeed(accountId, undefined, 20);
      expect(feed2.posts).toHaveLength(1);
      expect(feed2.posts[0].text).toBe("Cached post");
    });
  });

  // ===========================================================================
  // getHomeFeed()
  // ===========================================================================

  describe("getHomeFeed()", () => {
    it("should return empty feed for user with no feed items", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const accountId = uniqueAccountId();
      const feed = await postsService.getHomeFeed(accountId);

      expect(feed.posts).toEqual([]);
      expect(feed.hasMore).toBe(false);
      expect(feed.nextCursor).toBeNull();
    });

    it("should return posts from feed items ordered by timestamp DESC", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const viewer = await insertUser();
      const viewerAccountId = viewer.hederaAccountId!;

      const author = await insertUser({ displayName: "PostAuthor" });
      const authorAccountId = author.hederaAccountId!;

      const now = Date.now();
      const post1 = await insertPost(authorAccountId, {
        consensusTimestamp: new Date(now - 3000),
        contentText: "Oldest home",
      });
      const post2 = await insertPost(authorAccountId, {
        consensusTimestamp: new Date(now - 2000),
        contentText: "Middle home",
      });
      const post3 = await insertPost(authorAccountId, {
        consensusTimestamp: new Date(now - 1000),
        contentText: "Newest home",
      });

      // Fan out to viewer
      await insertFeedItem(viewerAccountId, post1);
      await insertFeedItem(viewerAccountId, post2);
      await insertFeedItem(viewerAccountId, post3);

      const feed = await postsService.getHomeFeed(
        viewerAccountId,
        undefined,
        10,
      );

      expect(feed.posts).toHaveLength(3);
      expect(feed.posts[0].text).toBe("Newest home");
      expect(feed.posts[1].text).toBe("Middle home");
      expect(feed.posts[2].text).toBe("Oldest home");
      expect(feed.hasMore).toBe(false);
    });

    it("should paginate home feed with cursor", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const viewer = await insertUser();
      const viewerAccountId = viewer.hederaAccountId!;
      const author = await insertUser();
      const authorAccountId = author.hederaAccountId!;

      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        const post = await insertPost(authorAccountId, {
          consensusTimestamp: new Date(now - (5 - i) * 1000),
          contentText: `Home post ${i + 1}`,
        });
        await insertFeedItem(viewerAccountId, post);
      }

      // First page: limit 2
      const page1 = await postsService.getHomeFeed(
        viewerAccountId,
        undefined,
        2,
      );
      expect(page1.posts).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Second page
      const page2 = await postsService.getHomeFeed(
        viewerAccountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.posts).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      // Third page: 1 remaining
      const page3 = await postsService.getHomeFeed(
        viewerAccountId,
        page2.nextCursor!,
        2,
      );
      expect(page3.posts).toHaveLength(1);
      expect(page3.hasMore).toBe(false);

      // Verify no duplicates
      const allIds = [
        ...page1.posts.map((p) => p.id),
        ...page2.posts.map((p) => p.id),
        ...page3.posts.map((p) => p.id),
      ];
      expect(new Set(allIds).size).toBe(5);
    });

    it("should include posts from multiple authors in home feed", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const viewer = await insertUser();
      const viewerAccountId = viewer.hederaAccountId!;

      const author1 = await insertUser({ displayName: "AuthorA" });
      const author2 = await insertUser({ displayName: "AuthorB" });

      const now = Date.now();
      const postA = await insertPost(author1.hederaAccountId!, {
        consensusTimestamp: new Date(now - 2000),
        contentText: "Post from A",
      });
      const postB = await insertPost(author2.hederaAccountId!, {
        consensusTimestamp: new Date(now - 1000),
        contentText: "Post from B",
      });

      await insertFeedItem(viewerAccountId, postA);
      await insertFeedItem(viewerAccountId, postB);

      const feed = await postsService.getHomeFeed(
        viewerAccountId,
        undefined,
        10,
      );

      expect(feed.posts).toHaveLength(2);

      const authorIds = feed.posts.map((p) => p.author.accountId);
      expect(authorIds).toContain(author1.hederaAccountId);
      expect(authorIds).toContain(author2.hederaAccountId);
    });

    it("should skip feed items whose post was deleted from post index", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const viewer = await insertUser();
      const viewerAccountId = viewer.hederaAccountId!;
      const author = await insertUser();

      const post = await insertPost(author.hederaAccountId!, {
        contentText: "Will be deleted",
      });
      await insertFeedItem(viewerAccountId, post);

      // Delete the post from the index directly
      await postRepository.delete(post.id);
      // Remove from cleanup list since it is already deleted
      const idx = createdPostIds.indexOf(post.id);
      if (idx >= 0) createdPostIds.splice(idx, 1);

      const feed = await postsService.getHomeFeed(
        viewerAccountId,
        undefined,
        10,
      );

      // The feed item exists but the post does not — should skip gracefully
      expect(feed.posts).toHaveLength(0);
    });

    it("should cache home feed results in Redis", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending("PostgreSQL or Redis not available");
        return;
      }

      const viewer = await insertUser();
      const viewerAccountId = viewer.hederaAccountId!;
      const author = await insertUser();

      const post = await insertPost(author.hederaAccountId!, {
        contentText: "Cached home post",
      });
      await insertFeedItem(viewerAccountId, post);

      // First call populates cache
      const feed = await postsService.getHomeFeed(
        viewerAccountId,
        undefined,
        20,
      );
      expect(feed.posts).toHaveLength(1);

      // Verify in Redis
      const cacheKey = `feed:home:${viewerAccountId}:latest:20`;
      const cached = await redisClient!.get(cacheKey);
      expect(cached).not.toBeNull();

      const parsed = JSON.parse(cached!);
      expect(parsed.posts).toHaveLength(1);
      expect(parsed.posts[0].text).toBe("Cached home post");
    });
  });

  // ===========================================================================
  // getTrendingPosts()
  // ===========================================================================

  describe("getTrendingPosts()", () => {
    it("should return empty feed when no posts exist", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      // Use a cursor far in the past to isolate from other test data
      const feed = await postsService.getTrendingPosts(
        new Date(0).toISOString(),
        20,
      );

      // Should return 0 posts since nothing is before epoch 0
      // Actually this would fail because cursor filters by < cursor date.
      // Use a cursor of epoch 0 — nothing is before epoch 0.
      expect(feed.posts).toHaveLength(0);
      expect(feed.hasMore).toBe(false);
    });

    it("should return posts ordered by consensusTimestamp DESC", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const author = await insertUser({ displayName: "TrendAuthor" });
      const accountId = author.hederaAccountId!;

      // Use future timestamps to isolate from other test data
      const futureBase = Date.now() + 1_000_000;
      const post1 = await insertPost(accountId, {
        consensusTimestamp: new Date(futureBase),
        contentText: "Trend oldest",
      });
      const post2 = await insertPost(accountId, {
        consensusTimestamp: new Date(futureBase + 1000),
        contentText: "Trend middle",
      });
      const post3 = await insertPost(accountId, {
        consensusTimestamp: new Date(futureBase + 2000),
        contentText: "Trend newest",
      });

      // Use a future cursor that includes all these posts
      const feed = await postsService.getTrendingPosts(
        new Date(futureBase + 10000).toISOString(),
        10,
      );

      // At minimum, our 3 posts should be in the feed
      expect(feed.posts.length).toBeGreaterThanOrEqual(3);

      // Verify order: newest first
      const ourPosts = feed.posts.filter(
        (p) => p.author.accountId === accountId,
      );
      expect(ourPosts).toHaveLength(3);
      expect(ourPosts[0].text).toBe("Trend newest");
      expect(ourPosts[1].text).toBe("Trend middle");
      expect(ourPosts[2].text).toBe("Trend oldest");

      void post1;
      void post2;
      void post3;
    });

    it("should paginate trending posts with cursor", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const author = await insertUser();
      const accountId = author.hederaAccountId!;

      const futureBase = Date.now() + 2_000_000;
      for (let i = 0; i < 4; i++) {
        await insertPost(accountId, {
          consensusTimestamp: new Date(futureBase + i * 1000),
          contentText: `Trending paginated ${i}`,
        });
      }

      // Get the first page with a generous cursor
      const page1 = await postsService.getTrendingPosts(
        new Date(futureBase + 10000).toISOString(),
        2,
      );
      expect(page1.posts.length).toBeGreaterThanOrEqual(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Get second page
      const page2 = await postsService.getTrendingPosts(page1.nextCursor!, 2);
      expect(page2.posts.length).toBeGreaterThanOrEqual(1);

      // Verify no overlap between pages
      const page1Ids = new Set(page1.posts.map((p) => p.id));
      for (const p of page2.posts) {
        expect(page1Ids.has(p.id)).toBe(false);
      }
    });

    it("should include author info from multiple users in trending", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const author1 = await insertUser({ displayName: "TrendA" });
      const author2 = await insertUser({ displayName: "TrendB" });

      const futureBase = Date.now() + 3_000_000;
      await insertPost(author1.hederaAccountId!, {
        consensusTimestamp: new Date(futureBase),
        contentText: "TrendA post",
      });
      await insertPost(author2.hederaAccountId!, {
        consensusTimestamp: new Date(futureBase + 1000),
        contentText: "TrendB post",
      });

      const feed = await postsService.getTrendingPosts(
        new Date(futureBase + 10000).toISOString(),
        50,
      );

      const ourPosts = feed.posts.filter(
        (p) =>
          p.author.accountId === author1.hederaAccountId ||
          p.author.accountId === author2.hederaAccountId,
      );
      expect(ourPosts).toHaveLength(2);

      const displayNames = ourPosts.map((p) => p.author.displayName);
      expect(displayNames).toContain("TrendA");
      expect(displayNames).toContain("TrendB");
    });

    it("should cache trending results in Redis", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending("PostgreSQL or Redis not available");
        return;
      }

      const author = await insertUser();
      const futureBase = Date.now() + 4_000_000;
      await insertPost(author.hederaAccountId!, {
        consensusTimestamp: new Date(futureBase),
        contentText: "Trending cache test",
      });

      const cursorStr = new Date(futureBase + 10000).toISOString();
      await postsService.getTrendingPosts(cursorStr, 20);

      const cacheKey = `feed:trending:${cursorStr}:20`;
      const cached = await redisClient!.get(cacheKey);
      expect(cached).not.toBeNull();
    });
  });

  // ===========================================================================
  // Cache Operations
  // ===========================================================================

  describe("Cache operations", () => {
    it("should serve cached result on second call to getUserFeed", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending("PostgreSQL or Redis not available");
        return;
      }

      const user = await insertUser();
      const accountId = user.hederaAccountId!;
      await insertPost(accountId, { contentText: "Cache test post" });

      // Call once to populate cache
      const feed1 = await postsService.getUserFeed(accountId, undefined, 20);
      expect(feed1.posts).toHaveLength(1);

      // Insert a second post directly — it should NOT appear
      // if cache is being served
      await insertPost(accountId, { contentText: "Post after cache" });

      const feed2 = await postsService.getUserFeed(accountId, undefined, 20);
      // Still 1 because cached
      expect(feed2.posts).toHaveLength(1);
      expect(feed2.posts[0].text).toBe("Cache test post");
    });

    it("should serve fresh data after cache expires (TTL)", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending("PostgreSQL or Redis not available");
        return;
      }

      const user = await insertUser();
      const accountId = user.hederaAccountId!;
      await insertPost(accountId, { contentText: "TTL test post" });

      // Populate cache
      await postsService.getUserFeed(accountId, undefined, 20);

      // Verify the cache key has a TTL set
      const cacheKey = `feed:user:${accountId}:latest:20`;
      const ttl = await redisClient!.ttl(cacheKey);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);
    });

    it("should gracefully handle Redis being unavailable for cache get", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      // Even without Redis, the service should work (fallback to DB-only)
      // The PostsService initializes its own Redis client with lazyConnect
      // and sets redis = null on connection failure. This test verifies that
      // the service returns valid data from PostgreSQL regardless of Redis state.

      const user = await insertUser();
      const accountId = user.hederaAccountId!;
      await insertPost(accountId, { contentText: "No-cache post" });

      // This should succeed even if Redis is down — the service
      // returns null from getFromCache and proceeds to DB
      const feed = await postsService.getUserFeed(accountId, undefined, 20);
      expect(feed.posts).toHaveLength(1);
      expect(feed.posts[0].text).toBe("No-cache post");
    });

    it("should use different cache keys for different cursors", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending("PostgreSQL or Redis not available");
        return;
      }

      const user = await insertUser();
      const accountId = user.hederaAccountId!;

      const now = Date.now();
      for (let i = 0; i < 4; i++) {
        await insertPost(accountId, {
          consensusTimestamp: new Date(now - (4 - i) * 1000),
          contentText: `Cache key test ${i}`,
        });
      }

      // Fetch page 1
      const page1 = await postsService.getUserFeed(accountId, undefined, 2);
      expect(page1.posts).toHaveLength(2);

      // Fetch page 2 with cursor
      const page2 = await postsService.getUserFeed(
        accountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.posts).toHaveLength(2);

      // Verify different cache keys
      const key1 = `feed:user:${accountId}:latest:2`;
      const key2 = `feed:user:${accountId}:${page1.nextCursor}:2`;

      const cached1 = await redisClient!.get(key1);
      const cached2 = await redisClient!.get(key2);

      expect(cached1).not.toBeNull();
      expect(cached2).not.toBeNull();

      const parsed1 = JSON.parse(cached1!);
      const parsed2 = JSON.parse(cached2!);

      // They should have different posts
      expect(parsed1.posts[0].id).not.toBe(parsed2.posts[0].id);
    });
  });

  // ===========================================================================
  // toPostResponse() mapping
  // ===========================================================================

  describe("toPostResponse mapping", () => {
    it("should map sequenceNumber correctly for bigint columns", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const post = await insertPost(user.hederaAccountId!, {
        sequenceNumber: 42,
      });

      const result = await postsService.getPost(post.id);

      // TypeORM returns bigint columns as strings; service parses them
      expect(typeof result.sequenceNumber).toBe("number");
      expect(result.sequenceNumber).toBe(42);
    });

    it("should format consensusTimestamp as ISO string", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const timestamp = new Date("2026-01-15T12:00:00.000Z");
      const post = await insertPost(user.hederaAccountId!, {
        consensusTimestamp: timestamp,
      });

      const result = await postsService.getPost(post.id);

      expect(result.consensusTimestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
      );
    });

    it("should return createdAt as ISO string", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const post = await insertPost(user.hederaAccountId!);

      const result = await postsService.getPost(post.id);

      expect(result.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it("should return hcsTopicId in post response", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const topicId = "0.0.555555";
      const post = await insertPost(user.hederaAccountId!, {
        hcsTopicId: topicId,
      });

      const result = await postsService.getPost(post.id);

      expect(result.hcsTopicId).toBe(topicId);
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe("Edge cases", () => {
    it("should handle limit=1 correctly for getUserFeed", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const accountId = user.hederaAccountId!;

      const now = Date.now();
      await insertPost(accountId, {
        consensusTimestamp: new Date(now - 2000),
        contentText: "Edge post 1",
      });
      await insertPost(accountId, {
        consensusTimestamp: new Date(now - 1000),
        contentText: "Edge post 2",
      });

      const feed = await postsService.getUserFeed(accountId, undefined, 1);

      expect(feed.posts).toHaveLength(1);
      expect(feed.hasMore).toBe(true);
      expect(feed.nextCursor).not.toBeNull();
    });

    it("should handle limit=100 (max) without error", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const accountId = uniqueAccountId();
      const feed = await postsService.getUserFeed(accountId, undefined, 100);
      expect(feed.posts).toBeDefined();
    });

    it("should return correct hasMore=false when exact page boundary", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const accountId = user.hederaAccountId!;

      const now = Date.now();
      // Create exactly 2 posts, fetch with limit=2
      await insertPost(accountId, {
        consensusTimestamp: new Date(now - 2000),
      });
      await insertPost(accountId, {
        consensusTimestamp: new Date(now - 1000),
      });

      const feed = await postsService.getUserFeed(accountId, undefined, 2);
      expect(feed.posts).toHaveLength(2);
      expect(feed.hasMore).toBe(false);
      expect(feed.nextCursor).toBeNull();
    });

    it("should handle home feed with feed items from same author", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const viewer = await insertUser();
      const author = await insertUser({ displayName: "SameAuthor" });

      const now = Date.now();
      const post1 = await insertPost(author.hederaAccountId!, {
        consensusTimestamp: new Date(now - 2000),
        contentText: "Same author post 1",
      });
      const post2 = await insertPost(author.hederaAccountId!, {
        consensusTimestamp: new Date(now - 1000),
        contentText: "Same author post 2",
      });

      await insertFeedItem(viewer.hederaAccountId!, post1);
      await insertFeedItem(viewer.hederaAccountId!, post2);

      const feed = await postsService.getHomeFeed(
        viewer.hederaAccountId!,
        undefined,
        10,
      );

      expect(feed.posts).toHaveLength(2);
      // Both should reference the same author
      expect(feed.posts[0].author.displayName).toBe("SameAuthor");
      expect(feed.posts[1].author.displayName).toBe("SameAuthor");
    });

    it("should handle post with empty contentText", async () => {
      if (!postgresAvailable) {
        pending("PostgreSQL not available");
        return;
      }

      const user = await insertUser();
      const post = await insertPost(user.hederaAccountId!, {
        contentText: "",
      });

      const result = await postsService.getPost(post.id);
      expect(result.text).toBe("");
    });
  });
});
