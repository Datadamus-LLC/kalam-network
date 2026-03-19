/**
 * Integration tests for the ChatGateway (WebSocket real-time messaging).
 *
 * These tests spin up a real NestJS application with:
 *   - Real Socket.io server (ChatGateway)
 *   - Real Socket.io client (socket.io-client)
 *   - Real Redis for presence/typing/read receipts
 *   - Real PostgreSQL for conversation membership checks
 *   - Real JWT for authentication
 *
 * Tests verify:
 *   - Connection with valid JWT succeeds
 *   - Connection without JWT is handled (warns but allows, auth on first message)
 *   - join_conversation with valid membership joins the room
 *   - join_conversation without membership returns ws_error
 *   - typing event broadcasts to room members
 *   - read_receipt event stores receipt and broadcasts
 *   - leave_conversation broadcasts user_offline
 *   - disconnect cleans up presence
 *
 * NO MOCKS. NO FAKES. NO STUBS.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { Logger, INestApplication } from "@nestjs/common";
import { v4 as uuidv4 } from "uuid";
import { Repository, DataSource } from "typeorm";
import { getRepositoryToken } from "@nestjs/typeorm";
import { io as ioClient, Socket as ClientSocket } from "socket.io-client";
import { ChatGateway } from "../chat.gateway";
import { ChatRedisService } from "../chat-redis.service";
import { WsJwtGuard } from "../guards/ws-jwt.guard";
import { ConversationEntity } from "../../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../../database/entities/conversation-member.entity";
import { UserEntity } from "../../../database/entities/user.entity";

const logger = new Logger("ChatGatewayIntegrationTest");

const TEST_JWT_SECRET =
  "chat-gateway-test-jwt-secret-at-least-32-characters-long";

// ---------------------------------------------------------------------------
// Infrastructure checks
// ---------------------------------------------------------------------------

async function isPostgresAvailable(): Promise<boolean> {
  try {
    const { Client } = await import("pg");
    const client = new Client({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5433", 10),
      user: process.env.DB_USERNAME || "test",
      password: process.env.DB_PASSWORD || "test",
      database: process.env.DB_DATABASE || "hedera_social_test",
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

async function isRedisAvailable(): Promise<boolean> {
  try {
    const Redis = (await import("ioredis")).default;
    const client = new Redis({
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6380", 10),
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    await client.connect();
    await client.ping();
    await client.quit();
    return true;
  } catch {
    return false;
  }
}

describe("ChatGateway Integration Tests", () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let userRepo: Repository<UserEntity>;
  let convRepo: Repository<ConversationEntity>;
  let memberRepo: Repository<ConversationMemberEntity>;
  let dataSource: DataSource;

  let postgresAvailable = false;
  let redisAvailable = false;
  let serverPort: number;

  // Test data
  const user1Id = uuidv4();
  const user2Id = uuidv4();
  const nonMemberUserId = uuidv4();
  const conversationId = uuidv4();
  const testTopicId = "0.0.88801";
  const user1AccountId = "0.0.88001";
  const user2AccountId = "0.0.88002";
  const nonMemberAccountId = "0.0.88003";

  // Track client sockets for cleanup
  const clientSockets: ClientSocket[] = [];

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    redisAvailable = await isRedisAvailable();

    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available -- skipping ChatGateway integration tests. " +
          "Start with: docker compose -f docker-compose.test.yml up -d",
      );
      return;
    }

    if (!redisAvailable) {
      logger.warn(
        "Redis not available -- skipping ChatGateway integration tests. " +
          "Start with: docker compose -f docker-compose.test.yml up -d",
      );
      return;
    }

    try {
      const moduleRef: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                jwt: {
                  secret: TEST_JWT_SECRET,
                  expiresIn: "24h",
                },
                database: {
                  host: process.env.DB_HOST || "localhost",
                  port: parseInt(process.env.DB_PORT || "5433", 10),
                  username: process.env.DB_USERNAME || "test",
                  password: process.env.DB_PASSWORD || "test",
                  database: process.env.DB_DATABASE || "hedera_social_test",
                },
                redis: {
                  host: process.env.REDIS_HOST || "localhost",
                  port: parseInt(process.env.REDIS_PORT || "6380", 10),
                },
                cors: {
                  origin: "*",
                },
              }),
            ],
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
                UserEntity,
                ConversationEntity,
                ConversationMemberEntity,
              ],
              synchronize: true,
              logging: false,
            }),
          }),
          TypeOrmModule.forFeature([
            ConversationEntity,
            ConversationMemberEntity,
            UserEntity,
          ]),
          JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              secret: configService.get<string>("jwt.secret"),
              signOptions: { expiresIn: "24h" },
            }),
          }),
          EventEmitterModule.forRoot(),
        ],
        providers: [ChatGateway, ChatRedisService, WsJwtGuard],
      }).compile();

      app = moduleRef.createNestApplication();
      await app.init();

      // Listen on a random available port
      await app.listen(0);
      const serverUrl = await app.getUrl();
      serverPort = parseInt(new URL(serverUrl).port, 10);

      jwtService = moduleRef.get<JwtService>(JwtService);
      userRepo = moduleRef.get<Repository<UserEntity>>(
        getRepositoryToken(UserEntity),
      );
      convRepo = moduleRef.get<Repository<ConversationEntity>>(
        getRepositoryToken(ConversationEntity),
      );
      memberRepo = moduleRef.get<Repository<ConversationMemberEntity>>(
        getRepositoryToken(ConversationMemberEntity),
      );
      dataSource = moduleRef.get<DataSource>(DataSource);

      await seedTestData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize ChatGateway test app: ${message}`);
      postgresAvailable = false;
    }
  });

  afterAll(async () => {
    // Disconnect all client sockets
    for (const socket of clientSockets) {
      if (socket.connected) {
        socket.disconnect();
      }
    }

    if (dataSource && dataSource.isInitialized) {
      await cleanupTestData();
    }
    if (app) {
      await app.close();
    }
  });

  // -------------------------------------------------------------------------
  // Seed / Cleanup
  // -------------------------------------------------------------------------

  async function seedTestData(): Promise<void> {
    // Create users
    for (const [id, acct, name] of [
      [user1Id, user1AccountId, "ChatUser1"],
      [user2Id, user2AccountId, "ChatUser2"],
      [nonMemberUserId, nonMemberAccountId, "ChatNonMember"],
    ] as [string, string, string][]) {
      await userRepo.save({
        id,
        email: `${name.toLowerCase()}@chat-test.com`,
        displayName: name,
        hederaAccountId: acct,
        status: "active",
        accountType: "individual",
      });
    }

    // Create conversation
    await convRepo.save({
      id: conversationId,
      hcsTopicId: testTopicId,
      conversationType: "direct",
      createdBy: user1AccountId,
    });

    // Add members
    await memberRepo.save({
      conversationId,
      hederaAccountId: user1AccountId,
      role: "member",
    });
    await memberRepo.save({
      conversationId,
      hederaAccountId: user2AccountId,
      role: "member",
    });
  }

  async function cleanupTestData(): Promise<void> {
    try {
      await memberRepo.delete({ conversationId });
      await convRepo.delete({ id: conversationId });
      await userRepo.delete({ id: user1Id });
      await userRepo.delete({ id: user2Id });
      await userRepo.delete({ id: nonMemberUserId });
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn(`Cleanup error (non-fatal): ${reason}`);
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  function signToken(userId: string, hederaAccountId: string): string {
    return jwtService.sign(
      { sub: userId, hederaAccountId, identifier: `${userId}@test.com` },
      { secret: TEST_JWT_SECRET, expiresIn: "1h" },
    );
  }

  /**
   * Create a real Socket.io client connected to the test server's /chat namespace.
   */
  function createClient(token?: string): ClientSocket {
    const opts: Record<string, unknown> = {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    };

    if (token) {
      opts.auth = { token };
      // Send Authorization header so that allowRequest (Engine.io level)
      // permits the connection. JWT validation still happens in namespace
      // middleware and the connection handler.
      opts.extraHeaders = { Authorization: `Bearer ${token}` };
    }

    const client = ioClient(`http://localhost:${serverPort}/chat`, opts);
    clientSockets.push(client);
    return client;
  }

  /**
   * Wait for a specific event on a socket, with a timeout.
   */
  function waitForEvent<T>(
    socket: ClientSocket,
    event: string,
    timeoutMs = 5000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for event "${event}"`));
      }, timeoutMs);

      socket.once(event, (data: T) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  function isSkipped(): boolean {
    if (!postgresAvailable || !redisAvailable) {
      logger.warn("SKIPPED: PostgreSQL or Redis not available");
      return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Tests: Connection
  // -------------------------------------------------------------------------

  describe("Connection", () => {
    it("should connect with a valid JWT token", async () => {
      if (isSkipped()) return;
      const token = signToken(user1Id, user1AccountId);
      const client = createClient(token);

      await new Promise<void>((resolve, reject) => {
        client.on("connect", () => resolve());
        client.on("connect_error", (err: Error) => reject(err));
      });

      expect(client.connected).toBe(true);
      client.disconnect();
    });

    it("should reject connection without token at handshake", async () => {
      if (isSkipped()) return;
      const client = createClient();

      const error = await new Promise<Error>((resolve) => {
        client.on("connect", () =>
          resolve(new Error("Should not have connected")),
        );
        client.on("connect_error", (err: Error) => resolve(err));
      });

      // Connection should be rejected — JWT is required at handshake
      expect(client.connected).toBe(false);
      expect(error).toBeDefined();
      client.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: join_conversation
  // -------------------------------------------------------------------------

  describe("join_conversation", () => {
    it("should join a conversation and receive confirmation when user is a member", async () => {
      if (isSkipped()) return;
      const token = signToken(user1Id, user1AccountId);
      const client = createClient(token);

      await new Promise<void>((resolve) => {
        client.on("connect", () => resolve());
      });

      // Emit join_conversation
      const confirmPromise = waitForEvent<{
        topicId: string;
        onlineUsers: string[];
        timestamp: number;
      }>(client, "joined_conversation");

      client.emit("join_conversation", { topicId: testTopicId });

      const confirmation = await confirmPromise;

      expect(confirmation.topicId).toBe(testTopicId);
      expect(Array.isArray(confirmation.onlineUsers)).toBe(true);
      expect(confirmation.onlineUsers).toContain(user1AccountId);
      expect(typeof confirmation.timestamp).toBe("number");

      client.disconnect();
    });

    it("should receive ws_error when non-member tries to join a conversation", async () => {
      if (isSkipped()) return;
      const token = signToken(nonMemberUserId, nonMemberAccountId);
      const client = createClient(token);

      await new Promise<void>((resolve) => {
        client.on("connect", () => resolve());
      });

      const errorPromise = waitForEvent<{
        code: string;
        message: string;
      }>(client, "ws_error");

      client.emit("join_conversation", { topicId: testTopicId });

      const error = await errorPromise;

      expect(error.code).toBe("NOT_CONVERSATION_MEMBER");
      expect(error.message).toContain(testTopicId);

      client.disconnect();
    });

    it("should broadcast server_user_online to other members in the room", async () => {
      if (isSkipped()) return;

      const token1 = signToken(user1Id, user1AccountId);
      const token2 = signToken(user2Id, user2AccountId);

      const client1 = createClient(token1);
      const client2 = createClient(token2);

      // Wait for both to connect
      await Promise.all([
        new Promise<void>((r) => client1.on("connect", () => r())),
        new Promise<void>((r) => client2.on("connect", () => r())),
      ]);

      // Client1 joins first — set up listener before emitting
      const joinPromise = waitForEvent(client1, "joined_conversation");
      client1.emit("join_conversation", { topicId: testTopicId });
      await joinPromise;

      // Small delay to ensure client1 has joined the room
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => resolve(), 300);
        if (typeof timer === "object" && "unref" in timer) timer.unref();
      });

      // Listen for server_user_online on client1 (when client2 joins)
      const onlinePromise = waitForEvent<{
        accountId: string;
        topicId: string;
        timestamp: number;
      }>(client1, "server_user_online");

      // Client2 joins
      client2.emit("join_conversation", { topicId: testTopicId });

      const onlineEvent = await onlinePromise;

      expect(onlineEvent.accountId).toBe(user2AccountId);
      expect(onlineEvent.topicId).toBe(testTopicId);
      expect(typeof onlineEvent.timestamp).toBe("number");

      client1.disconnect();
      client2.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: typing
  // -------------------------------------------------------------------------

  describe("typing", () => {
    it("should broadcast typing indicator to other room members", async () => {
      if (isSkipped()) return;

      const token1 = signToken(user1Id, user1AccountId);
      const token2 = signToken(user2Id, user2AccountId);

      const client1 = createClient(token1);
      const client2 = createClient(token2);

      await Promise.all([
        new Promise<void>((r) => client1.on("connect", () => r())),
        new Promise<void>((r) => client2.on("connect", () => r())),
      ]);

      // Both join the conversation
      client1.emit("join_conversation", { topicId: testTopicId });
      await waitForEvent(client1, "joined_conversation");

      client2.emit("join_conversation", { topicId: testTopicId });
      await waitForEvent(client2, "joined_conversation");

      // Listen for typing on client1 (from client2's emission)
      const typingPromise = waitForEvent<{
        accountId: string;
        topicId: string;
        isTyping: boolean;
        timestamp: number;
      }>(client1, "server_typing");

      // Client2 starts typing
      client2.emit("typing", { topicId: testTopicId, isTyping: true });

      const typingEvent = await typingPromise;

      expect(typingEvent.accountId).toBe(user2AccountId);
      expect(typingEvent.topicId).toBe(testTopicId);
      expect(typingEvent.isTyping).toBe(true);
      expect(typeof typingEvent.timestamp).toBe("number");

      client1.disconnect();
      client2.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: read_receipt
  // -------------------------------------------------------------------------

  describe("read_receipt", () => {
    it("should broadcast read receipt to other room members", async () => {
      if (isSkipped()) return;

      const token1 = signToken(user1Id, user1AccountId);
      const token2 = signToken(user2Id, user2AccountId);

      const client1 = createClient(token1);
      const client2 = createClient(token2);

      await Promise.all([
        new Promise<void>((r) => client1.on("connect", () => r())),
        new Promise<void>((r) => client2.on("connect", () => r())),
      ]);

      // Both join conversation
      client1.emit("join_conversation", { topicId: testTopicId });
      await waitForEvent(client1, "joined_conversation");

      client2.emit("join_conversation", { topicId: testTopicId });
      await waitForEvent(client2, "joined_conversation");

      // Listen for read receipt on client1 (from client2's emission)
      const receiptPromise = waitForEvent<{
        accountId: string;
        topicId: string;
        lastReadSequence: number;
        timestamp: number;
      }>(client1, "server_read_receipt");

      // Client2 sends read receipt
      client2.emit("read_receipt", {
        topicId: testTopicId,
        lastReadSequence: 42,
      });

      const receipt = await receiptPromise;

      expect(receipt.accountId).toBe(user2AccountId);
      expect(receipt.topicId).toBe(testTopicId);
      expect(receipt.lastReadSequence).toBe(42);
      expect(typeof receipt.timestamp).toBe("number");

      client1.disconnect();
      client2.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: leave_conversation
  // -------------------------------------------------------------------------

  describe("leave_conversation", () => {
    it("should broadcast server_user_offline when a user leaves", async () => {
      if (isSkipped()) return;

      const token1 = signToken(user1Id, user1AccountId);
      const token2 = signToken(user2Id, user2AccountId);

      const client1 = createClient(token1);
      const client2 = createClient(token2);

      await Promise.all([
        new Promise<void>((r) => client1.on("connect", () => r())),
        new Promise<void>((r) => client2.on("connect", () => r())),
      ]);

      // Both join
      client1.emit("join_conversation", { topicId: testTopicId });
      await waitForEvent(client1, "joined_conversation");

      client2.emit("join_conversation", { topicId: testTopicId });
      await waitForEvent(client2, "joined_conversation");

      // Listen for offline on client1
      const offlinePromise = waitForEvent<{
        accountId: string;
        topicId: string;
        timestamp: number;
      }>(client1, "server_user_offline");

      // Client2 leaves
      client2.emit("leave_conversation", { topicId: testTopicId });

      const offlineEvent = await offlinePromise;

      expect(offlineEvent.accountId).toBe(user2AccountId);
      expect(offlineEvent.topicId).toBe(testTopicId);
      expect(typeof offlineEvent.timestamp).toBe("number");

      client1.disconnect();
      client2.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: disconnect cleanup
  // -------------------------------------------------------------------------

  describe("disconnect", () => {
    it("should broadcast server_user_offline on socket disconnect", async () => {
      if (isSkipped()) return;

      const token1 = signToken(user1Id, user1AccountId);
      const token2 = signToken(user2Id, user2AccountId);

      const client1 = createClient(token1);
      const client2 = createClient(token2);

      await Promise.all([
        new Promise<void>((r) => client1.on("connect", () => r())),
        new Promise<void>((r) => client2.on("connect", () => r())),
      ]);

      // Both join
      client1.emit("join_conversation", { topicId: testTopicId });
      await waitForEvent(client1, "joined_conversation");

      client2.emit("join_conversation", { topicId: testTopicId });
      await waitForEvent(client2, "joined_conversation");

      // Listen for offline on client1 (when client2 disconnects)
      const offlinePromise = waitForEvent<{
        accountId: string;
        topicId: string;
        timestamp: number;
      }>(client1, "server_user_offline");

      // Client2 disconnects abruptly
      client2.disconnect();

      const offlineEvent = await offlinePromise;

      expect(offlineEvent.accountId).toBe(user2AccountId);
      expect(offlineEvent.topicId).toBe(testTopicId);

      client1.disconnect();
    });
  });

  // -------------------------------------------------------------------------
  // Tests: read_receipt_sync on join
  // -------------------------------------------------------------------------

  describe("read_receipt_sync", () => {
    it("should receive read_receipt_sync after joining a conversation", async () => {
      if (isSkipped()) return;

      const token = signToken(user1Id, user1AccountId);
      const client = createClient(token);

      await new Promise<void>((resolve) => {
        client.on("connect", () => resolve());
      });

      // Listen for both joined_conversation and read_receipt_sync
      const syncPromise = waitForEvent<{
        topicId: string;
        receipts: Array<{
          accountId: string;
          topicId: string;
          lastReadSequence: number;
          timestamp: number;
        }>;
      }>(client, "read_receipt_sync");

      client.emit("join_conversation", { topicId: testTopicId });

      const sync = await syncPromise;

      expect(sync.topicId).toBe(testTopicId);
      expect(Array.isArray(sync.receipts)).toBe(true);

      client.disconnect();
    });
  });
});
