/**
 * ChatRedisService Integration Tests
 *
 * Tests all presence, typing, and read-receipt methods against REAL Redis on localhost:6380.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against a real Redis instance.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import net from "net";
import { ChatRedisService } from "../chat-redis.service";

const logger = new Logger("ChatRedisServiceIntegrationTest");

async function isRedisAvailable(): Promise<boolean> {
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
    socket.connect(6380, "localhost");
  });
}

describe("ChatRedisService Integration", () => {
  let module: TestingModule;
  let service: ChatRedisService;
  let redisAvailable: boolean;

  const TEST_TOPIC = `test:topic:${Date.now()}`;
  const TEST_ACCOUNT_1 = `0.0.${Date.now()}1`;
  const TEST_ACCOUNT_2 = `0.0.${Date.now()}2`;
  const TEST_ACCOUNT_3 = `0.0.${Date.now()}3`;
  const TEST_SOCKET_1 = `socket-${Date.now()}-1`;
  const TEST_SOCKET_2 = `socket-${Date.now()}-2`;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    if (!redisAvailable) {
      logger.warn("Redis not available on port 6380 — tests will be skipped");
      return;
    }

    process.env.REDIS_HOST = "localhost";
    process.env.REDIS_PORT = "6380";

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              redis: { host: "localhost", port: 6380 },
            }),
          ],
        }),
      ],
      providers: [ChatRedisService],
    }).compile();

    service = module.get(ChatRedisService);

    // Wait for Redis connection
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  // ---------------------------------------------------------------------------
  // Presence
  // ---------------------------------------------------------------------------

  describe("Presence tracking", () => {
    it("should set and get presence for a user in a conversation", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      await service.setPresence(TEST_TOPIC, TEST_ACCOUNT_1, TEST_SOCKET_1);

      const users = await service.getPresenceUsers(TEST_TOPIC);
      expect(users.length).toBeGreaterThanOrEqual(1);

      const found = users.find((u) => u.accountId === TEST_ACCOUNT_1);
      expect(found).toBeDefined();
      expect(found!.joinedAt).toBeGreaterThan(0);
    });

    it("should return online account IDs", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      await service.setPresence(TEST_TOPIC, TEST_ACCOUNT_1, TEST_SOCKET_1);
      await service.setPresence(TEST_TOPIC, TEST_ACCOUNT_2, TEST_SOCKET_2);

      const ids = await service.getOnlineAccountIds(TEST_TOPIC);
      expect(ids).toContain(TEST_ACCOUNT_1);
      expect(ids).toContain(TEST_ACCOUNT_2);
    });

    it("should remove presence for a user", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      await service.setPresence(
        TEST_TOPIC,
        TEST_ACCOUNT_3,
        `socket-${Date.now()}`,
      );
      await service.removePresence(TEST_TOPIC, TEST_ACCOUNT_3);

      const ids = await service.getOnlineAccountIds(TEST_TOPIC);
      expect(ids).not.toContain(TEST_ACCOUNT_3);
    });

    it("should remove presence by socket ID only for matching socket", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topicA = `test:topic:socketclean:${Date.now()}:a`;
      const topicB = `test:topic:socketclean:${Date.now()}:b`;
      const socketId = `socket-cleanup-${Date.now()}`;
      const accountId = `0.0.${Date.now()}cleanup`;

      // Set presence in two topics
      await service.setPresence(topicA, accountId, socketId);
      await service.setPresence(topicB, accountId, socketId);

      // Remove by socketId
      const removedFrom = await service.removePresenceBySocketId(
        socketId,
        accountId,
        [topicA, topicB],
      );

      expect(removedFrom).toContain(topicA);
      expect(removedFrom).toContain(topicB);

      // Verify removed
      const idsA = await service.getOnlineAccountIds(topicA);
      expect(idsA).not.toContain(accountId);
    });

    it("should not remove presence when socket ID does not match", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:nomatch:${Date.now()}`;
      const accountId = `0.0.${Date.now()}nomatch`;
      const realSocket = `socket-real-${Date.now()}`;
      const wrongSocket = `socket-wrong-${Date.now()}`;

      await service.setPresence(topic, accountId, realSocket);

      // Try to remove with wrong socket ID
      const removedFrom = await service.removePresenceBySocketId(
        wrongSocket,
        accountId,
        [topic],
      );

      expect(removedFrom).toHaveLength(0);

      // Should still be present
      const ids = await service.getOnlineAccountIds(topic);
      expect(ids).toContain(accountId);

      // Cleanup
      await service.removePresence(topic, accountId);
    });

    it("should return empty list for topic with no presence entries", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const emptyTopic = `test:topic:empty:${Date.now()}`;
      const users = await service.getPresenceUsers(emptyTopic);
      expect(users).toEqual([]);

      const ids = await service.getOnlineAccountIds(emptyTopic);
      expect(ids).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Typing indicators
  // ---------------------------------------------------------------------------

  describe("Typing indicators", () => {
    it("should set typing indicator", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:typing:${Date.now()}`;
      await service.setTyping(topic, TEST_ACCOUNT_1);

      const typingUsers = await service.getTypingUsers(topic);
      expect(typingUsers).toContain(TEST_ACCOUNT_1);
    });

    it("should clear typing indicator", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:typing:clear:${Date.now()}`;
      await service.setTyping(topic, TEST_ACCOUNT_1);
      await service.clearTyping(topic, TEST_ACCOUNT_1);

      const typingUsers = await service.getTypingUsers(topic);
      expect(typingUsers).not.toContain(TEST_ACCOUNT_1);
    });

    it("should track multiple typing users", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:typing:multi:${Date.now()}`;
      await service.setTyping(topic, TEST_ACCOUNT_1);
      await service.setTyping(topic, TEST_ACCOUNT_2);

      const typingUsers = await service.getTypingUsers(topic);
      expect(typingUsers).toContain(TEST_ACCOUNT_1);
      expect(typingUsers).toContain(TEST_ACCOUNT_2);

      // Clear one
      await service.clearTyping(topic, TEST_ACCOUNT_1);
      const afterClear = await service.getTypingUsers(topic);
      expect(afterClear).not.toContain(TEST_ACCOUNT_1);
      expect(afterClear).toContain(TEST_ACCOUNT_2);
    });

    it("should return empty array when no one is typing", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:typing:none:${Date.now()}`;
      const typingUsers = await service.getTypingUsers(topic);
      expect(typingUsers).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Read receipts
  // ---------------------------------------------------------------------------

  describe("Read receipts", () => {
    it("should set and get a read receipt", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:read:${Date.now()}`;
      await service.setReadReceipt(topic, TEST_ACCOUNT_1, 42);

      const receipt = await service.getReadReceipt(topic, TEST_ACCOUNT_1);
      expect(receipt).not.toBeNull();
      expect(receipt!.accountId).toBe(TEST_ACCOUNT_1);
      expect(receipt!.topicId).toBe(topic);
      expect(receipt!.lastReadSequence).toBe(42);
      expect(receipt!.timestamp).toBeGreaterThan(0);
    });

    it("should return null for missing read receipt", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:read:missing:${Date.now()}`;
      const receipt = await service.getReadReceipt(topic, "0.0.nonexistent");
      expect(receipt).toBeNull();
    });

    it("should get all read receipts for a conversation", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:read:all:${Date.now()}`;
      await service.setReadReceipt(topic, TEST_ACCOUNT_1, 10);
      await service.setReadReceipt(topic, TEST_ACCOUNT_2, 20);

      const receipts = await service.getAllReadReceipts(topic);
      expect(receipts).toHaveLength(2);

      const r1 = receipts.find((r) => r.accountId === TEST_ACCOUNT_1);
      const r2 = receipts.find((r) => r.accountId === TEST_ACCOUNT_2);
      expect(r1).toBeDefined();
      expect(r1!.lastReadSequence).toBe(10);
      expect(r2).toBeDefined();
      expect(r2!.lastReadSequence).toBe(20);
    });

    it("should return empty array when no read receipts exist", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:read:empty:${Date.now()}`;
      const receipts = await service.getAllReadReceipts(topic);
      expect(receipts).toEqual([]);
    });

    it("should update read receipt when set again with higher sequence", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = `test:topic:read:update:${Date.now()}`;
      await service.setReadReceipt(topic, TEST_ACCOUNT_1, 10);
      await service.setReadReceipt(topic, TEST_ACCOUNT_1, 25);

      const receipt = await service.getReadReceipt(topic, TEST_ACCOUNT_1);
      expect(receipt).not.toBeNull();
      expect(receipt!.lastReadSequence).toBe(25);
    });
  });

  // ---------------------------------------------------------------------------
  // Adapter client
  // ---------------------------------------------------------------------------

  describe("createAdapterClient", () => {
    it("should create a new Redis client instance", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const client = service.createAdapterClient();
      expect(client).toBeDefined();

      // Verify it's a real ioredis instance by calling a command
      const pong = await client.ping();
      expect(pong).toBe("PONG");

      await client.quit();
    });
  });
});
