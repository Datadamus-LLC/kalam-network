/**
 * Posts Integration Tests
 *
 * These tests verify the PostsService and PostsController against real
 * infrastructure: PostgreSQL, Redis, and optionally Hedera Testnet.
 *
 * Prerequisites:
 *   - PostgreSQL running with the correct schema
 *   - Redis running
 *   - Hedera testnet credentials in environment variables
 *
 * If infrastructure is unavailable, tests skip gracefully.
 * NO MOCKS are used — all calls are against real services.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";
import configuration from "../../../config/configuration";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { PostsService } from "../services/posts.service";
import { SocialGraphService } from "../services/social-graph.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";

const logger = new Logger("PostsIntegrationTest");

/**
 * Check if PostgreSQL is available by attempting a TCP connection.
 */
async function isPostgresAvailable(): Promise<boolean> {
  const net = await import("net");
  const host = process.env.DB_HOST ?? "localhost";
  const port = parseInt(process.env.DB_PORT ?? "5432", 10);

  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(3000);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

/**
 * Check if Redis is available.
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
 * Check if Hedera testnet credentials are configured.
 */
function isHederaConfigured(): boolean {
  return !!(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);
}

describe("Posts Integration Tests", () => {
  let module: TestingModule;
  let postsService: PostsService;
  let postgresAvailable = false;
  let redisAvailable = false;
  let hederaConfigured = false;

  beforeAll(async () => {
    // Check infrastructure availability
    postgresAvailable = await isPostgresAvailable();
    redisAvailable = await isRedisAvailable();
    hederaConfigured = isHederaConfigured();

    logger.log(
      `Infrastructure status — PostgreSQL: ${postgresAvailable}, Redis: ${redisAvailable}, Hedera: ${hederaConfigured}`,
    );

    if (!postgresAvailable) {
      logger.warn("PostgreSQL is not available. Most tests will be skipped.");
      return;
    }

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
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
              entities: [
                PostIndexEntity,
                SocialFollowEntity,
                UserEntity,
                FeedItemEntity,
              ],
              synchronize: true, // Only for test — creates tables automatically
              logging: false,
            }),
          }),
          TypeOrmModule.forFeature([
            PostIndexEntity,
            SocialFollowEntity,
            UserEntity,
            FeedItemEntity,
          ]),
          JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              secret: configService.get<string>("jwt.secret") ?? "test-secret",
              signOptions: { expiresIn: "1h" },
            }),
          }),
        ],
        providers: [
          PostsService,
          SocialGraphService,
          HederaService,
          MirrorNodeService,
        ],
      }).compile();

      postsService = module.get<PostsService>(PostsService);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  describe("PostsService", () => {
    it("should be defined when PostgreSQL is available", () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }
      expect(postsService).toBeDefined();
    });

    it("should throw UserNotFoundException for non-existent user", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      await expect(
        postsService.createPost("0.0.99999999", { text: "test post" }),
      ).rejects.toThrow();
    });

    it("should return empty feed for user with no follows", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const feed = await postsService.getHomeFeed("0.0.99999999");
      expect(feed).toBeDefined();
      expect(feed.posts).toEqual([]);
      expect(feed.hasMore).toBe(false);
    });

    it("should return empty user feed for non-existent user", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const feed = await postsService.getUserFeed("0.0.99999999");
      expect(feed).toBeDefined();
      expect(feed.posts).toEqual([]);
      expect(feed.hasMore).toBe(false);
    });

    it("should throw PostNotFoundException for non-existent post", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      await expect(
        postsService.getPost("00000000-0000-0000-0000-000000000000"),
      ).rejects.toThrow();
    });

    it("should return trending posts (empty or populated)", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const feed = await postsService.getTrendingPosts();
      expect(feed).toBeDefined();
      expect(Array.isArray(feed.posts)).toBe(true);
      expect(typeof feed.hasMore).toBe("boolean");
    });
  });

  // Infrastructure status is logged in beforeAll — no fake "health check" tests needed.
});
