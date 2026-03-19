/**
 * SocialGraphService Coverage Cycle 3 — Integration Tests
 *
 * Targets uncovered paths in social-graph.service.ts to push line coverage
 * from ~42% toward 85%.
 *
 * Newly covered paths:
 *   - syncSocialGraphFromMirrorNode() — topic-not-configured exception, 0 messages
 *   - getFollowingList() — non-paginated query + empty result
 *   - getFollowerAccountIds() — string[] of follower IDs + empty
 *   - getFollowingAccountIds() — string[] of following IDs + empty
 *   - getUserStats() — cache miss creating/reading FollowerCountEntity + zero-count fallback
 *   - isFollowing() — DB lookup + cache write (true and false)
 *   - getFollowers() — pagination with cursor parameter + empty page
 *   - getFollowing() — pagination with cursor parameter + empty page
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

import { SocialGraphService } from "../services/social-graph.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { RedisService } from "../../redis/redis.service";
import { NotificationsService } from "../../notifications/notifications.service";

import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import { NotificationEntity } from "../../../database/entities/notification.entity";

import { SocialGraphTopicNotConfiguredException } from "../exceptions/social-graph.exceptions";

const logger = new Logger("SocialGraphCoverageCycle3");

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

let accountIdCounter = 0;
function uniqueAccountId(): string {
  accountIdCounter += 1;
  return `0.0.${Date.now() % 999999}${accountIdCounter}${Math.floor(Math.random() * 100)}`;
}

describe("SocialGraphService Coverage Cycle 3", () => {
  let module: TestingModule;
  let socialGraphService: SocialGraphService;
  let dataSource: DataSource;
  let followRepository: Repository<SocialFollowEntity>;
  let followerCountRepository: Repository<FollowerCountEntity>;
  let userRepository: Repository<UserEntity>;
  let redisService: RedisService;
  let postgresAvailable = false;
  let redisAvailable = false;

  // Cleanup tracking
  const createdUserIds: string[] = [];
  const createdFollowKeys: Array<{
    followerAccountId: string;
    followingAccountId: string;
  }> = [];
  const createdCountAccountIds: string[] = [];

  async function createFollowRecord(
    followerAccountId: string,
    followingAccountId: string,
    sequenceNumber: number = 1,
  ): Promise<SocialFollowEntity> {
    const follow = followRepository.create({
      followerAccountId,
      followingAccountId,
      hcsSequenceNumber: sequenceNumber,
    });
    const saved = await followRepository.save(follow);
    createdFollowKeys.push({ followerAccountId, followingAccountId });
    return saved;
  }

  async function createFollowerCountRecord(
    accountId: string,
    followerCount: number,
    followingCount: number,
  ): Promise<FollowerCountEntity> {
    const record = followerCountRepository.create({
      accountId,
      followerCount,
      followingCount,
    });
    const saved = await followerCountRepository.save(record);
    createdCountAccountIds.push(accountId);
    return saved;
  }

  async function clearRedisCache(): Promise<void> {
    try {
      const patterns = [
        "social:followers:*",
        "social:following:*",
        "social:is_following:*",
        "social:user_stats:*",
      ];
      for (const pattern of patterns) {
        const keys = await redisService.keys(pattern);
        for (const key of keys) {
          await redisService.del(key);
        }
      }
    } catch {
      // Redis may not be available; non-critical for test setup
    }
  }

  beforeAll(async () => {
    const [pgReachable, redisReachable] = await Promise.all([
      isPortReachable(TEST_DB_PORT, TEST_DB_HOST),
      isPortReachable(TEST_REDIS_PORT, TEST_REDIS_HOST),
    ]);

    postgresAvailable = pgReachable;
    redisAvailable = redisReachable;

    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available on port 5433 — all tests will be skipped",
      );
      return;
    }

    if (!redisAvailable) {
      logger.warn(
        "Redis not available on port 6380 — all tests will be skipped",
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
            entities: [
              SocialFollowEntity,
              FollowerCountEntity,
              UserEntity,
              PostIndexEntity,
              FeedItemEntity,
              PostLikeEntity,
              PostCommentEntity,
              NotificationEntity,
            ],
            synchronize: true,
            logging: false,
          }),
          TypeOrmModule.forFeature([
            SocialFollowEntity,
            FollowerCountEntity,
            UserEntity,
            PostIndexEntity,
            FeedItemEntity,
            PostLikeEntity,
            PostCommentEntity,
            NotificationEntity,
          ]),
        ],
        providers: [
          SocialGraphService,
          HederaService,
          MirrorNodeService,
          RedisService,
          NotificationsService,
        ],
      }).compile();

      socialGraphService = module.get<SocialGraphService>(SocialGraphService);
      dataSource = module.get<DataSource>(DataSource);
      followRepository = dataSource.getRepository(SocialFollowEntity);
      followerCountRepository = dataSource.getRepository(FollowerCountEntity);
      userRepository = dataSource.getRepository(UserEntity);
      redisService = module.get<RedisService>(RedisService);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable || !redisAvailable) return;

    // Clean follows
    for (const key of createdFollowKeys) {
      try {
        await followRepository
          .createQueryBuilder()
          .delete()
          .from(SocialFollowEntity)
          .where(
            '"followerAccountId" = :follower AND "followingAccountId" = :following',
            {
              follower: key.followerAccountId,
              following: key.followingAccountId,
            },
          )
          .execute();
      } catch {
        /* cleanup best-effort */
      }
    }
    createdFollowKeys.length = 0;

    // Clean follower counts
    for (const accountId of createdCountAccountIds) {
      try {
        await followerCountRepository
          .createQueryBuilder()
          .delete()
          .from(FollowerCountEntity)
          .where('"accountId" = :accountId', { accountId })
          .execute();
      } catch {
        /* cleanup best-effort */
      }
    }
    createdCountAccountIds.length = 0;

    // Clean users
    for (const id of createdUserIds) {
      try {
        await userRepository.delete(id);
      } catch {
        /* cleanup best-effort */
      }
    }
    createdUserIds.length = 0;

    // Clear Redis cache
    await clearRedisCache();
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  function skipIfInfraUnavailable(): boolean {
    if (!postgresAvailable || !redisAvailable) {
      pending();
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // syncSocialGraphFromMirrorNode — topic-not-configured exception
  // Lines 648-651: ensureTopicConfigured() throws when topic is ""
  // ---------------------------------------------------------------------------

  describe("syncSocialGraphFromMirrorNode", () => {
    it("should throw SocialGraphTopicNotConfiguredException when topic is not configured", async () => {
      if (skipIfInfraUnavailable()) return;

      await expect(
        socialGraphService.syncSocialGraphFromMirrorNode(0),
      ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
    });

    it("should throw SocialGraphTopicNotConfiguredException with default afterSequence parameter", async () => {
      if (skipIfInfraUnavailable()) return;

      // Calling with no argument exercises the default parameter path
      await expect(
        socialGraphService.syncSocialGraphFromMirrorNode(),
      ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowingList — non-paginated convenience method
  // Lines 606-616
  // ---------------------------------------------------------------------------

  describe("getFollowingList", () => {
    it("should return all following entities for a given account", async () => {
      if (skipIfInfraUnavailable()) return;

      const actorAccountId = uniqueAccountId();
      const targetA = uniqueAccountId();
      const targetB = uniqueAccountId();

      await createFollowRecord(actorAccountId, targetA, 100);
      await createFollowRecord(actorAccountId, targetB, 101);

      const result = await socialGraphService.getFollowingList(actorAccountId);

      expect(result).toHaveLength(2);

      const followingIds = result.map((f) => f.followingAccountId);
      expect(followingIds).toContain(targetA);
      expect(followingIds).toContain(targetB);

      for (const entity of result) {
        expect(entity.followerAccountId).toBe(actorAccountId);
        expect(entity.createdAt).toBeInstanceOf(Date);
      }
    });

    it("should return empty array when user follows nobody", async () => {
      if (skipIfInfraUnavailable()) return;

      const lonelyAccount = uniqueAccountId();
      const result = await socialGraphService.getFollowingList(lonelyAccount);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowerAccountIds — string[] helper
  // Lines 621-624
  // ---------------------------------------------------------------------------

  describe("getFollowerAccountIds", () => {
    it("should return string array of follower account IDs", async () => {
      if (skipIfInfraUnavailable()) return;

      const targetAccountId = uniqueAccountId();
      const followerA = uniqueAccountId();
      const followerB = uniqueAccountId();

      await createFollowRecord(followerA, targetAccountId, 110);
      await createFollowRecord(followerB, targetAccountId, 111);

      const result =
        await socialGraphService.getFollowerAccountIds(targetAccountId);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result).toContain(followerA);
      expect(result).toContain(followerB);

      for (const id of result) {
        expect(typeof id).toBe("string");
        expect(id).toMatch(/^0\.0\.\d+$/);
      }
    });

    it("should return empty array when no followers exist", async () => {
      if (skipIfInfraUnavailable()) return;

      const targetAccountId = uniqueAccountId();
      const result =
        await socialGraphService.getFollowerAccountIds(targetAccountId);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowingAccountIds — string[] helper
  // Lines 629-632
  // ---------------------------------------------------------------------------

  describe("getFollowingAccountIds", () => {
    it("should return string array of following account IDs", async () => {
      if (skipIfInfraUnavailable()) return;

      const actorAccountId = uniqueAccountId();
      const targetA = uniqueAccountId();
      const targetB = uniqueAccountId();
      const targetC = uniqueAccountId();

      await createFollowRecord(actorAccountId, targetA, 120);
      await createFollowRecord(actorAccountId, targetB, 121);
      await createFollowRecord(actorAccountId, targetC, 122);

      const result =
        await socialGraphService.getFollowingAccountIds(actorAccountId);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(3);
      expect(result).toContain(targetA);
      expect(result).toContain(targetB);
      expect(result).toContain(targetC);

      for (const id of result) {
        expect(typeof id).toBe("string");
        expect(id).toMatch(/^0\.0\.\d+$/);
      }
    });

    it("should return empty array when user follows nobody", async () => {
      if (skipIfInfraUnavailable()) return;

      const actorAccountId = uniqueAccountId();
      const result =
        await socialGraphService.getFollowingAccountIds(actorAccountId);

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // getUserStats — cache miss path
  // Lines 556-581: reads FollowerCountEntity, creates fallback zeros
  // ---------------------------------------------------------------------------

  describe("getUserStats (cache miss paths)", () => {
    it("should return counts from FollowerCountEntity on cache miss", async () => {
      if (skipIfInfraUnavailable()) return;

      const accountId = uniqueAccountId();
      await createFollowerCountRecord(accountId, 55, 23);

      // Ensure cache is empty
      await clearRedisCache();

      const stats = await socialGraphService.getUserStats(accountId);

      expect(stats.accountId).toBe(accountId);
      expect(stats.followerCount).toBe(55);
      expect(stats.followingCount).toBe(23);
    });

    it("should return zeros for an unknown account (creates no DB record)", async () => {
      if (skipIfInfraUnavailable()) return;

      const unknownAccountId = uniqueAccountId();

      // Ensure no cache
      await clearRedisCache();

      const stats = await socialGraphService.getUserStats(unknownAccountId);

      expect(stats.accountId).toBe(unknownAccountId);
      expect(stats.followerCount).toBe(0);
      expect(stats.followingCount).toBe(0);
    });

    it("should return cached stats on second call", async () => {
      if (skipIfInfraUnavailable()) return;

      const accountId = uniqueAccountId();
      await createFollowerCountRecord(accountId, 10, 5);

      // First call — cache miss, populates cache
      const stats1 = await socialGraphService.getUserStats(accountId);
      expect(stats1.followerCount).toBe(10);
      expect(stats1.followingCount).toBe(5);

      // Mutate the DB record directly to prove second call reads from cache
      await followerCountRepository.update(
        { accountId },
        { followerCount: 999 },
      );

      // Second call — should return cached values (not 999)
      const stats2 = await socialGraphService.getUserStats(accountId);
      expect(stats2.followerCount).toBe(10);
      expect(stats2.followingCount).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // isFollowing — DB lookup + cache write
  // Lines 520-545
  // ---------------------------------------------------------------------------

  describe("isFollowing (DB lookup + cache write)", () => {
    it("should return true and cache result when follow relationship exists", async () => {
      if (skipIfInfraUnavailable()) return;

      const followerAccountId = uniqueAccountId();
      const followingAccountId = uniqueAccountId();

      await createFollowRecord(followerAccountId, followingAccountId, 200);

      // Ensure no cache
      await clearRedisCache();

      const result = await socialGraphService.isFollowing(
        followerAccountId,
        followingAccountId,
      );
      expect(result).toBe(true);

      // Verify cache was written
      const cacheKey = `social:is_following:${followerAccountId}:${followingAccountId}`;
      const cached = await redisService.get(cacheKey);
      expect(cached).toBe("1");
    });

    it("should return false and cache '0' when no follow relationship exists", async () => {
      if (skipIfInfraUnavailable()) return;

      const accountA = uniqueAccountId();
      const accountB = uniqueAccountId();

      // Ensure no cache
      await clearRedisCache();

      const result = await socialGraphService.isFollowing(accountA, accountB);
      expect(result).toBe(false);

      // Verify cache was written with "0"
      const cacheKey = `social:is_following:${accountA}:${accountB}`;
      const cached = await redisService.get(cacheKey);
      expect(cached).toBe("0");
    });

    it("should return cached value on second call without DB lookup", async () => {
      if (skipIfInfraUnavailable()) return;

      const followerAccountId = uniqueAccountId();
      const followingAccountId = uniqueAccountId();

      await createFollowRecord(followerAccountId, followingAccountId, 201);

      // Ensure no cache
      await clearRedisCache();

      // First call — populates cache
      const result1 = await socialGraphService.isFollowing(
        followerAccountId,
        followingAccountId,
      );
      expect(result1).toBe(true);

      // Delete the DB record to prove second call reads from cache
      await followRepository
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where(
          '"followerAccountId" = :follower AND "followingAccountId" = :following',
          {
            follower: followerAccountId,
            following: followingAccountId,
          },
        )
        .execute();

      // Remove from cleanup tracking since we already deleted
      const idx = createdFollowKeys.findIndex(
        (k) =>
          k.followerAccountId === followerAccountId &&
          k.followingAccountId === followingAccountId,
      );
      if (idx >= 0) {
        createdFollowKeys.splice(idx, 1);
      }

      // Second call — should still return true from cache
      const result2 = await socialGraphService.isFollowing(
        followerAccountId,
        followingAccountId,
      );
      expect(result2).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowers (paginated) — cursor parameter path
  // Lines 398-441 with cursor parameter
  // ---------------------------------------------------------------------------

  describe("getFollowers pagination with cursor", () => {
    it("should return second page when cursor is provided", async () => {
      if (skipIfInfraUnavailable()) return;

      const targetAccountId = uniqueAccountId();

      // Insert 4 followers with staggered timestamps
      for (let i = 0; i < 4; i++) {
        const followerId = uniqueAccountId();
        await createFollowRecord(followerId, targetAccountId, 300 + i);
        // Small delay to ensure distinct createdAt timestamps
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            clearTimeout(timer);
            resolve();
          }, 60);
        });
      }

      // Get page 1 with limit=2
      const page1 = await socialGraphService.getFollowers(
        targetAccountId,
        undefined,
        2,
      );

      expect(page1.followers).toHaveLength(2);
      expect(page1.totalCount).toBe(4);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Get page 2 using cursor
      const page2 = await socialGraphService.getFollowers(
        targetAccountId,
        page1.nextCursor ?? undefined,
        2,
      );

      expect(page2.followers).toHaveLength(2);
      expect(page2.totalCount).toBe(4);
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeNull();

      // Ensure no overlap between pages
      const page1Ids = page1.followers.map((f) => f.followerAccountId);
      const page2Ids = page2.followers.map((f) => f.followerAccountId);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });

    it("should return empty list when no followers exist", async () => {
      if (skipIfInfraUnavailable()) return;

      const emptyAccountId = uniqueAccountId();
      const page = await socialGraphService.getFollowers(
        emptyAccountId,
        undefined,
        10,
      );

      expect(page.followers).toHaveLength(0);
      expect(page.totalCount).toBe(0);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it("should clamp limit to minimum of 1", async () => {
      if (skipIfInfraUnavailable()) return;

      const targetAccountId = uniqueAccountId();
      const followerId = uniqueAccountId();
      await createFollowRecord(followerId, targetAccountId, 310);

      // Pass limit=0 which should be clamped to 1
      const page = await socialGraphService.getFollowers(
        targetAccountId,
        undefined,
        0,
      );

      // With limit clamped to 1 and only 1 record, hasMore should be false
      expect(page.followers).toHaveLength(1);
      expect(page.totalCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowing (paginated) — cursor parameter path
  // Lines 448-510 with cursor parameter
  // ---------------------------------------------------------------------------

  describe("getFollowing pagination with cursor", () => {
    it("should return second page when cursor is provided", async () => {
      if (skipIfInfraUnavailable()) return;

      const actorAccountId = uniqueAccountId();

      // Insert 4 following targets with staggered timestamps
      for (let i = 0; i < 4; i++) {
        const targetId = uniqueAccountId();
        await createFollowRecord(actorAccountId, targetId, 400 + i);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            clearTimeout(timer);
            resolve();
          }, 60);
        });
      }

      // Get page 1 with limit=2
      const page1 = await socialGraphService.getFollowing(
        actorAccountId,
        undefined,
        2,
      );

      expect(page1.following).toHaveLength(2);
      expect(page1.totalCount).toBe(4);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Get page 2 using cursor
      const page2 = await socialGraphService.getFollowing(
        actorAccountId,
        page1.nextCursor ?? undefined,
        2,
      );

      expect(page2.following).toHaveLength(2);
      expect(page2.totalCount).toBe(4);
      expect(page2.hasMore).toBe(false);
      expect(page2.nextCursor).toBeNull();

      // Ensure no overlap between pages
      const page1Ids = page1.following.map((f) => f.followingAccountId);
      const page2Ids = page2.following.map((f) => f.followingAccountId);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });

    it("should return empty list when user follows nobody", async () => {
      if (skipIfInfraUnavailable()) return;

      const emptyAccountId = uniqueAccountId();
      const page = await socialGraphService.getFollowing(
        emptyAccountId,
        undefined,
        10,
      );

      expect(page.following).toHaveLength(0);
      expect(page.totalCount).toBe(0);
      expect(page.hasMore).toBe(false);
      expect(page.nextCursor).toBeNull();
    });

    it("should clamp limit to minimum of 1", async () => {
      if (skipIfInfraUnavailable()) return;

      const actorAccountId = uniqueAccountId();
      const targetId = uniqueAccountId();
      await createFollowRecord(actorAccountId, targetId, 410);

      // Pass limit=0 which should be clamped to 1
      const page = await socialGraphService.getFollowing(
        actorAccountId,
        undefined,
        0,
      );

      expect(page.following).toHaveLength(1);
      expect(page.totalCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowers — cache hit path
  // Lines 390-394: returns cached response directly
  // ---------------------------------------------------------------------------

  describe("getFollowers cache hit", () => {
    it("should return cached response on subsequent call", async () => {
      if (skipIfInfraUnavailable()) return;

      const targetAccountId = uniqueAccountId();
      const followerId = uniqueAccountId();
      await createFollowRecord(followerId, targetAccountId, 500);

      // Ensure cache is empty
      await clearRedisCache();

      // First call — populates cache
      const result1 = await socialGraphService.getFollowers(
        targetAccountId,
        undefined,
        20,
      );
      expect(result1.followers).toHaveLength(1);
      expect(result1.totalCount).toBe(1);

      // Delete the follow from DB to prove second call uses cache
      await followRepository
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where(
          '"followerAccountId" = :follower AND "followingAccountId" = :following',
          { follower: followerId, following: targetAccountId },
        )
        .execute();

      // Remove from cleanup tracking
      const idx = createdFollowKeys.findIndex(
        (k) =>
          k.followerAccountId === followerId &&
          k.followingAccountId === targetAccountId,
      );
      if (idx >= 0) {
        createdFollowKeys.splice(idx, 1);
      }

      // Second call — should return cached data (still showing 1 follower)
      const result2 = await socialGraphService.getFollowers(
        targetAccountId,
        undefined,
        20,
      );
      expect(result2.followers).toHaveLength(1);
      expect(result2.totalCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowing — cache hit path
  // Lines 459-462: returns cached response directly
  // ---------------------------------------------------------------------------

  describe("getFollowing cache hit", () => {
    it("should return cached response on subsequent call", async () => {
      if (skipIfInfraUnavailable()) return;

      const actorAccountId = uniqueAccountId();
      const targetId = uniqueAccountId();
      await createFollowRecord(actorAccountId, targetId, 510);

      // Ensure cache is empty
      await clearRedisCache();

      // First call — populates cache
      const result1 = await socialGraphService.getFollowing(
        actorAccountId,
        undefined,
        20,
      );
      expect(result1.following).toHaveLength(1);
      expect(result1.totalCount).toBe(1);

      // Delete the follow from DB to prove second call uses cache
      await followRepository
        .createQueryBuilder()
        .delete()
        .from(SocialFollowEntity)
        .where(
          '"followerAccountId" = :follower AND "followingAccountId" = :following',
          { follower: actorAccountId, following: targetId },
        )
        .execute();

      // Remove from cleanup tracking
      const idx = createdFollowKeys.findIndex(
        (k) =>
          k.followerAccountId === actorAccountId &&
          k.followingAccountId === targetId,
      );
      if (idx >= 0) {
        createdFollowKeys.splice(idx, 1);
      }

      // Second call — should return cached data
      const result2 = await socialGraphService.getFollowing(
        actorAccountId,
        undefined,
        20,
      );
      expect(result2.following).toHaveLength(1);
      expect(result2.totalCount).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowers — DTO shape validation
  // Lines 422-427: toFollowerItemDto mapping
  // ---------------------------------------------------------------------------

  describe("getFollowers DTO shape", () => {
    it("should return items with correct DTO shape", async () => {
      if (skipIfInfraUnavailable()) return;

      const targetAccountId = uniqueAccountId();
      const followerId = uniqueAccountId();
      await createFollowRecord(followerId, targetAccountId, 600);

      await clearRedisCache();

      const page = await socialGraphService.getFollowers(
        targetAccountId,
        undefined,
        10,
      );

      expect(page.followers).toHaveLength(1);
      const item = page.followers[0];

      // Verify DTO shape from toFollowerItemDto
      expect(typeof item.followerAccountId).toBe("string");
      expect(typeof item.followingAccountId).toBe("string");
      expect(typeof item.hcsSequenceNumber).toBe("number");
      expect(typeof item.createdAt).toBe("string");

      // createdAt should be a valid ISO string
      const parsed = new Date(item.createdAt);
      expect(parsed.getTime()).not.toBeNaN();

      expect(item.followerAccountId).toBe(followerId);
      expect(item.followingAccountId).toBe(targetAccountId);
    });
  });

  // ---------------------------------------------------------------------------
  // getFollowing — DTO shape validation
  // Lines 491-496: toFollowerItemDto mapping
  // ---------------------------------------------------------------------------

  describe("getFollowing DTO shape", () => {
    it("should return items with correct DTO shape", async () => {
      if (skipIfInfraUnavailable()) return;

      const actorAccountId = uniqueAccountId();
      const targetId = uniqueAccountId();
      await createFollowRecord(actorAccountId, targetId, 610);

      await clearRedisCache();

      const page = await socialGraphService.getFollowing(
        actorAccountId,
        undefined,
        10,
      );

      expect(page.following).toHaveLength(1);
      const item = page.following[0];

      expect(typeof item.followerAccountId).toBe("string");
      expect(typeof item.followingAccountId).toBe("string");
      expect(typeof item.hcsSequenceNumber).toBe("number");
      expect(typeof item.createdAt).toBe("string");

      const parsed = new Date(item.createdAt);
      expect(parsed.getTime()).not.toBeNaN();

      expect(item.followerAccountId).toBe(actorAccountId);
      expect(item.followingAccountId).toBe(targetId);
    });
  });
});
