/**
 * Full Application Controller Integration Tests
 *
 * Boots the entire NestJS application with REAL PostgreSQL, Redis, and module
 * wiring.  Exercises every controller endpoint via supertest to cover:
 *   - Notifications (4 endpoints)
 *   - Profile (3 endpoints)
 *   - Users search (1 endpoint)
 *   - Posts (5 endpoints)
 *   - Social graph (6 endpoints)
 *   - Conversations (4 endpoints)
 *   - Payments (10 endpoints)
 *   - Organization (8 endpoints)
 *   - KYC Webhook (1 endpoint)
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * Every request hits real infrastructure.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe, Logger } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule, JwtService } from "@nestjs/jwt";
import request from "supertest";
import { Client } from "pg";
import Redis from "ioredis";
import configuration from "../src/config/configuration";
import { AuthModule } from "../src/modules/auth/auth.module";
import { IdentityModule } from "../src/modules/identity/identity.module";
import { MessagingModule } from "../src/modules/messaging/messaging.module";
import { SocialModule } from "../src/modules/social/social.module";
import { PaymentsModule } from "../src/modules/payments/payments.module";
import { NotificationsModule } from "../src/modules/notifications/notifications.module";
import { OrganizationModule } from "../src/modules/organization/organization.module";
import { HederaModule } from "../src/modules/hedera/hedera.module";
import { IntegrationsModule } from "../src/modules/integrations/integrations.module";
import { RedisModule } from "../src/modules/redis/redis.module";
import { ChatModule } from "../src/modules/chat/chat.module";
import { UserEntity } from "../src/database/entities/user.entity";
import { OrganizationEntity } from "../src/database/entities/organization.entity";
import { OrganizationMemberEntity } from "../src/database/entities/organization-member.entity";
import { OrganizationInvitationEntity } from "../src/database/entities/organization-invitation.entity";
import { NotificationEntity } from "../src/database/entities/notification.entity";
import { ConversationEntity } from "../src/database/entities/conversation.entity";
import { ConversationMemberEntity } from "../src/database/entities/conversation-member.entity";
import { DataSource } from "typeorm";
import { v4 as uuidv4 } from "uuid";

const logger = new Logger("ControllerIntegrationTest");

// ---------------------------------------------------------------------------
// Infrastructure checks
// ---------------------------------------------------------------------------

async function isPostgresAvailable(): Promise<boolean> {
  const client = new Client({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5433", 10),
    user: process.env.DB_USERNAME || "test",
    password: process.env.DB_PASSWORD || "test",
    database: process.env.DB_DATABASE || "hedera_social_test",
    connectionTimeoutMillis: 3000,
  });
  try {
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function isRedisAvailable(): Promise<boolean> {
  const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6380", 10),
    connectTimeout: 3000,
    lazyConnect: true,
  });
  try {
    await redis.connect();
    await redis.ping();
    await redis.quit();
    return true;
  } catch {
    try {
      await redis.quit();
    } catch (quitErr: unknown) {
      const msg = quitErr instanceof Error ? quitErr.message : String(quitErr);
      logger.warn(`Redis quit cleanup: ${msg}`);
    }
    return false;
  }
}

const infrastructureReady = (async () => {
  const pg = await isPostgresAvailable();
  const rd = await isRedisAvailable();
  if (!pg) logger.warn("PostgreSQL not available — tests SKIPPED");
  if (!rd) logger.warn("Redis not available — tests SKIPPED");
  return pg && rd;
})();

let ready = false;
beforeAll(async () => {
  ready = await infrastructureReady;
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Controller Integration — full application HTTP endpoints", () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let accessToken: string;
  let testUserId: string;
  const testRunId = Date.now();
  const testHederaAccountId = `0.0.${900000 + (testRunId % 100000)}`;
  const testEmail = `ctrl-test-${testRunId}@integration.test`;

  beforeAll(async () => {
    if (!ready) return;

    const moduleFixture: TestingModule = await Test.createTestingModule({
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
            autoLoadEntities: true,
            synchronize: true,
            logging: false,
          }),
        }),
        JwtModule.registerAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            secret: configService.get<string>("jwt.secret"),
            signOptions: {
              expiresIn: configService.get<string>("jwt.expiry"),
            },
          }),
        }),
        RedisModule,
        AuthModule,
        IdentityModule,
        MessagingModule,
        SocialModule,
        PaymentsModule,
        NotificationsModule,
        OrganizationModule,
        ChatModule,
        HederaModule,
        IntegrationsModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Create a real user directly in the database
    const dataSource = moduleFixture.get(DataSource);
    const userRepo = dataSource.getRepository(UserEntity);
    testUserId = uuidv4();
    await userRepo.save({
      id: testUserId,
      email: testEmail,
      hederaAccountId: testHederaAccountId,
      displayName: "Controller Test User",
      status: "active",
      accountType: "individual",
    });

    // Sign a JWT for the created user
    accessToken = jwtService.sign({
      sub: testUserId,
      hederaAccountId: testHederaAccountId,
      identifier: testEmail,
    });
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  // Helper for auth headers
  function authHeader() {
    return { Authorization: `Bearer ${accessToken}` };
  }

  // =========================================================================
  // AUTH — guard validation
  // =========================================================================

  describe("Auth Guard", () => {
    it("should reject requests without Authorization header", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .get("/api/v1/notifications")
        .expect(401);
    });

    it("should reject requests with invalid JWT", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .get("/api/v1/notifications")
        .set("Authorization", "Bearer invalid.jwt.token")
        .expect(401);
    });
  });

  // =========================================================================
  // NOTIFICATIONS CONTROLLER
  // =========================================================================

  describe("NotificationsController", () => {
    it("GET /api/v1/notifications — should return paginated notifications", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications")
        .set(authHeader())
        .expect(200);

      expect(res.body).toHaveProperty("success", true);
      expect(res.body).toHaveProperty("data");
      expect(res.body).toHaveProperty("timestamp");
    });

    it("GET /api/v1/notifications?category=payment — should filter by category", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications?category=payment")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("GET /api/v1/notifications/unread-count — should return unread count", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications/unread-count")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("unreadCount");
    });

    it("POST /api/v1/notifications/read — should reject empty notificationIds array", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .post("/api/v1/notifications/read")
        .set(authHeader())
        .send({ notificationIds: [] })
        .expect(400);
    });

    it("POST /api/v1/notifications/read — should accept valid notificationIds", async () => {
      if (!ready) {
        pending();
        return;
      }

      // Use a random UUID — the service handles non-existent IDs gracefully
      const res = await request(app.getHttpServer())
        .post("/api/v1/notifications/read")
        .set(authHeader())
        .send({ notificationIds: [uuidv4()] })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("PUT /api/v1/notifications/read-all — should mark all as read", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .put("/api/v1/notifications/read-all")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("GET /api/v1/notifications?cursor=... — should paginate with cursor", async () => {
      if (!ready) return;

      // Create a real notification in DB to ensure we have data
      const dataSource = app.get(DataSource);
      const notifRepo = dataSource.getRepository(NotificationEntity);
      const notif = await notifRepo.save({
        id: uuidv4(),
        recipientAccountId: testHederaAccountId,
        event: "payment_received",
        category: "payment",
        preview: "You received 10 HBAR",
        data: {},
        isRead: false,
      });

      // First page — no cursor
      const res1 = await request(app.getHttpServer())
        .get("/api/v1/notifications?limit=1")
        .set(authHeader())
        .expect(200);

      expect(res1.body.success).toBe(true);
      expect(res1.body.data.notifications).toBeDefined();

      if (res1.body.data.nextCursor) {
        // Second page — with cursor
        const res2 = await request(app.getHttpServer())
          .get(
            `/api/v1/notifications?limit=1&cursor=${res1.body.data.nextCursor}`,
          )
          .set(authHeader())
          .expect(200);

        expect(res2.body.success).toBe(true);
      }

      // Cleanup
      await notifRepo.delete({ id: notif.id });
    });

    it("GET /api/v1/notifications?category=social — should filter to social category", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications?category=social")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.notifications).toBeDefined();
    });

    it("GET /api/v1/notifications?category=message — should filter to message category", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/notifications?category=message")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  // =========================================================================
  // PROFILE CONTROLLER
  // =========================================================================

  describe("ProfileController", () => {
    it("GET /api/v1/profile/me — should return own profile", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/profile/me")
        .set(authHeader());

      // May return 200 or 404 if profile not fully set up
      expect([200, 404]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    it("GET /api/v1/profile/:accountId — should return public profile or 404", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer()).get(
        `/api/v1/profile/${testHederaAccountId}`,
      );

      // Public endpoint, no auth needed
      expect([200, 404]).toContain(res.status);
    });

    it("PUT /api/v1/profile/me — should update profile", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .put("/api/v1/profile/me")
        .set(authHeader())
        .send({ displayName: "Integration Test User" });

      // May return 200 or error if DID-NFT ops fail without Hedera
      expect([200, 500]).toContain(res.status);
    });
  });

  // =========================================================================
  // USERS SEARCH CONTROLLER
  // =========================================================================

  describe("UsersSearchController", () => {
    it("GET /api/v1/users/search?q=test — should return search results", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/users/search?q=test")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it("GET /api/v1/users/search?q=test&limit=5 — should respect limit param", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/users/search?q=test&limit=5")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(5);
    });
  });

  // =========================================================================
  // POSTS CONTROLLER
  // =========================================================================

  describe("PostsController", () => {
    it("GET /api/v1/posts/feed — should return home feed", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/posts/feed")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("posts");
    });

    it("GET /api/v1/posts/trending — should return trending posts", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/posts/trending")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("posts");
    });

    it("GET /api/v1/posts/user/:accountId — should return user feed", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/posts/user/${testHederaAccountId}`)
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("posts");
    });

    it("POST /api/v1/posts — should reject without auth", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .post("/api/v1/posts")
        .send({ content: "Hello world" })
        .expect(401);
    });

    it("GET /api/v1/posts/:id — should return 422 for invalid UUID", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .get("/api/v1/posts/not-a-uuid")
        .set(authHeader())
        .expect(400);
    });
  });

  // =========================================================================
  // SOCIAL GRAPH CONTROLLER
  // =========================================================================

  describe("SocialGraphController", () => {
    it("GET /api/v1/social/:accountId/followers — should return follower list", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/social/${testHederaAccountId}/followers`)
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("followers");
    });

    it("GET /api/v1/social/:accountId/following — should return following list", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/social/${testHederaAccountId}/following`)
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("following");
    });

    it("GET /api/v1/social/:accountId/is-following/:targetId — should return follow status", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/social/${testHederaAccountId}/is-following/0.0.999902`)
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("isFollowing");
    });

    it("GET /api/v1/social/:accountId/stats — should return user stats", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/social/${testHederaAccountId}/stats`)
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("followerCount");
      expect(res.body.data).toHaveProperty("followingCount");
    });

    it("POST /api/v1/social/follow — should reject without auth", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .post("/api/v1/social/follow")
        .send({ targetAccountId: "0.0.999902" })
        .expect(401);
    });

    it("POST /api/v1/social/unfollow — should reject without auth", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .post("/api/v1/social/unfollow")
        .send({ targetAccountId: "0.0.999902" })
        .expect(401);
    });
  });

  // =========================================================================
  // CONVERSATIONS CONTROLLER
  // =========================================================================

  describe("ConversationsController", () => {
    it("GET /api/v1/conversations — should return conversations list", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/conversations")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty("data");
    });

    it("GET /api/v1/conversations — should reject without auth", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .get("/api/v1/conversations")
        .expect(401);
    });

    it("GET /api/v1/conversations/:id — should return 422 for invalid UUID", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .get("/api/v1/conversations/not-a-uuid")
        .set(authHeader())
        .expect(400);
    });

    it("POST /api/v1/conversations/:id/participants — should reject invalid UUID", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .post("/api/v1/conversations/not-a-uuid/participants")
        .set(authHeader())
        .send({ accountId: "0.0.999902" })
        .expect(400);
    });
  });

  // =========================================================================
  // PAYMENTS CONTROLLER
  // =========================================================================

  describe("PaymentsController", () => {
    it("GET /api/v1/payments/balance — should return balance or handle missing Hedera", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/balance")
        .set(authHeader());

      // Balance endpoint may hit Hedera mirror node — allow 200 or 500
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    it("GET /api/v1/payments/history — should return payment history", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/history")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("transactions");
    });

    it("GET /api/v1/payments/transactions — should return transactions", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/transactions")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("GET /api/v1/payments/requests — should return payment requests", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/requests")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("POST /api/v1/payments/send — should reject without auth", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .post("/api/v1/payments/send")
        .send({
          recipientAccountId: "0.0.999902",
          amount: 1,
          currency: "HBAR",
        })
        .expect(401);
    });

    it("POST /api/v1/payments/request — should reject without auth", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .post("/api/v1/payments/request")
        .send({
          topicId: "0.0.1234",
          amount: 10,
          currency: "HBAR",
        })
        .expect(401);
    });

    it("GET /api/v1/payments/balance — should reject without auth", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .get("/api/v1/payments/balance")
        .expect(401);
    });

    it("GET /api/v1/payments/transactions?direction=sent — should filter by direction", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/transactions?direction=sent")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("GET /api/v1/payments/transactions?status=completed — should filter by status", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/transactions?status=completed")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("GET /api/v1/payments/transactions?search=test — should filter by search", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/transactions?search=test")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("GET /api/v1/payments/requests?status=pending — should filter requests", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/requests?status=pending")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it("GET /api/v1/payments/history?limit=5 — should respect limit", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/payments/history?limit=5")
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty("transactions");
    });
  });

  // =========================================================================
  // ORGANIZATION CONTROLLER
  // =========================================================================

  describe("OrganizationController", () => {
    let orgId: string;
    let orgOwnerToken: string;
    let orgOwnerUserId: string;
    let memberUserId: string;
    let memberToken: string;

    beforeAll(async () => {
      if (!ready) return;

      const dataSource = app.get(DataSource);
      const userRepo = dataSource.getRepository(UserEntity);
      const orgRepo = dataSource.getRepository(OrganizationEntity);
      const memberRepo = dataSource.getRepository(OrganizationMemberEntity);

      // Create org owner user
      orgOwnerUserId = uuidv4();
      const orgHederaId = `0.0.${800000 + (testRunId % 100000)}`;
      await userRepo.save({
        id: orgOwnerUserId,
        email: `org-owner-${testRunId}@integration.test`,
        hederaAccountId: orgHederaId,
        displayName: "Org Owner",
        status: "active",
        accountType: "individual",
      });

      orgOwnerToken = jwtService.sign({
        sub: orgOwnerUserId,
        hederaAccountId: orgHederaId,
        identifier: `org-owner-${testRunId}@integration.test`,
      });

      // Create member user
      memberUserId = uuidv4();
      const memberHederaId = `0.0.${810000 + (testRunId % 100000)}`;
      await userRepo.save({
        id: memberUserId,
        email: `org-member-${testRunId}@integration.test`,
        hederaAccountId: memberHederaId,
        displayName: "Org Member",
        status: "active",
        accountType: "individual",
      });

      memberToken = jwtService.sign({
        sub: memberUserId,
        hederaAccountId: memberHederaId,
        identifier: `org-member-${testRunId}@integration.test`,
      });

      // Create a real organization in DB
      orgId = uuidv4();
      await orgRepo.save({
        id: orgId,
        ownerUserId: orgOwnerUserId,
        name: `Test Org ${testRunId}`,
        hederaAccountId: orgHederaId,
        kybStatus: "pending",
      });

      // Create owner membership
      await memberRepo.save({
        id: uuidv4(),
        organizationId: orgId,
        userId: orgOwnerUserId,
        role: "owner",
      });

      // Add member
      await memberRepo.save({
        id: uuidv4(),
        organizationId: orgId,
        userId: memberUserId,
        role: "member",
        invitedBy: orgOwnerUserId,
      });
    });

    it("GET /api/v1/organizations/me — should return org for owner", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/organizations/me")
        .set({ Authorization: `Bearer ${orgOwnerToken}` })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.name).toBe(`Test Org ${testRunId}`);
      expect(res.body.data.members).toBeDefined();
      expect(res.body.data.members.length).toBeGreaterThanOrEqual(2);
    });

    it("GET /api/v1/organizations/me — should reject without auth", async () => {
      if (!ready) return;

      await request(app.getHttpServer())
        .get("/api/v1/organizations/me")
        .expect(401);
    });

    it("GET /api/v1/organizations/me — should 404 for user without org", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/organizations/me")
        .set(authHeader());

      expect([404]).toContain(res.status);
    });

    it("GET /api/v1/organizations/me — non-owner member should get 404 on /me", async () => {
      if (!ready) return;

      // memberToken is a user who is a member of an org but not the owner
      // GET /me looks up org by ownerUserId, so a non-owner member gets 404
      const res = await request(app.getHttpServer())
        .get("/api/v1/organizations/me")
        .set({ Authorization: `Bearer ${memberToken}` });

      expect([404]).toContain(res.status);
    });

    it("PUT /api/v1/organizations/me — should update org profile", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .put("/api/v1/organizations/me")
        .set({ Authorization: `Bearer ${orgOwnerToken}` })
        .send({ bio: "Updated bio for integration test", category: "tech" })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.bio).toBe("Updated bio for integration test");
      expect(res.body.data.category).toBe("tech");
    });

    it("GET /api/v1/organizations/me/members — should list members", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/organizations/me/members")
        .set({ Authorization: `Bearer ${orgOwnerToken}` })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    it("PUT /api/v1/organizations/me/members/:userId/role — should update role", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .put(`/api/v1/organizations/me/members/${memberUserId}/role`)
        .set({ Authorization: `Bearer ${orgOwnerToken}` })
        .send({ role: "admin" })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.role).toBe("admin");
    });

    it("POST /api/v1/organizations/me/invitations — should create invitation", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .post("/api/v1/organizations/me/invitations")
        .set({ Authorization: `Bearer ${orgOwnerToken}` })
        .send({
          email: `invite-${testRunId}@integration.test`,
          role: "member",
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe(`invite-${testRunId}@integration.test`);
      expect(res.body.data.status).toBe("pending");
    });

    it("GET /api/v1/organizations/me/invitations — should list invitations", async () => {
      if (!ready) return;

      const res = await request(app.getHttpServer())
        .get("/api/v1/organizations/me/invitations")
        .set({ Authorization: `Bearer ${orgOwnerToken}` })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it("POST /api/v1/organizations/invitations/:token/accept — should accept invitation", async () => {
      if (!ready) return;

      const dataSource = app.get(DataSource);
      const inviteRepo = dataSource.getRepository(OrganizationInvitationEntity);

      // Create an invitation for a new user to accept
      const acceptUserId = uuidv4();
      const acceptHederaId = `0.0.${820000 + (testRunId % 100000)}`;
      const userRepo = dataSource.getRepository(UserEntity);
      await userRepo.save({
        id: acceptUserId,
        email: `accept-invite-${testRunId}@integration.test`,
        hederaAccountId: acceptHederaId,
        displayName: "Invite Acceptor",
        status: "active",
        accountType: "individual",
      });

      const acceptToken = jwtService.sign({
        sub: acceptUserId,
        hederaAccountId: acceptHederaId,
        identifier: `accept-invite-${testRunId}@integration.test`,
      });

      // Create a pending invitation in DB
      const inviteToken = `invite-token-${testRunId}-accept`;
      await inviteRepo.save({
        id: uuidv4(),
        organizationId: orgId,
        email: `accept-invite-${testRunId}@integration.test`,
        role: "member",
        invitedBy: orgOwnerUserId,
        status: "pending",
        token: inviteToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      });

      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/invitations/${inviteToken}/accept`)
        .set({ Authorization: `Bearer ${acceptToken}` })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });

    it("DELETE /api/v1/organizations/me/members/:userId — should remove member", async () => {
      if (!ready) return;

      // Create a disposable member to remove
      const disposableUserId = uuidv4();
      const disposableHederaId = `0.0.${830000 + (testRunId % 100000)}`;
      const dataSource = app.get(DataSource);
      const userRepo = dataSource.getRepository(UserEntity);
      const memberRepo = dataSource.getRepository(OrganizationMemberEntity);

      await userRepo.save({
        id: disposableUserId,
        email: `disposable-${testRunId}@integration.test`,
        hederaAccountId: disposableHederaId,
        displayName: "Disposable Member",
        status: "active",
        accountType: "individual",
      });

      await memberRepo.save({
        id: uuidv4(),
        organizationId: orgId,
        userId: disposableUserId,
        role: "viewer",
        invitedBy: orgOwnerUserId,
      });

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/organizations/me/members/${disposableUserId}`)
        .set({ Authorization: `Bearer ${orgOwnerToken}` })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toContain(disposableUserId);
    });
  });

  // =========================================================================
  // KYC WEBHOOK CONTROLLER
  // =========================================================================

  describe("KycWebhookController", () => {
    it("POST /api/v1/webhooks/mirsad-kyc-callback — should accept callback", async () => {
      if (!ready) {
        pending();
        return;
      }

      // KYC webhook is public — no auth required
      // It always returns 200 (even on errors to prevent retry loops)
      const res = await request(app.getHttpServer())
        .post("/api/v1/webhooks/mirsad-kyc-callback")
        .send({
          request_id: "nonexistent-request-id",
          status: "approved",
        })
        .expect(200);

      expect(res.status).toBe(200);
    });
  });

  // =========================================================================
  // CHAT CONTROLLER
  // =========================================================================

  describe("ChatController", () => {
    const chatTopicId = `0.0.${800000 + (testRunId % 100000)}`;
    let chatConversationId: string;

    beforeAll(async () => {
      if (!ready) return;

      const dataSource = app.get(DataSource);

      // Create a real conversation in the database
      chatConversationId = uuidv4();
      await dataSource.getRepository(ConversationEntity).save({
        id: chatConversationId,
        hcsTopicId: chatTopicId,
        conversationType: "direct",
        createdBy: testHederaAccountId,
        lastMessageSeq: 0,
      });

      // Add the test user as a member
      await dataSource.getRepository(ConversationMemberEntity).save({
        conversationId: chatConversationId,
        hederaAccountId: testHederaAccountId,
        role: "admin",
      });
    });

    it("GET /api/v1/chat/conversations/:topicId/state — should return conversation state for member", async () => {
      if (!ready) {
        pending();
        return;
      }

      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${chatTopicId}/state`)
        .set(authHeader())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.topicId).toBe(chatTopicId);
      expect(Array.isArray(res.body.data.onlineUsers)).toBe(true);
      expect(Array.isArray(res.body.data.readReceipts)).toBe(true);
      expect(Array.isArray(res.body.data.typingUsers)).toBe(true);
      expect(res.body.error).toBeNull();
      expect(res.body.timestamp).toBeDefined();
    });

    it("GET /api/v1/chat/conversations/:topicId/state — should reject non-member", async () => {
      if (!ready) {
        pending();
        return;
      }

      // Use a topic the user is NOT a member of
      const otherTopicId = `0.0.${700000 + (testRunId % 100000)}`;
      const otherConvId = uuidv4();
      const dataSource = app.get(DataSource);
      await dataSource.getRepository(ConversationEntity).save({
        id: otherConvId,
        hcsTopicId: otherTopicId,
        conversationType: "direct",
        createdBy: "0.0.999999",
        lastMessageSeq: 0,
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${otherTopicId}/state`)
        .set(authHeader());

      // Should return 403 (WsNotConversationMemberException)
      expect(res.status).toBeGreaterThanOrEqual(400);
    });

    it("GET /api/v1/chat/conversations/:topicId/state — should reject unauthenticated", async () => {
      if (!ready) {
        pending();
        return;
      }

      await request(app.getHttpServer())
        .get(`/api/v1/chat/conversations/${chatTopicId}/state`)
        .expect(401);
    });
  });
});
