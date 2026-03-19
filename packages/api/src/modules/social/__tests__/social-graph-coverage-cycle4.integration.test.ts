/**
 * SocialGraphService Coverage Cycle 4 — Integration Tests
 *
 * Targets uncovered follow/unfollow validation paths.
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

const logger = new Logger("SocialGraphCoverageCycle4");
const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

const ALL_ENTITIES = [
  SocialFollowEntity,
  FollowerCountEntity,
  UserEntity,
  PostIndexEntity,
  FeedItemEntity,
  PostLikeEntity,
  PostCommentEntity,
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

describe("SocialGraphService Coverage Cycle 4", () => {
  let module: TestingModule;
  let socialGraphService: SocialGraphService;
  let followRepo: Repository<SocialFollowEntity>;
  let followerCountRepo: Repository<FollowerCountEntity>;
  let userRepo: Repository<UserEntity>;
  let redisService: RedisService;
  let postgresAvailable = false;

  const createdUserIds: string[] = [];
  const createdFollowKeys: Array<{
    followerAccountId: string;
    followingAccountId: string;
  }> = [];
  const createdCountAccountIds: string[] = [];

  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const id = uuidv4();
    const user = userRepo.create({
      id,
      displayName: `Test User ${id.slice(0, 8)}`,
      hederaAccountId: uniqueAccountId(),
      status: "active",
      ...overrides,
    });
    const saved = await userRepo.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  async function createFollowRecord(
    followerAccountId: string,
    followingAccountId: string,
    sequenceNumber: number = 1,
  ): Promise<SocialFollowEntity> {
    const follow = followRepo.create({
      followerAccountId,
      followingAccountId,
      hcsSequenceNumber: sequenceNumber,
    });
    const saved = await followRepo.save(follow);
    createdFollowKeys.push({ followerAccountId, followingAccountId });
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
      /* non-critical */
    }
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
          SocialGraphService,
          HederaService,
          MirrorNodeService,
          RedisService,
          NotificationsService,
        ],
      }).compile();

      socialGraphService = module.get<SocialGraphService>(SocialGraphService);
      const ds = module.get<DataSource>(DataSource);
      followRepo = ds.getRepository(SocialFollowEntity);
      followerCountRepo = ds.getRepository(FollowerCountEntity);
      userRepo = ds.getRepository(UserEntity);
      redisService = module.get<RedisService>(RedisService);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    for (const key of createdFollowKeys) {
      try {
        await followRepo
          .createQueryBuilder()
          .delete()
          .from(SocialFollowEntity)
          .where('"followerAccountId" = :f AND "followingAccountId" = :t', {
            f: key.followerAccountId,
            t: key.followingAccountId,
          })
          .execute();
      } catch {
        /* best-effort */
      }
    }
    createdFollowKeys.length = 0;

    for (const accountId of createdCountAccountIds) {
      try {
        await followerCountRepo
          .createQueryBuilder()
          .delete()
          .from(FollowerCountEntity)
          .where('"accountId" = :accountId', { accountId })
          .execute();
      } catch {
        /* best-effort */
      }
    }
    createdCountAccountIds.length = 0;

    for (const id of createdUserIds) {
      try {
        await userRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdUserIds.length = 0;

    await clearRedisCache();
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
  // follow() / unfollow() — topic not configured (guard runs first)
  // ───────────────────────────────────────────────────────────────────────────

  describe("follow/unfollow topic guard", () => {
    it("follow should throw SocialGraphTopicNotConfiguredException when topic is empty", async () => {
      if (skip()) return;
      const actor = await createTestUser();
      const target = await createTestUser();
      await expect(
        socialGraphService.follow(
          actor.id,
          actor.hederaAccountId!,
          target.hederaAccountId!,
        ),
      ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
    });

    it("unfollow should throw SocialGraphTopicNotConfiguredException when topic is empty", async () => {
      if (skip()) return;
      const actor = await createTestUser();
      const target = await createTestUser();
      await createFollowRecord(
        actor.hederaAccountId!,
        target.hederaAccountId!,
        1,
      );
      await expect(
        socialGraphService.unfollow(
          actor.id,
          actor.hederaAccountId!,
          target.hederaAccountId!,
        ),
      ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
    });

    it("syncSocialGraphFromMirrorNode should throw SocialGraphTopicNotConfiguredException", async () => {
      if (skip()) return;
      await expect(
        socialGraphService.syncSocialGraphFromMirrorNode(0),
      ).rejects.toThrow(SocialGraphTopicNotConfiguredException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getFollowers (paginated)
  // ───────────────────────────────────────────────────────────────────────────

  describe("getFollowers (paginated)", () => {
    it("should return followers with total count", async () => {
      if (skip()) return;
      const targetAccountId = uniqueAccountId();
      const f1 = uniqueAccountId();
      const f2 = uniqueAccountId();
      await createFollowRecord(f1, targetAccountId, 100);
      await createFollowRecord(f2, targetAccountId, 101);

      const result = await socialGraphService.getFollowers(targetAccountId);
      expect(result.followers.length).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const targetAccountId = uniqueAccountId();
      for (let i = 0; i < 5; i++) {
        await createFollowRecord(uniqueAccountId(), targetAccountId, 200 + i);
      }

      const page1 = await socialGraphService.getFollowers(
        targetAccountId,
        undefined,
        2,
      );
      expect(page1.followers.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await socialGraphService.getFollowers(
        targetAccountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.followers.length).toBe(2);
      expect(page2.hasMore).toBe(true);

      const page3 = await socialGraphService.getFollowers(
        targetAccountId,
        page2.nextCursor!,
        2,
      );
      expect(page3.followers.length).toBe(1);
      expect(page3.hasMore).toBe(false);
    });

    it("should return empty for user with no followers", async () => {
      if (skip()) return;
      const result = await socialGraphService.getFollowers(uniqueAccountId());
      expect(result.followers).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getFollowing (paginated)
  // ───────────────────────────────────────────────────────────────────────────

  describe("getFollowing (paginated)", () => {
    it("should return following list with total count", async () => {
      if (skip()) return;
      const actorAccountId = uniqueAccountId();
      const t1 = uniqueAccountId();
      const t2 = uniqueAccountId();
      await createFollowRecord(actorAccountId, t1, 300);
      await createFollowRecord(actorAccountId, t2, 301);

      const result = await socialGraphService.getFollowing(actorAccountId);
      expect(result.following.length).toBe(2);
      expect(result.totalCount).toBe(2);
      expect(result.hasMore).toBe(false);
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const actorAccountId = uniqueAccountId();
      for (let i = 0; i < 4; i++) {
        await createFollowRecord(actorAccountId, uniqueAccountId(), 400 + i);
      }

      const page1 = await socialGraphService.getFollowing(
        actorAccountId,
        undefined,
        2,
      );
      expect(page1.following.length).toBe(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await socialGraphService.getFollowing(
        actorAccountId,
        page1.nextCursor!,
        2,
      );
      expect(page2.following.length).toBe(2);
      expect(page2.hasMore).toBe(false);
    });

    it("should return empty for user following nobody", async () => {
      if (skip()) return;
      const result = await socialGraphService.getFollowing(uniqueAccountId());
      expect(result.following).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // isFollowing
  // ───────────────────────────────────────────────────────────────────────────

  describe("isFollowing", () => {
    it("should return true when follow relationship exists", async () => {
      if (skip()) return;
      const a = uniqueAccountId();
      const b = uniqueAccountId();
      await createFollowRecord(a, b, 500);

      const result = await socialGraphService.isFollowing(a, b);
      expect(result).toBe(true);
    });

    it("should return false when no follow relationship", async () => {
      if (skip()) return;
      const result = await socialGraphService.isFollowing(
        uniqueAccountId(),
        uniqueAccountId(),
      );
      expect(result).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getFollowerAccountIds / getFollowingAccountIds
  // ───────────────────────────────────────────────────────────────────────────

  describe("getFollowerAccountIds", () => {
    it("should return array of follower account IDs", async () => {
      if (skip()) return;
      const target = uniqueAccountId();
      const f1 = uniqueAccountId();
      const f2 = uniqueAccountId();
      await createFollowRecord(f1, target, 600);
      await createFollowRecord(f2, target, 601);

      const ids = await socialGraphService.getFollowerAccountIds(target);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(f1);
      expect(ids).toContain(f2);
    });
  });

  describe("getFollowingAccountIds", () => {
    it("should return array of following account IDs", async () => {
      if (skip()) return;
      const actor = uniqueAccountId();
      const t1 = uniqueAccountId();
      const t2 = uniqueAccountId();
      await createFollowRecord(actor, t1, 650);
      await createFollowRecord(actor, t2, 651);

      const ids = await socialGraphService.getFollowingAccountIds(actor);
      expect(ids).toHaveLength(2);
      expect(ids).toContain(t1);
      expect(ids).toContain(t2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Additional getFollowingList / getFollowerAccountIds tests
  // ───────────────────────────────────────────────────────────────────────────

  describe("getFollowingList with multiple follows", () => {
    it("should return all entities when user follows many", async () => {
      if (skip()) return;
      const actorAccountId = uniqueAccountId();
      const targets: string[] = [];
      for (let i = 0; i < 5; i++) {
        const target = uniqueAccountId();
        targets.push(target);
        await createFollowRecord(actorAccountId, target, 700 + i);
      }

      const result = await socialGraphService.getFollowingList(actorAccountId);
      expect(result.length).toBe(5);
      for (const target of targets) {
        expect(result.map((f) => f.followingAccountId)).toContain(target);
      }
    });
  });

  describe("getUserStats from DB with existing record", () => {
    it("should return updated follower count after cache clear", async () => {
      if (skip()) return;
      const accountId = uniqueAccountId();

      const record = followerCountRepo.create({
        accountId,
        followerCount: 42,
        followingCount: 18,
      });
      await followerCountRepo.save(record);
      createdCountAccountIds.push(accountId);

      await clearRedisCache();
      const stats = await socialGraphService.getUserStats(accountId);
      expect(stats.followerCount).toBe(42);
      expect(stats.followingCount).toBe(18);
    });
  });
});
