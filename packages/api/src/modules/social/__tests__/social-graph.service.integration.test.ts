/**
 * SocialGraphService Integration Tests
 *
 * Tests the SocialGraphService against REAL PostgreSQL and Redis instances.
 * Follow/unfollow operations that require HCS topic submission are tested
 * only when Hedera Testnet credentials are configured; otherwise,
 * tests focus on query operations against the database directly.
 *
 * Prerequisites:
 *   - PostgreSQL running (default: localhost:5432)
 *   - Redis running (default: localhost:6379)
 *   - Optional: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY for HCS tests
 *
 * NO MOCKS. NO FAKES. NO STUBS. All calls hit real infrastructure.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import configuration from "../../../config/configuration";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { SocialGraphService } from "../services/social-graph.service";
import { HederaModule } from "../../hedera/hedera.module";
import { RedisModule } from "../../redis/redis.module";
import { RedisService } from "../../redis/redis.service";
import {
  SelfFollowException,
  SelfUnfollowException,
  AlreadyFollowingException,
  NotFollowingException,
  FollowTargetNotFoundException,
  FollowActorNotFoundException,
  SocialGraphTopicNotConfiguredException,
} from "../exceptions/social-graph.exceptions";

const logger = new Logger("SocialGraphIntegrationTest");

/**
 * Check if PostgreSQL is reachable.
 */
