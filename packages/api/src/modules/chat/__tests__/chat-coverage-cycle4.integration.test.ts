/**
 * Chat Module Coverage Cycle 4 — Integration Tests
 *
 * Targets uncovered paths in:
 *   - ChatRedisService: getOnlineAccountIds, createAdapterClient, edge cases
 *   - ChatGateway: getConversationState (public method, no socket needed)
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DataSource, Repository } from "typeorm";
import net from "net";
import { v4 as uuidv4 } from "uuid";

import { ChatRedisService } from "../chat-redis.service";
import { ChatGateway } from "../chat.gateway";
import { RedisService } from "../../redis/redis.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { MessagingService } from "../../messaging/messaging.service";

import { ConversationEntity } from "../../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../../database/entities/conversation-member.entity";
import { MessageIndexEntity } from "../../../database/entities/message-index.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { NotificationEntity } from "../../../database/entities/notification.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import { PaymentIndexEntity } from "../../../database/entities/payment-index.entity";
import { PaymentRequestEntity } from "../../../database/entities/payment-request.entity";
import { TransactionEntity } from "../../../database/entities/transaction.entity";
import { PlatformTopicEntity } from "../../../database/entities/platform-topic.entity";
import { OrganizationEntity } from "../../../database/entities/organization.entity";
import { OrganizationMemberEntity } from "../../../database/entities/organization-member.entity";
import { OrganizationInvitationEntity } from "../../../database/entities/organization-invitation.entity";
import { BusinessProfileEntity } from "../../../database/entities/business-profile.entity";

const logger = new Logger("ChatCoverageCycle4");
const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

const ALL_ENTITIES = [
  ConversationEntity,
  ConversationMemberEntity,
  MessageIndexEntity,
  UserEntity,
  NotificationEntity,
  SocialFollowEntity,
  FollowerCountEntity,
  PostIndexEntity,
  FeedItemEntity,
  PostLikeEntity,
  PostCommentEntity,
  PaymentIndexEntity,
  PaymentRequestEntity,
  TransactionEntity,
  PlatformTopicEntity,
  OrganizationEntity,
  OrganizationMemberEntity,
  OrganizationInvitationEntity,
  BusinessProfileEntity,
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

function uniqueTopicId(): string {
  return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
}

describe("Chat Module Coverage Cycle 4", () => {
  let module: TestingModule;
  let chatRedisService: ChatRedisService;
  let chatGateway: ChatGateway;
  let redisAvailable = false;

  const presenceCleanup: Array<{ topicId: string; accountId: string }> = [];
  const typingCleanup: Array<{ topicId: string; accountId: string }> = [];
  const readReceiptCleanup: Array<{ topicId: string; accountId: string }> = [];

  beforeAll(async () => {
    const [pgReachable, redisReachable] = await Promise.all([
      isPortReachable(TEST_DB_PORT, TEST_DB_HOST),
      isPortReachable(TEST_REDIS_PORT, TEST_REDIS_HOST),
    ]);
    redisAvailable = pgReachable && redisReachable;

    if (!redisAvailable) {
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
                cors: { origin: "*" },
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
          ChatRedisService,
          ChatGateway,
          RedisService,
          HederaService,
          MirrorNodeService,
          MessagingService,
        ],
      }).compile();

      chatRedisService = module.get<ChatRedisService>(ChatRedisService);
      chatGateway = module.get<ChatGateway>(ChatGateway);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      redisAvailable = false;
    }
  });

  afterEach(async () => {
    if (!redisAvailable) return;

    for (const { topicId, accountId } of presenceCleanup) {
      try {
        await chatRedisService.removePresence(topicId, accountId);
      } catch {
        /* best-effort */
      }
    }
    presenceCleanup.length = 0;

    for (const { topicId, accountId } of typingCleanup) {
      try {
        await chatRedisService.clearTyping(topicId, accountId);
      } catch {
        /* best-effort */
      }
    }
    typingCleanup.length = 0;

    // No direct delete API; read receipts auto-expire via TTL
    readReceiptCleanup.length = 0;
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  function skip(): boolean {
    if (!redisAvailable) {
      pending();
      return true;
    }
    return false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // ChatRedisService.getOnlineAccountIds
  // ───────────────────────────────────────────────────────────────────────────

  describe("getOnlineAccountIds", () => {
    it("should return array of account IDs for online users in a topic", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const a1 = uniqueAccountId();
      const a2 = uniqueAccountId();
      const a3 = uniqueAccountId();

      await chatRedisService.setPresence(topicId, a1, "socket-1");
      presenceCleanup.push({ topicId, accountId: a1 });
      await chatRedisService.setPresence(topicId, a2, "socket-2");
      presenceCleanup.push({ topicId, accountId: a2 });
      await chatRedisService.setPresence(topicId, a3, "socket-3");
      presenceCleanup.push({ topicId, accountId: a3 });

      const ids = await chatRedisService.getOnlineAccountIds(topicId);
      expect(ids).toHaveLength(3);
      expect(ids).toContain(a1);
      expect(ids).toContain(a2);
      expect(ids).toContain(a3);
    });

    it("should return empty array when no users online", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const ids = await chatRedisService.getOnlineAccountIds(topicId);
      expect(ids).toEqual([]);
    });

    it("should not include removed users", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const a1 = uniqueAccountId();
      const a2 = uniqueAccountId();

      await chatRedisService.setPresence(topicId, a1, "socket-1");
      presenceCleanup.push({ topicId, accountId: a1 });
      await chatRedisService.setPresence(topicId, a2, "socket-2");
      presenceCleanup.push({ topicId, accountId: a2 });

      await chatRedisService.removePresence(topicId, a1);

      const ids = await chatRedisService.getOnlineAccountIds(topicId);
      expect(ids).toHaveLength(1);
      expect(ids).toContain(a2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ChatRedisService.createAdapterClient
  // ───────────────────────────────────────────────────────────────────────────

  describe("createAdapterClient", () => {
    it("should create a new Redis client instance", async () => {
      if (skip()) return;
      const adapterClient = chatRedisService.createAdapterClient();
      expect(adapterClient).toBeDefined();

      // Verify it can connect to Redis
      await adapterClient.ping();
      const result = await adapterClient.ping();
      expect(result).toBe("PONG");

      await adapterClient.quit();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ChatRedisService — presence overwrite behavior
  // ───────────────────────────────────────────────────────────────────────────

  describe("presence overwrite", () => {
    it("should update presence when user reconnects with new socket", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const accountId = uniqueAccountId();

      await chatRedisService.setPresence(topicId, accountId, "old-socket");
      presenceCleanup.push({ topicId, accountId });

      await chatRedisService.setPresence(topicId, accountId, "new-socket");

      const users = await chatRedisService.getPresenceUsers(topicId);
      expect(users).toHaveLength(1);
      expect(users[0].accountId).toBe(accountId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ChatRedisService — removePresenceBySocketId edge cases
  // ───────────────────────────────────────────────────────────────────────────

  describe("removePresenceBySocketId edge cases", () => {
    it("should return the list of topics the user was removed from", async () => {
      if (skip()) return;
      const t1 = uniqueTopicId();
      const t2 = uniqueTopicId();
      const accountId = uniqueAccountId();
      const socketId = `socket-${uuidv4().slice(0, 8)}`;

      await chatRedisService.setPresence(t1, accountId, socketId);
      presenceCleanup.push({ topicId: t1, accountId });
      await chatRedisService.setPresence(t2, accountId, socketId);
      presenceCleanup.push({ topicId: t2, accountId });

      const removed = await chatRedisService.removePresenceBySocketId(
        socketId,
        accountId,
        [t1, t2],
      );
      expect(removed).toHaveLength(2);
      expect(removed).toContain(t1);
      expect(removed).toContain(t2);

      // Verify users are gone
      const users1 = await chatRedisService.getOnlineAccountIds(t1);
      expect(users1).toHaveLength(0);
    });

    it("should only remove from topics where socket ID matches", async () => {
      if (skip()) return;
      const t1 = uniqueTopicId();
      const accountId = uniqueAccountId();

      await chatRedisService.setPresence(t1, accountId, "different-socket");
      presenceCleanup.push({ topicId: t1, accountId });

      const removed = await chatRedisService.removePresenceBySocketId(
        "non-matching-socket",
        accountId,
        [t1],
      );
      expect(removed).toHaveLength(0);

      // User should still be present
      const users = await chatRedisService.getOnlineAccountIds(t1);
      expect(users).toContain(accountId);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ChatRedisService — typing TTL behavior
  // ───────────────────────────────────────────────────────────────────────────

  describe("typing indicators", () => {
    it("should clear typing and return empty list", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const accountId = uniqueAccountId();

      await chatRedisService.setTyping(topicId, accountId);
      typingCleanup.push({ topicId, accountId });

      let typing = await chatRedisService.getTypingUsers(topicId);
      expect(typing).toContain(accountId);

      await chatRedisService.clearTyping(topicId, accountId);
      typing = await chatRedisService.getTypingUsers(topicId);
      expect(typing).not.toContain(accountId);
    });

    it("should handle clearing a non-typing user gracefully", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const accountId = uniqueAccountId();

      // Clear without ever setting — should not throw
      await chatRedisService.clearTyping(topicId, accountId);

      const typing = await chatRedisService.getTypingUsers(topicId);
      expect(typing).toHaveLength(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ChatRedisService — read receipt parsing
  // ───────────────────────────────────────────────────────────────────────────

  describe("read receipts", () => {
    it("should store and return correct read receipt fields", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const accountId = uniqueAccountId();

      await chatRedisService.setReadReceipt(topicId, accountId, 42);
      readReceiptCleanup.push({ topicId, accountId });

      const receipt = await chatRedisService.getReadReceipt(topicId, accountId);
      expect(receipt).not.toBeNull();
      expect(receipt!.accountId).toBe(accountId);
      expect(receipt!.topicId).toBe(topicId);
      expect(receipt!.lastReadSequence).toBe(42);
      expect(receipt!.timestamp).toBeGreaterThan(0);
    });

    it("should update read receipt when called again with higher sequence", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const accountId = uniqueAccountId();

      await chatRedisService.setReadReceipt(topicId, accountId, 10);
      readReceiptCleanup.push({ topicId, accountId });

      await chatRedisService.setReadReceipt(topicId, accountId, 50);

      const receipt = await chatRedisService.getReadReceipt(topicId, accountId);
      expect(receipt!.lastReadSequence).toBe(50);
    });

    it("should return all receipts for a topic", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const a1 = uniqueAccountId();
      const a2 = uniqueAccountId();

      await chatRedisService.setReadReceipt(topicId, a1, 10);
      readReceiptCleanup.push({ topicId, accountId: a1 });
      await chatRedisService.setReadReceipt(topicId, a2, 20);
      readReceiptCleanup.push({ topicId, accountId: a2 });

      const all = await chatRedisService.getAllReadReceipts(topicId);
      expect(all).toHaveLength(2);
      expect(all.map((r) => r.accountId)).toContain(a1);
      expect(all.map((r) => r.accountId)).toContain(a2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // ChatGateway.getConversationState
  // ───────────────────────────────────────────────────────────────────────────

  describe("ChatGateway.getConversationState", () => {
    it("should return combined presence, read receipts, and typing data", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();
      const a1 = uniqueAccountId();
      const a2 = uniqueAccountId();

      // Set up presence
      await chatRedisService.setPresence(topicId, a1, "socket-a1");
      presenceCleanup.push({ topicId, accountId: a1 });

      // Set up typing
      await chatRedisService.setTyping(topicId, a2);
      typingCleanup.push({ topicId, accountId: a2 });

      // Set up read receipt
      await chatRedisService.setReadReceipt(topicId, a1, 100);
      readReceiptCleanup.push({ topicId, accountId: a1 });

      const state = await chatGateway.getConversationState(topicId);
      expect(state.topicId).toBe(topicId);
      expect(state.onlineUsers).toHaveLength(1);
      expect(state.onlineUsers[0].accountId).toBe(a1);
      expect(state.typingUsers).toContain(a2);
      expect(state.readReceipts).toHaveLength(1);
      expect(state.readReceipts[0].lastReadSequence).toBe(100);
    });

    it("should return empty state for a topic with no activity", async () => {
      if (skip()) return;
      const topicId = uniqueTopicId();

      const state = await chatGateway.getConversationState(topicId);
      expect(state.topicId).toBe(topicId);
      expect(state.onlineUsers).toHaveLength(0);
      expect(state.typingUsers).toHaveLength(0);
      expect(state.readReceipts).toHaveLength(0);
    });
  });
});