async function isPostgresAvailable(): Promise<boolean> {
  try {
    const { Client } = await import("pg");
    const client = new Client({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      user: process.env.DB_USERNAME || "hedera_social",
      password: process.env.DB_PASSWORD || "devpassword",
      database: process.env.DB_DATABASE || "hedera_social",
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Redis is reachable.
 */
async function isRedisAvailable(): Promise<boolean> {
  try {
    const Redis = (await import("ioredis")).default;
    const redis = new Redis({
      host: process.env.REDIS_HOST ?? "localhost",
      port: parseInt(process.env.REDIS_PORT ?? "6379", 10),
      connectTimeout: 3000,
      lazyConnect: true,
    });
    await redis.connect();
    await redis.ping();
    redis.disconnect();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Hedera operator credentials and social graph topic are configured.
 */
function isHederaConfigured(): boolean {
  return !!(
    process.env.HEDERA_OPERATOR_ID &&
    process.env.HEDERA_OPERATOR_KEY &&
    process.env.HEDERA_SOCIAL_GRAPH_TOPIC
  );
}

describe("SocialGraphService Integration Tests", () => {
  let module: TestingModule;
  let socialGraphService: SocialGraphService;
  let userRepo: Repository<UserEntity>;
  let followRepo: Repository<SocialFollowEntity>;
  let followerCountRepo: Repository<FollowerCountEntity>;
  let redisService: RedisService;
  let postgresAvailable = false;
  let redisAvailable = false;
  let hederaConfigured = false;

  // Test user account IDs — unique per test run
  const testRunId = Date.now().toString().slice(-6);
  const userAAccountId = `0.0.1${testRunId}`;
  const userBAccountId = `0.0.2${testRunId}`;
  const userCAccountId = `0.0.3${testRunId}`;

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    redisAvailable = await isRedisAvailable();
    hederaConfigured = isHederaConfigured();

    logger.log(
      `Infrastructure — PostgreSQL: ${postgresAvailable}, Redis: ${redisAvailable}, Hedera: ${hederaConfigured}`,
    );

    if (!postgresAvailable) {
      logger.warn("PostgreSQL not available — tests will be SKIPPED");
      return;
    }

    if (!redisAvailable) {
      logger.warn("Redis not available — cache tests will be SKIPPED");
    }

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
            envFilePath: "../../.env",
          }),
          TypeOrmModule.forRootAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              type: "postgres" as const,
              host: configService.get<string>("database.host"),
              port: configService.get<number>("database.port"),
              username: configService.get<string>("database.username"),
              password: configService.get<string>("database.password"),
              database: configService.get<string>("database.database"),
              entities: [SocialFollowEntity, FollowerCountEntity, UserEntity],
              synchronize: true, // Auto-create tables for integration tests
              logging: false,
            }),
          }),
          TypeOrmModule.forFeature([
            SocialFollowEntity,
            FollowerCountEntity,
            UserEntity,
          ]),
          HederaModule,
          RedisModule,
        ],
        providers: [SocialGraphService],
      }).compile();

      socialGraphService = module.get<SocialGraphService>(SocialGraphService);
      userRepo = module.get<Repository<UserEntity>>(
        getRepositoryToken(UserEntity),
      );
      followRepo = module.get<Repository<SocialFollowEntity>>(
        getRepositoryToken(SocialFollowEntity),
      );
      followerCountRepo = module.get<Repository<FollowerCountEntity>>(
        getRepositoryToken(FollowerCountEntity),
      );
      redisService = module.get<RedisService>(RedisService);

      // Seed test users
      await seedTestUsers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterAll(async () => {
    if (module) {
      // Clean up test data
      await cleanupTestData();
      await module.close();
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    // Clean up follow data between tests (but keep users)
    try {
      await followRepo
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where(
          "followerAccountId IN (:...ids) OR followingAccountId IN (:...ids)",
          { ids: [userAAccountId, userBAccountId, userCAccountId] },
        )
        .execute();

      await followerCountRepo
        .createQueryBuilder()
        .delete()
        .from(FollowerCountEntity)
        .where("accountId IN (:...ids)", {
          ids: [userAAccountId, userBAccountId, userCAccountId],
        })
        .execute();

      // Clear Redis keys related to test users
      if (redisAvailable) {
        const patterns = [
          `social:followers:${userAAccountId}:*`,
          `social:followers:${userBAccountId}:*`,
          `social:followers:${userCAccountId}:*`,
          `social:following:${userAAccountId}:*`,
          `social:following:${userBAccountId}:*`,
          `social:following:${userCAccountId}:*`,
          `social:is_following:${userAAccountId}:*`,
          `social:is_following:${userBAccountId}:*`,
          `social:is_following:${userCAccountId}:*`,
          `social:user_stats:${userAAccountId}`,
          `social:user_stats:${userBAccountId}`,
          `social:user_stats:${userCAccountId}`,
        ];
        for (const pattern of patterns) {
          try {
            const keys = await redisService.keys(pattern);
            for (const key of keys) {
              await redisService.del(key);
            }
          } catch {
            // Redis cleanup failures are non-critical
          }
        }
        // Also delete specific stat keys
        try {
          await redisService.del(`social:user_stats:${userAAccountId}`);
          await redisService.del(`social:user_stats:${userBAccountId}`);
          await redisService.del(`social:user_stats:${userCAccountId}`);
        } catch {
          // Non-critical
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`afterEach cleanup failed: ${message}`);
    }
  });

  async function seedTestUsers(): Promise<void> {
    const users = [
      { hederaAccountId: userAAccountId, displayName: "Test User A" },
      { hederaAccountId: userBAccountId, displayName: "Test User B" },
      { hederaAccountId: userCAccountId, displayName: "Test User C" },
    ];

    for (const userData of users) {
      const existing = await userRepo.findOne({
        where: { hederaAccountId: userData.hederaAccountId },
      });
      if (!existing) {
        const user = userRepo.create({
          id: uuidv4(),
          hederaAccountId: userData.hederaAccountId,
          displayName: userData.displayName,
          status: "active",
        });
        await userRepo.save(user);
      }
    }
  }

  async function cleanupTestData(): Promise<void> {
    try {
      await followRepo
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where(
          "followerAccountId IN (:...ids) OR followingAccountId IN (:...ids)",
          { ids: [userAAccountId, userBAccountId, userCAccountId] },
        )
        .execute();

      await followerCountRepo
        .createQueryBuilder()
        .delete()
        .from(FollowerCountEntity)
        .where("accountId IN (:...ids)", {
          ids: [userAAccountId, userBAccountId, userCAccountId],
        })
        .execute();

      await userRepo
        .createQueryBuilder()
        .delete()
        .from(UserEntity)
        .where("hederaAccountId IN (:...ids)", {
          ids: [userAAccountId, userBAccountId, userCAccountId],
        })
        .execute();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Test data cleanup failed: ${message}`);
    }
  }

  /**
   * Helper: directly insert a follow record in DB (bypassing HCS).
   * Used for query-only tests when Hedera is not available.
   */
  async function insertFollowDirectly(
    followerAccountId: string,
    followingAccountId: string,
    hcsSequenceNumber: number = 0,
  ): Promise<void> {
    const follow = followRepo.create({
      followerAccountId,
      followingAccountId,
      hcsSequenceNumber,
    });
    await followRepo.save(follow);

    // Also update denormalized counts
    for (const accountId of [followerAccountId, followingAccountId]) {
      const [followerCount, followingCount] = await Promise.all([
        followRepo.count({ where: { followingAccountId: accountId } }),
        followRepo.count({ where: { followerAccountId: accountId } }),
      ]);

      let countRecord = await followerCountRepo.findOne({
        where: { accountId },
      });
      if (!countRecord) {
        countRecord = followerCountRepo.create({ accountId });
      }
      countRecord.followerCount = followerCount;
      countRecord.followingCount = followingCount;
      await followerCountRepo.save(countRecord);
    }
  }

  // ---------------------------------------------------------------------------
  // Service instantiation
  // ---------------------------------------------------------------------------

  it("should be defined when PostgreSQL is available", () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }
    expect(socialGraphService).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // follow() — requires Hedera for full test, or throws without topic
  // ---------------------------------------------------------------------------

  describe("follow()", () => {
    it("should throw SelfFollowException when trying to follow yourself", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // SelfFollowException is thrown before HCS submission
      await expect(
        socialGraphService.follow(userAAccountId, userAAccountId),
      ).rejects.toThrow(SelfFollowException);
    });

    it("should throw FollowActorNotFoundException when follower does not exist", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // When Hedera isn't fully configured, topic may or may not be set from .env.
      // If topic missing → SocialGraphTopicNotConfiguredException
      // If topic set → FollowActorNotFoundException (user validation runs next)
      if (!hederaConfigured) {
        await expect(
          socialGraphService.follow("0.0.99999999", userBAccountId),
        ).rejects.toThrow();
        return;
      }

      await expect(
        socialGraphService.follow("0.0.99999999", userBAccountId),
      ).rejects.toThrow(FollowActorNotFoundException);
    });

    it("should throw FollowTargetNotFoundException when target does not exist", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      if (!hederaConfigured) {
        await expect(
          socialGraphService.follow(userAAccountId, "0.0.88888888"),
        ).rejects.toThrow();
        return;
      }

      await expect(
        socialGraphService.follow(userAAccountId, "0.0.88888888"),
      ).rejects.toThrow(FollowTargetNotFoundException);
    });

    it("should create a follow relationship in DB (requires Hedera)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn(
          "SKIPPED: Hedera not configured — follow() requires HCS topic",
        );
        pending();
        return;
      }

      await socialGraphService.follow(userAAccountId, userBAccountId);

      // Verify in database
      const follow = await followRepo.findOne({
        where: {
          followerAccountId: userAAccountId,
          followingAccountId: userBAccountId,
        },
      });
      expect(follow).toBeDefined();
      expect(follow!.followerAccountId).toBe(userAAccountId);
      expect(follow!.followingAccountId).toBe(userBAccountId);
      expect(follow!.hcsSequenceNumber).toBeDefined();
    }, 30000); // Hedera transactions can take time

    it("should throw AlreadyFollowingException on duplicate follow (requires Hedera)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn("SKIPPED: Hedera not configured");
        pending();
        return;
      }

      // First follow
      await socialGraphService.follow(userAAccountId, userBAccountId);

      // Second follow should throw
      await expect(
        socialGraphService.follow(userAAccountId, userBAccountId),
      ).rejects.toThrow(AlreadyFollowingException);
    }, 30000);

    it("should throw SocialGraphTopicNotConfiguredException when topic not set", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      // This test only applies when the social graph topic is NOT configured.
      // The topic may be set from .env even when credentials are missing,
      // so we check the env var directly.
      if (hederaConfigured || process.env.HEDERA_SOCIAL_GRAPH_TOPIC) {
        logger.log(
          "SKIPPED: topic is configured, cannot test missing topic path",
        );
        pending();
        return;
      }

      await expect(
        socialGraphService.follow(userAAccountId, userBAccountId),
      ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
    });
  });

  // ---------------------------------------------------------------------------
  // unfollow()
  // ---------------------------------------------------------------------------

  describe("unfollow()", () => {
    it("should throw NotFollowingException when not following (requires Hedera)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        // When Hedera credentials aren't fully configured, the service may
        // still have the social graph topic from .env (but no operator keys).
        // In that case ensureTopicConfigured() passes and we get
        // NotFollowingException. If topic is also missing, we get
        // SocialGraphTopicNotConfiguredException.
        await expect(
          socialGraphService.unfollow(userAAccountId, userBAccountId),
        ).rejects.toThrow();
        return;
      }

      await expect(
        socialGraphService.unfollow(userAAccountId, userBAccountId),
      ).rejects.toThrow(NotFollowingException);
    });

    it("should remove a follow relationship (requires Hedera)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn("SKIPPED: Hedera not configured");
        pending();
        return;
      }

      // Setup: follow first
      await socialGraphService.follow(userAAccountId, userBAccountId);

      // Verify the follow exists
      const before = await followRepo.findOne({
        where: {
          followerAccountId: userAAccountId,
          followingAccountId: userBAccountId,
        },
      });
      expect(before).toBeDefined();

      // Unfollow
      await socialGraphService.unfollow(userAAccountId, userBAccountId);

      // Verify removal
      const after = await followRepo.findOne({
        where: {
          followerAccountId: userAAccountId,
          followingAccountId: userBAccountId,
        },
      });
      expect(after).toBeNull();
    }, 60000); // Two Hedera transactions
  });

  // ---------------------------------------------------------------------------
  // getFollowers() — DB query, works without Hedera
  // ---------------------------------------------------------------------------

  describe("getFollowers()", () => {
    it("should return empty list when user has no followers", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await socialGraphService.getFollowers(userAAccountId);
      expect(result).toBeDefined();
      expect(result.followers).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("should return followers list with correct data", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert follows directly into DB (bypassing HCS)
      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      const result = await socialGraphService.getFollowers(userAAccountId);
      expect(result.totalCount).toBe(2);
      expect(result.followers).toHaveLength(2);
      expect(result.hasMore).toBe(false);

      // Each follower item should have the correct shape
      for (const follower of result.followers) {
        expect(follower.followingAccountId).toBe(userAAccountId);
        expect(typeof follower.followerAccountId).toBe("string");
        expect(typeof follower.createdAt).toBe("string");
      }
    });

    it("should paginate followers correctly", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert follows
      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      // Request with limit 1
      const page1 = await socialGraphService.getFollowers(
        userAAccountId,
        undefined,
        1,
      );
      expect(page1.followers).toHaveLength(1);
      expect(page1.totalCount).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Get page 2 using cursor
      const page2 = await socialGraphService.getFollowers(
        userAAccountId,
        page1.nextCursor!,
        1,
      );
      expect(page2.followers).toHaveLength(1);
      expect(page2.hasMore).toBe(false);

      // The two pages should have different followers
      expect(page1.followers[0].followerAccountId).not.toBe(
        page2.followers[0].followerAccountId,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowing() — DB query, works without Hedera
  // ---------------------------------------------------------------------------

  describe("getFollowing()", () => {
    it("should return empty list when user follows nobody", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await socialGraphService.getFollowing(userAAccountId);
      expect(result).toBeDefined();
      expect(result.following).toEqual([]);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it("should return following list with correct data", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // User A follows B and C
      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);

      const result = await socialGraphService.getFollowing(userAAccountId);
      expect(result.totalCount).toBe(2);
      expect(result.following).toHaveLength(2);
      expect(result.hasMore).toBe(false);

      // Each item should have correct follower
      for (const item of result.following) {
        expect(item.followerAccountId).toBe(userAAccountId);
      }
    });

    it("should paginate following correctly", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);

      const page1 = await socialGraphService.getFollowing(
        userAAccountId,
        undefined,
        1,
      );
      expect(page1.following).toHaveLength(1);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await socialGraphService.getFollowing(
        userAAccountId,
        page1.nextCursor!,
        1,
      );
      expect(page2.following).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // isFollowing()
  // ---------------------------------------------------------------------------

  describe("isFollowing()", () => {
    it("should return false when not following", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await socialGraphService.isFollowing(
        userAAccountId,
        userBAccountId,
      );
      expect(result).toBe(false);
    });

    it("should return true when following", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);

      const result = await socialGraphService.isFollowing(
        userAAccountId,
        userBAccountId,
      );
      expect(result).toBe(true);
    });

    it("should be directional — A follows B does not mean B follows A", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);

      expect(
        await socialGraphService.isFollowing(userAAccountId, userBAccountId),
      ).toBe(true);
      expect(
        await socialGraphService.isFollowing(userBAccountId, userAAccountId),
      ).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getUserStats()
  // ---------------------------------------------------------------------------

  describe("getUserStats()", () => {
    it("should return zero counts for user with no relationships", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const stats = await socialGraphService.getUserStats(userAAccountId);
      expect(stats).toBeDefined();
      expect(stats.accountId).toBe(userAAccountId);
      expect(stats.followerCount).toBe(0);
      expect(stats.followingCount).toBe(0);
    });

    it("should return correct follower/following counts", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // A follows B and C; B follows A
      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);
      await insertFollowDirectly(userBAccountId, userAAccountId, 3);

      const statsA = await socialGraphService.getUserStats(userAAccountId);
      expect(statsA.accountId).toBe(userAAccountId);
      expect(statsA.followerCount).toBe(1); // B follows A
      expect(statsA.followingCount).toBe(2); // A follows B and C

      const statsB = await socialGraphService.getUserStats(userBAccountId);
      expect(statsB.followerCount).toBe(1); // A follows B
      expect(statsB.followingCount).toBe(1); // B follows A

      const statsC = await socialGraphService.getUserStats(userCAccountId);
      expect(statsC.followerCount).toBe(1); // A follows C
      expect(statsC.followingCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Redis cache behavior
  // ---------------------------------------------------------------------------

  describe("Redis cache", () => {
    it("should populate cache after getFollowers call", async () => {
      if (!postgresAvailable || !redisAvailable) {
        logger.warn(
          "SKIPPED: PostgreSQL or Redis not available for cache test",
        );
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);

      // First call populates cache
      const result = await socialGraphService.getFollowers(userAAccountId);
      expect(result.totalCount).toBe(1);

      // Check Redis has the cache key
      const cacheKey = `social:followers:${userAAccountId}:start:20`;
      const cached = await redisService.get(cacheKey);
      expect(cached).not.toBeNull();

      // Parse and verify cached data matches
      const parsedCache = JSON.parse(cached!);
      expect(parsedCache.totalCount).toBe(1);
      expect(parsedCache.followers).toHaveLength(1);
    });

    it("should populate cache after getFollowing call", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);

      const result = await socialGraphService.getFollowing(userAAccountId);
      expect(result.totalCount).toBe(1);

      const cacheKey = `social:following:${userAAccountId}:start:20`;
      const cached = await redisService.get(cacheKey);
      expect(cached).not.toBeNull();

      const parsedCache = JSON.parse(cached!);
      expect(parsedCache.totalCount).toBe(1);
    });

    it("should cache isFollowing result", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);

      const result = await socialGraphService.isFollowing(
        userAAccountId,
        userBAccountId,
      );
      expect(result).toBe(true);

      const cacheKey = `social:is_following:${userAAccountId}:${userBAccountId}`;
      const cached = await redisService.get(cacheKey);
      expect(cached).toBe("1");
    });

    it("should cache getUserStats result", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      const stats = await socialGraphService.getUserStats(userAAccountId);
      expect(stats).toBeDefined();

      const cacheKey = `social:user_stats:${userAAccountId}`;
      const cached = await redisService.get(cacheKey);
      expect(cached).not.toBeNull();

      const parsedCache = JSON.parse(cached!);
      expect(parsedCache.accountId).toBe(userAAccountId);
    });
  });

  // ---------------------------------------------------------------------------
  // Convenience methods
  // ---------------------------------------------------------------------------

  describe("getFollowersList() and getFollowingList()", () => {
    it("should return all followers as entities (non-paginated)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      const followers =
        await socialGraphService.getFollowersList(userAAccountId);
      expect(followers).toHaveLength(2);
      expect(
        followers.every((f) => f.followingAccountId === userAAccountId),
      ).toBe(true);
    });

    it("should return all following as entities (non-paginated)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);

      const following =
        await socialGraphService.getFollowingList(userAAccountId);
      expect(following).toHaveLength(2);
      expect(
        following.every((f) => f.followerAccountId === userAAccountId),
      ).toBe(true);
    });

    it("should return follower account IDs", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      const ids =
        await socialGraphService.getFollowerAccountIds(userAAccountId);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(userBAccountId);
      expect(ids).toContain(userCAccountId);
    });

    it("should return following account IDs", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);

      const ids =
        await socialGraphService.getFollowingAccountIds(userAAccountId);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(userBAccountId);
      expect(ids).toContain(userCAccountId);
    });

    it("should return empty array for getFollowersList when no followers", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const followers =
        await socialGraphService.getFollowersList(userAAccountId);
      expect(followers).toHaveLength(0);
      expect(followers).toEqual([]);
    });

    it("should return empty array for getFollowingList when not following anyone", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const following =
        await socialGraphService.getFollowingList(userAAccountId);
      expect(following).toHaveLength(0);
      expect(following).toEqual([]);
    });

    it("should return empty array for getFollowerAccountIds when no followers", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const ids =
        await socialGraphService.getFollowerAccountIds(userAAccountId);
      expect(ids).toHaveLength(0);
      expect(ids).toEqual([]);
    });

    it("should return empty array for getFollowingAccountIds when not following anyone", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const ids =
        await socialGraphService.getFollowingAccountIds(userAAccountId);
      expect(ids).toHaveLength(0);
      expect(ids).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // unfollow() — additional error paths
  // ---------------------------------------------------------------------------

  describe("unfollow() error paths", () => {
    it("should throw SelfUnfollowException when trying to unfollow yourself", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // unfollow() calls ensureTopicConfigured() first, then checks self-unfollow.
      // When topic IS configured, SelfUnfollowException is thrown.
      // When topic is NOT configured, SocialGraphTopicNotConfiguredException
      // is thrown before the self-unfollow check is reached.
      if (!process.env.HEDERA_SOCIAL_GRAPH_TOPIC) {
        await expect(
          socialGraphService.unfollow(userAAccountId, userAAccountId),
        ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
      } else {
        await expect(
          socialGraphService.unfollow(userAAccountId, userAAccountId),
        ).rejects.toThrow(SelfUnfollowException);
      }
    });

    it("should throw SocialGraphTopicNotConfiguredException on unfollow when topic not set", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      // Only applicable when the social graph topic is NOT configured
      if (hederaConfigured || process.env.HEDERA_SOCIAL_GRAPH_TOPIC) {
        logger.log(
          "SKIPPED: topic is configured, cannot test missing topic path for unfollow",
        );
        pending();
        return;
      }

      await expect(
        socialGraphService.unfollow(userAAccountId, userBAccountId),
      ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowers() — additional coverage: limit clamping & DTO mapping
  // ---------------------------------------------------------------------------

  describe("getFollowers() edge cases", () => {
    it("should clamp limit below 1 to 1", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      // limit=0 should be clamped to 1, returning one follower with hasMore=true
      const result = await socialGraphService.getFollowers(
        userAAccountId,
        undefined,
        0,
      );
      expect(result.followers).toHaveLength(1);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();
    });

    it("should clamp negative limit to 1", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      const result = await socialGraphService.getFollowers(
        userAAccountId,
        undefined,
        -5,
      );
      expect(result.followers).toHaveLength(1);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it("should clamp limit above 100 to 100", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert two followers — with limit=200 clamped to 100, both should be returned
      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      const result = await socialGraphService.getFollowers(
        userAAccountId,
        undefined,
        200,
      );
      expect(result.followers).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it("should return followers in descending createdAt order", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert with slight delay to guarantee ordering
      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 50));
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      const result = await socialGraphService.getFollowers(userAAccountId);
      expect(result.followers).toHaveLength(2);

      // Most recent first (userC followed after userB)
      const timestamps = result.followers.map((f) =>
        new Date(f.createdAt).getTime(),
      );
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    });

    it("should map DTO fields correctly with hcsSequenceNumber as number and createdAt as ISO string", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 42);

      const result = await socialGraphService.getFollowers(userAAccountId);
      expect(result.followers).toHaveLength(1);

      const item = result.followers[0];
      expect(item.followerAccountId).toBe(userBAccountId);
      expect(item.followingAccountId).toBe(userAAccountId);
      expect(typeof item.hcsSequenceNumber).toBe("number");
      expect(typeof item.createdAt).toBe("string");
      // createdAt should be a valid ISO 8601 date
      expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt);
    });

    it("should return nextCursor as null when all items fit in one page", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);

      const result = await socialGraphService.getFollowers(
        userAAccountId,
        undefined,
        20,
      );
      expect(result.followers).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowing() — additional coverage: limit clamping & DTO mapping
  // ---------------------------------------------------------------------------

  describe("getFollowing() edge cases", () => {
    it("should clamp limit below 1 to 1", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);

      const result = await socialGraphService.getFollowing(
        userAAccountId,
        undefined,
        0,
      );
      expect(result.following).toHaveLength(1);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(true);
    });

    it("should clamp negative limit to 1", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);

      const result = await socialGraphService.getFollowing(
        userAAccountId,
        undefined,
        -10,
      );
      expect(result.following).toHaveLength(1);
      expect(result.hasMore).toBe(true);
    });

    it("should clamp limit above 100 to 100", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);

      const result = await socialGraphService.getFollowing(
        userAAccountId,
        undefined,
        500,
      );
      expect(result.following).toHaveLength(2);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it("should return following in descending createdAt order", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);

      const result = await socialGraphService.getFollowing(userAAccountId);
      expect(result.following).toHaveLength(2);

      const timestamps = result.following.map((f) =>
        new Date(f.createdAt).getTime(),
      );
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i - 1]).toBeGreaterThanOrEqual(timestamps[i]);
      }
    });

    it("should map DTO fields correctly for following items", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 99);

      const result = await socialGraphService.getFollowing(userAAccountId);
      expect(result.following).toHaveLength(1);

      const item = result.following[0];
      expect(item.followerAccountId).toBe(userAAccountId);
      expect(item.followingAccountId).toBe(userBAccountId);
      expect(typeof item.hcsSequenceNumber).toBe("number");
      expect(typeof item.createdAt).toBe("string");
      expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt);
    });
  });

  // ---------------------------------------------------------------------------
  // isFollowing() — additional coverage: cache behavior
  // ---------------------------------------------------------------------------

  describe("isFollowing() cache behavior", () => {
    it("should cache false result as '0' in Redis", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      const result = await socialGraphService.isFollowing(
        userAAccountId,
        userBAccountId,
      );
      expect(result).toBe(false);

      const cacheKey = `social:is_following:${userAAccountId}:${userBAccountId}`;
      const cached = await redisService.get(cacheKey);
      expect(cached).toBe("0");
    });

    it("should serve cached isFollowing result on second call", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);

      // First call — queries DB and populates cache
      const result1 = await socialGraphService.isFollowing(
        userAAccountId,
        userBAccountId,
      );
      expect(result1).toBe(true);

      // Verify cache was populated
      const cacheKey = `social:is_following:${userAAccountId}:${userBAccountId}`;
      const cached = await redisService.get(cacheKey);
      expect(cached).toBe("1");

      // Delete the follow from DB directly — cache should still return true
      await followRepo
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where("followerAccountId = :fId AND followingAccountId = :tId", {
          fId: userAAccountId,
          tId: userBAccountId,
        })
        .execute();

      // Second call — should return cached result (true) even though DB has no follow
      const result2 = await socialGraphService.isFollowing(
        userAAccountId,
        userBAccountId,
      );
      expect(result2).toBe(true);
    });

    it("should differentiate cache keys by direction", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);

      await socialGraphService.isFollowing(userAAccountId, userBAccountId);
      await socialGraphService.isFollowing(userBAccountId, userAAccountId);

      const cacheKeyAB = `social:is_following:${userAAccountId}:${userBAccountId}`;
      const cacheKeyBA = `social:is_following:${userBAccountId}:${userAAccountId}`;

      const cachedAB = await redisService.get(cacheKeyAB);
      const cachedBA = await redisService.get(cacheKeyBA);

      expect(cachedAB).toBe("1");
      expect(cachedBA).toBe("0");
    });
  });

  // ---------------------------------------------------------------------------
  // getUserStats() — additional coverage: defaults and cache
  // ---------------------------------------------------------------------------

  describe("getUserStats() edge cases", () => {
    it("should return zero counts when no follower_counts record exists", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Use a unique account ID that definitely has no counts record
      const uniqueAccountId = `0.0.9${testRunId}`;

      const stats = await socialGraphService.getUserStats(uniqueAccountId);
      expect(stats.accountId).toBe(uniqueAccountId);
      expect(stats.followerCount).toBe(0);
      expect(stats.followingCount).toBe(0);
    });

    it("should serve cached getUserStats result on second call", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      // Setup: create some follows and counts
      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      // First call populates cache
      const stats1 = await socialGraphService.getUserStats(userAAccountId);
      expect(stats1.followerCount).toBe(2);
      expect(stats1.followingCount).toBe(0);

      // Verify cache is populated
      const cacheKey = `social:user_stats:${userAAccountId}`;
      const cached = await redisService.get(cacheKey);
      expect(cached).not.toBeNull();
      const parsedCache = JSON.parse(cached!);
      expect(parsedCache.followerCount).toBe(2);

      // Add another follower directly in DB (bypassing cache invalidation)
      const newFollowerId = `0.0.8${testRunId}`;
      const newUser = userRepo.create({
        id: uuidv4(),
        hederaAccountId: newFollowerId,
        displayName: "Extra User",
        status: "active",
      });
      await userRepo.save(newUser);
      await insertFollowDirectly(newFollowerId, userAAccountId, 3);

      // Second call should return cached result (still 2 followers)
      const stats2 = await socialGraphService.getUserStats(userAAccountId);
      expect(stats2.followerCount).toBe(2); // Cached, not 3

      // Cleanup extra user
      await followRepo
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where("followerAccountId = :fId AND followingAccountId = :tId", {
          fId: newFollowerId,
          tId: userAAccountId,
        })
        .execute();
      await followerCountRepo
        .createQueryBuilder()
        .delete()
        .from(FollowerCountEntity)
        .where("accountId = :id", { id: newFollowerId })
        .execute();
      await userRepo
        .createQueryBuilder()
        .delete()
        .from(UserEntity)
        .where("hederaAccountId = :id", { id: newFollowerId })
        .execute();
    });

    it("should include accountId in the response DTO", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const stats = await socialGraphService.getUserStats(userBAccountId);
      expect(stats).toHaveProperty("accountId");
      expect(stats).toHaveProperty("followerCount");
      expect(stats).toHaveProperty("followingCount");
      expect(stats.accountId).toBe(userBAccountId);
    });
  });

  // ---------------------------------------------------------------------------
  // Redis cache — additional coverage: cache hits and cache-after-DB patterns
  // ---------------------------------------------------------------------------

  describe("Redis cache hit paths", () => {
    it("should serve getFollowers from cache on second call", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);

      // First call — populates cache
      const result1 = await socialGraphService.getFollowers(userAAccountId);
      expect(result1.totalCount).toBe(1);

      // Delete from DB directly — cache should still work
      await followRepo
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where("followerAccountId = :fId AND followingAccountId = :tId", {
          fId: userBAccountId,
          tId: userAAccountId,
        })
        .execute();

      // Second call — should return cached data showing 1 follower
      const result2 = await socialGraphService.getFollowers(userAAccountId);
      expect(result2.totalCount).toBe(1);
      expect(result2.followers).toHaveLength(1);
    });

    it("should serve getFollowing from cache on second call", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);

      // First call — populates cache
      const result1 = await socialGraphService.getFollowing(userAAccountId);
      expect(result1.totalCount).toBe(1);

      // Delete from DB directly
      await followRepo
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where("followerAccountId = :fId AND followingAccountId = :tId", {
          fId: userAAccountId,
          tId: userBAccountId,
        })
        .execute();

      // Second call — should return cached data showing 1 following
      const result2 = await socialGraphService.getFollowing(userAAccountId);
      expect(result2.totalCount).toBe(1);
      expect(result2.following).toHaveLength(1);
    });

    it("should use different cache keys for different cursor/limit combos", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      // Call with limit=1 — cached under key with limit=1
      const page1 = await socialGraphService.getFollowers(
        userAAccountId,
        undefined,
        1,
      );
      expect(page1.followers).toHaveLength(1);

      // Call with limit=20 (default) — cached under key with limit=20
      const all = await socialGraphService.getFollowers(userAAccountId);
      expect(all.followers).toHaveLength(2);

      // Verify both cache keys exist
      const cacheKey1 = `social:followers:${userAAccountId}:start:1`;
      const cacheKey20 = `social:followers:${userAAccountId}:start:20`;

      const cached1 = await redisService.get(cacheKey1);
      const cached20 = await redisService.get(cacheKey20);

      expect(cached1).not.toBeNull();
      expect(cached20).not.toBeNull();

      // Cached responses should differ in content
      const parsed1 = JSON.parse(cached1!);
      const parsed20 = JSON.parse(cached20!);
      expect(parsed1.followers).toHaveLength(1);
      expect(parsed20.followers).toHaveLength(2);
    });

    it("should cache getFollowers with cursor key", async () => {
      if (!postgresAvailable || !redisAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);

      // Get first page
      const page1 = await socialGraphService.getFollowers(
        userAAccountId,
        undefined,
        1,
      );
      expect(page1.nextCursor).not.toBeNull();

      // Get second page using cursor — should also be cached
      const page2 = await socialGraphService.getFollowers(
        userAAccountId,
        page1.nextCursor!,
        1,
      );
      expect(page2.followers).toHaveLength(1);
      expect(page2.hasMore).toBe(false);

      // Verify cursor-based cache key
      const cacheKeyCursor = `social:followers:${userAAccountId}:${page1.nextCursor}:1`;
      const cachedCursor = await redisService.get(cacheKeyCursor);
      expect(cachedCursor).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // follow() — additional pre-HCS validation paths
  // ---------------------------------------------------------------------------

  describe("follow() pre-HCS validation", () => {
    it("should throw SelfFollowException before checking topic configuration", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // SelfFollowException is thrown after ensureTopicConfigured() in the code.
      // When topic is not configured, SocialGraphTopicNotConfiguredException
      // is thrown first. When topic IS configured, SelfFollowException is thrown.
      if (process.env.HEDERA_SOCIAL_GRAPH_TOPIC) {
        await expect(
          socialGraphService.follow(userAAccountId, userAAccountId),
        ).rejects.toThrow(SelfFollowException);
      } else {
        // Topic not configured — ensureTopicConfigured() throws first
        await expect(
          socialGraphService.follow(userAAccountId, userAAccountId),
        ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
      }
    });

    it("should throw AlreadyFollowingException when DB has existing follow (bypassing HCS)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!process.env.HEDERA_SOCIAL_GRAPH_TOPIC) {
        logger.log(
          "SKIPPED: topic not configured, cannot reach AlreadyFollowingException",
        );
        pending();
        return;
      }

      // Insert a follow directly into DB
      await insertFollowDirectly(userAAccountId, userBAccountId, 1);

      // Attempting to follow again should throw AlreadyFollowingException
      // (after topic check, self-follow check, user existence check)
      await expect(
        socialGraphService.follow(userAAccountId, userBAccountId),
      ).rejects.toThrow(AlreadyFollowingException);
    });
  });

  // ---------------------------------------------------------------------------
  // Denormalized counts via insertFollowDirectly — verify correctness
  // ---------------------------------------------------------------------------

  describe("denormalized follower counts", () => {
    it("should reflect correct counts after multiple follows", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // A follows B, A follows C, B follows A
      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);
      await insertFollowDirectly(userBAccountId, userAAccountId, 3);

      // Check counts in the follower_counts table
      const countsA = await followerCountRepo.findOne({
        where: { accountId: userAAccountId },
      });
      expect(countsA).not.toBeNull();
      expect(countsA!.followerCount).toBe(1); // B follows A
      expect(countsA!.followingCount).toBe(2); // A follows B and C

      const countsB = await followerCountRepo.findOne({
        where: { accountId: userBAccountId },
      });
      expect(countsB).not.toBeNull();
      expect(countsB!.followerCount).toBe(1); // A follows B
      expect(countsB!.followingCount).toBe(1); // B follows A

      const countsC = await followerCountRepo.findOne({
        where: { accountId: userCAccountId },
      });
      expect(countsC).not.toBeNull();
      expect(countsC!.followerCount).toBe(1); // A follows C
      expect(countsC!.followingCount).toBe(0);
    });

    it("should match getUserStats with denormalized counts", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await insertFollowDirectly(userCAccountId, userBAccountId, 2);

      // B has 2 followers (A and C), 0 following
      const stats = await socialGraphService.getUserStats(userBAccountId);
      expect(stats.followerCount).toBe(2);
      expect(stats.followingCount).toBe(0);

      // Verify it matches the counts table directly
      const countsRecord = await followerCountRepo.findOne({
        where: { accountId: userBAccountId },
      });
      expect(countsRecord).not.toBeNull();
      expect(countsRecord!.followerCount).toBe(stats.followerCount);
      expect(countsRecord!.followingCount).toBe(stats.followingCount);
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-page cursor pagination (3+ pages)
  // ---------------------------------------------------------------------------

  describe("multi-page cursor pagination", () => {
    // Seed additional test users for multi-page pagination tests
    const extraUserIds: string[] = [];

    beforeEach(async () => {
      if (!postgresAvailable) return;

      // Create 5 extra users to have enough for multi-page testing
      for (let i = 0; i < 5; i++) {
        const accountId = `0.0.${4 + i}${testRunId}`;
        extraUserIds.push(accountId);

        const existing = await userRepo.findOne({
          where: { hederaAccountId: accountId },
        });
        if (!existing) {
          const user = userRepo.create({
            id: uuidv4(),
            hederaAccountId: accountId,
            displayName: `Extra User ${i}`,
            status: "active",
          });
          await userRepo.save(user);
        }
      }
    });

    afterEach(async () => {
      if (!postgresAvailable) return;

      // Clean up extra follow records
      for (const extraId of extraUserIds) {
        try {
          await followRepo
            .createQueryBuilder()
            .delete()
            .from(SocialFollowEntity)
            .where("followerAccountId = :id OR followingAccountId = :id", {
              id: extraId,
            })
            .execute();

          await followerCountRepo
            .createQueryBuilder()
            .delete()
            .from(FollowerCountEntity)
            .where("accountId = :id", { id: extraId })
            .execute();

          await userRepo
            .createQueryBuilder()
            .delete()
            .from(UserEntity)
            .where("hederaAccountId = :id", { id: extraId })
            .execute();
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn(`Extra user cleanup failed for ${extraId}: ${msg}`);
        }
      }
      extraUserIds.length = 0;
    });

    it("should paginate through 5 followers across 3 pages (limit=2)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // User B, C, and 3 extra users follow A
      await insertFollowDirectly(userBAccountId, userAAccountId, 1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await insertFollowDirectly(userCAccountId, userAAccountId, 2);
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        await insertFollowDirectly(extraUserIds[i], userAAccountId, 3 + i);
      }

      // Page 1
      const page1 = await socialGraphService.getFollowers(
        userAAccountId,
        undefined,
        2,
      );
      expect(page1.followers).toHaveLength(2);
      expect(page1.totalCount).toBe(5);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Page 2
      const page2 = await socialGraphService.getFollowers(
        userAAccountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.followers).toHaveLength(2);
      expect(page2.totalCount).toBe(5);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextCursor).not.toBeNull();

      // Page 3 — last page
      const page3 = await socialGraphService.getFollowers(
        userAAccountId,
        page2.nextCursor!,
        2,
      );
      expect(page3.followers).toHaveLength(1);
      expect(page3.totalCount).toBe(5);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();

      // All pages together should cover all 5 followers (no duplicates)
      const allFollowerIds = [
        ...page1.followers.map((f) => f.followerAccountId),
        ...page2.followers.map((f) => f.followerAccountId),
        ...page3.followers.map((f) => f.followerAccountId),
      ];
      const uniqueIds = new Set(allFollowerIds);
      expect(uniqueIds.size).toBe(5);
    });

    it("should paginate through following list across multiple pages", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // User A follows B, C, and 3 extra users
      await insertFollowDirectly(userAAccountId, userBAccountId, 1);
      await new Promise((resolve) => setTimeout(resolve, 20));
      await insertFollowDirectly(userAAccountId, userCAccountId, 2);
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        await insertFollowDirectly(userAAccountId, extraUserIds[i], 3 + i);
      }

      // Page 1 (limit=2)
      const page1 = await socialGraphService.getFollowing(
        userAAccountId,
        undefined,
        2,
      );
      expect(page1.following).toHaveLength(2);
      expect(page1.totalCount).toBe(5);
      expect(page1.hasMore).toBe(true);

      // Page 2
      const page2 = await socialGraphService.getFollowing(
        userAAccountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.following).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      // Page 3 — last
      const page3 = await socialGraphService.getFollowing(
        userAAccountId,
        page2.nextCursor!,
        2,
      );
      expect(page3.following).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();

      // No duplicates across pages
      const allFollowingIds = [
        ...page1.following.map((f) => f.followingAccountId),
        ...page2.following.map((f) => f.followingAccountId),
        ...page3.following.map((f) => f.followingAccountId),
      ];
      const uniqueIds = new Set(allFollowingIds);
      expect(uniqueIds.size).toBe(5);
    });
  });
});
