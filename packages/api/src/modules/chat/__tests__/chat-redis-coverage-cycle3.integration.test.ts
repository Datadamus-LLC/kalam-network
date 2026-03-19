/**
 * ChatRedisService Coverage Cycle 3 — Integration Tests
 *
 * Targets uncovered paths in chat-redis.service.ts (70.19% -> 85%):
 *   - setPresence() / removePresence() — set and verify presence data
 *   - getPresenceUsers() — retrieve presence list for a topic
 *   - setTyping() / clearTyping() / getTypingUsers() — typing indicators
 *   - setReadReceipt() / getReadReceipt() / getAllReadReceipts() — read receipts
 *   - removePresenceBySocketId() — clean up all topics for a disconnected socket
 *
 * Prerequisites:
 *   - Redis running on localhost:6380
 *   - Start with: docker compose -f docker-compose.test.yml up -d
 *
 * NO MOCKS. NO FAKES. NO STUBS. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import net from "net";
import { ChatRedisService } from "../chat-redis.service";

const logger = new Logger("ChatRedisCoverageCycle3Test");

const TEST_REDIS_PORT = 6380;

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
    socket.connect(TEST_REDIS_PORT, "localhost");
  });
}

describe("ChatRedisService Coverage Cycle 3", () => {
  let module: TestingModule;
  let service: ChatRedisService;
  let redisAvailable: boolean;

  /** Generate unique test IDs to avoid collisions across parallel runs */
  const testPrefix = `c3-${Date.now()}`;
  const uniqueTopic = (suffix: string): string =>
    `test:topic:${testPrefix}:${suffix}`;
  const uniqueAccount = (suffix: string): string =>
    `0.0.${testPrefix.replace(/\D/g, "").slice(0, 6)}${suffix}`;
  const uniqueSocket = (suffix: string): string =>
    `sock-${testPrefix}-${suffix}`;

  beforeAll(async () => {
    redisAvailable = await isRedisAvailable();
    if (!redisAvailable) {
      logger.warn(
        `Redis not available on port ${TEST_REDIS_PORT} — tests will be skipped. ` +
          "Start with: docker compose -f docker-compose.test.yml up -d",
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
                redis: { host: "localhost", port: TEST_REDIS_PORT },
              }),
            ],
          }),
        ],
        providers: [ChatRedisService],
      }).compile();

      service = module.get(ChatRedisService);

      // Allow Redis connection to establish
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test module: ${message}`);
      redisAvailable = false;
    }
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  // ---------------------------------------------------------------------------
  // setPresence() / removePresence() — set and verify presence data
  // ---------------------------------------------------------------------------

  describe("setPresence and removePresence", () => {
    it("should set presence and store socketId and joinedAt in Redis hash", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("presence-set");
      const account = uniqueAccount("100");
      const socket = uniqueSocket("100");

      await service.setPresence(topic, account, socket);

      // Verify via getPresenceUsers
      const users = await service.getPresenceUsers(topic);
      expect(users.length).toBe(1);
      expect(users[0].accountId).toBe(account);
      expect(users[0].joinedAt).toBeGreaterThan(0);
      expect(typeof users[0].joinedAt).toBe("number");

      // Cleanup
      await service.removePresence(topic, account);
    });

    it("should remove presence so user no longer appears in presence list", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("presence-remove");
      const account = uniqueAccount("101");
      const socket = uniqueSocket("101");

      await service.setPresence(topic, account, socket);

      // Confirm present
      const beforeRemove = await service.getOnlineAccountIds(topic);
      expect(beforeRemove).toContain(account);

      // Remove
      await service.removePresence(topic, account);

      // Confirm absent
      const afterRemove = await service.getOnlineAccountIds(topic);
      expect(afterRemove).not.toContain(account);

      // getPresenceUsers should also not include the user
      const usersAfter = await service.getPresenceUsers(topic);
      const found = usersAfter.find((u) => u.accountId === account);
      expect(found).toBeUndefined();
    });

    it("should overwrite presence when called again for the same user", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("presence-overwrite");
      const account = uniqueAccount("102");
      const socket1 = uniqueSocket("102a");
      const socket2 = uniqueSocket("102b");

      await service.setPresence(topic, account, socket1);
      const usersBefore = await service.getPresenceUsers(topic);
      const joinedBefore = usersBefore.find(
        (u) => u.accountId === account,
      )!.joinedAt;

      // Overwrite with a new socket
      await service.setPresence(topic, account, socket2);

      const usersAfter = await service.getPresenceUsers(topic);
      expect(usersAfter.length).toBe(1);
      expect(usersAfter[0].accountId).toBe(account);
      // joinedAt should be updated (new timestamp)
      expect(usersAfter[0].joinedAt).toBeGreaterThanOrEqual(joinedBefore);

      // Cleanup
      await service.removePresence(topic, account);
    });
  });

  // ---------------------------------------------------------------------------
  // getPresenceUsers() — retrieve presence list for a topic
  // ---------------------------------------------------------------------------

  describe("getPresenceUsers", () => {
    it("should return all present users with accountId and joinedAt", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("presence-list");
      const account1 = uniqueAccount("201");
      const account2 = uniqueAccount("202");
      const account3 = uniqueAccount("203");

      await service.setPresence(topic, account1, uniqueSocket("201"));
      await service.setPresence(topic, account2, uniqueSocket("202"));
      await service.setPresence(topic, account3, uniqueSocket("203"));

      const users = await service.getPresenceUsers(topic);
      expect(users.length).toBe(3);

      const accountIds = users.map((u) => u.accountId);
      expect(accountIds).toContain(account1);
      expect(accountIds).toContain(account2);
      expect(accountIds).toContain(account3);

      // Each user should have a valid joinedAt timestamp
      for (const user of users) {
        expect(user.joinedAt).toBeGreaterThan(0);
      }

      // Cleanup
      await service.removePresence(topic, account1);
      await service.removePresence(topic, account2);
      await service.removePresence(topic, account3);
    });

    it("should return empty array for topic with no presence", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("presence-empty");
      const users = await service.getPresenceUsers(topic);
      expect(users).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // setTyping() / clearTyping() / getTypingUsers() — typing indicators
  // ---------------------------------------------------------------------------

  describe("setTyping, clearTyping, getTypingUsers", () => {
    it("should set typing and retrieve the user from typing list", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("typing-set");
      const account = uniqueAccount("300");

      await service.setTyping(topic, account);

      const typingUsers = await service.getTypingUsers(topic);
      expect(typingUsers).toContain(account);
    });

    it("should clear typing so user no longer appears in typing list", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("typing-clear");
      const account = uniqueAccount("301");

      await service.setTyping(topic, account);
      const beforeClear = await service.getTypingUsers(topic);
      expect(beforeClear).toContain(account);

      await service.clearTyping(topic, account);
      const afterClear = await service.getTypingUsers(topic);
      expect(afterClear).not.toContain(account);
    });

    it("should track multiple users typing independently", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("typing-multi");
      const account1 = uniqueAccount("302");
      const account2 = uniqueAccount("303");
      const account3 = uniqueAccount("304");

      await service.setTyping(topic, account1);
      await service.setTyping(topic, account2);
      await service.setTyping(topic, account3);

      const allTyping = await service.getTypingUsers(topic);
      expect(allTyping).toContain(account1);
      expect(allTyping).toContain(account2);
      expect(allTyping).toContain(account3);

      // Clear one — others should remain
      await service.clearTyping(topic, account2);
      const afterClear = await service.getTypingUsers(topic);
      expect(afterClear).toContain(account1);
      expect(afterClear).not.toContain(account2);
      expect(afterClear).toContain(account3);

      // Clear all
      await service.clearTyping(topic, account1);
      await service.clearTyping(topic, account3);
    });

    it("should return empty array when no users are typing", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("typing-none");
      const typingUsers = await service.getTypingUsers(topic);
      expect(typingUsers).toEqual([]);
    });

    it("should allow clearing a user who is not typing without error", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("typing-clear-absent");
      const account = uniqueAccount("305");

      // Should not throw when clearing a non-existent typing entry
      await service.clearTyping(topic, account);

      const typingUsers = await service.getTypingUsers(topic);
      expect(typingUsers).not.toContain(account);
    });
  });

  // ---------------------------------------------------------------------------
  // setReadReceipt() / getReadReceipt() / getAllReadReceipts() — read receipts
  // ---------------------------------------------------------------------------

  describe("setReadReceipt, getReadReceipt, getAllReadReceipts", () => {
    it("should store and retrieve a read receipt with correct fields", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("read-set");
      const account = uniqueAccount("400");

      await service.setReadReceipt(topic, account, 55);

      const receipt = await service.getReadReceipt(topic, account);
      expect(receipt).not.toBeNull();
      expect(receipt!.accountId).toBe(account);
      expect(receipt!.topicId).toBe(topic);
      expect(receipt!.lastReadSequence).toBe(55);
      expect(receipt!.timestamp).toBeGreaterThan(0);
    });

    it("should return null for a user with no read receipt", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("read-missing");
      const receipt = await service.getReadReceipt(
        topic,
        "0.0.999999nonexistent",
      );
      expect(receipt).toBeNull();
    });

    it("should update read receipt when set again with higher sequence number", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("read-update");
      const account = uniqueAccount("401");

      await service.setReadReceipt(topic, account, 10);
      const first = await service.getReadReceipt(topic, account);
      expect(first).not.toBeNull();
      expect(first!.lastReadSequence).toBe(10);

      await service.setReadReceipt(topic, account, 50);
      const second = await service.getReadReceipt(topic, account);
      expect(second).not.toBeNull();
      expect(second!.lastReadSequence).toBe(50);
      expect(second!.timestamp).toBeGreaterThanOrEqual(first!.timestamp);
    });

    it("should get all read receipts for a conversation", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("read-all");
      const account1 = uniqueAccount("402");
      const account2 = uniqueAccount("403");
      const account3 = uniqueAccount("404");

      await service.setReadReceipt(topic, account1, 5);
      await service.setReadReceipt(topic, account2, 12);
      await service.setReadReceipt(topic, account3, 20);

      const receipts = await service.getAllReadReceipts(topic);
      expect(receipts.length).toBe(3);

      const r1 = receipts.find((r) => r.accountId === account1);
      const r2 = receipts.find((r) => r.accountId === account2);
      const r3 = receipts.find((r) => r.accountId === account3);

      expect(r1).toBeDefined();
      expect(r1!.lastReadSequence).toBe(5);
      expect(r1!.topicId).toBe(topic);

      expect(r2).toBeDefined();
      expect(r2!.lastReadSequence).toBe(12);

      expect(r3).toBeDefined();
      expect(r3!.lastReadSequence).toBe(20);
    });

    it("should return empty array when no read receipts exist for a topic", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("read-empty");
      const receipts = await service.getAllReadReceipts(topic);
      expect(receipts).toEqual([]);
    });

    it("should handle sequence number 1 (minimum valid value)", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("read-min");
      const account = uniqueAccount("405");

      await service.setReadReceipt(topic, account, 1);

      const receipt = await service.getReadReceipt(topic, account);
      expect(receipt).not.toBeNull();
      expect(receipt!.lastReadSequence).toBe(1);
    });

    it("should handle large sequence numbers", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("read-large");
      const account = uniqueAccount("406");

      await service.setReadReceipt(topic, account, 999999999);

      const receipt = await service.getReadReceipt(topic, account);
      expect(receipt).not.toBeNull();
      expect(receipt!.lastReadSequence).toBe(999999999);
    });
  });

  // ---------------------------------------------------------------------------
  // removePresenceBySocketId() — clean up all topics for a disconnected socket
  // ---------------------------------------------------------------------------

  describe("removePresenceBySocketId", () => {
    it("should remove presence from all tracked topics matching the socket ID", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topicA = uniqueTopic("socketclean-a");
      const topicB = uniqueTopic("socketclean-b");
      const topicC = uniqueTopic("socketclean-c");
      const account = uniqueAccount("500");
      const socket = uniqueSocket("500");

      // Set presence in 3 topics with the same socket
      await service.setPresence(topicA, account, socket);
      await service.setPresence(topicB, account, socket);
      await service.setPresence(topicC, account, socket);

      // Verify all 3 are present
      expect(await service.getOnlineAccountIds(topicA)).toContain(account);
      expect(await service.getOnlineAccountIds(topicB)).toContain(account);
      expect(await service.getOnlineAccountIds(topicC)).toContain(account);

      // Remove by socket ID
      const removedFrom = await service.removePresenceBySocketId(
        socket,
        account,
        [topicA, topicB, topicC],
      );

      expect(removedFrom).toHaveLength(3);
      expect(removedFrom).toContain(topicA);
      expect(removedFrom).toContain(topicB);
      expect(removedFrom).toContain(topicC);

      // Verify all removed
      expect(await service.getOnlineAccountIds(topicA)).not.toContain(account);
      expect(await service.getOnlineAccountIds(topicB)).not.toContain(account);
      expect(await service.getOnlineAccountIds(topicC)).not.toContain(account);
    });

    it("should not remove presence when socket ID does not match", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("socketclean-nomatch");
      const account = uniqueAccount("501");
      const realSocket = uniqueSocket("501-real");
      const wrongSocket = uniqueSocket("501-wrong");

      await service.setPresence(topic, account, realSocket);

      // Attempt removal with wrong socket
      const removedFrom = await service.removePresenceBySocketId(
        wrongSocket,
        account,
        [topic],
      );

      expect(removedFrom).toHaveLength(0);

      // User should still be present
      const ids = await service.getOnlineAccountIds(topic);
      expect(ids).toContain(account);

      // Cleanup
      await service.removePresence(topic, account);
    });

    it("should return empty array when topics list is empty", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const removedFrom = await service.removePresenceBySocketId(
        uniqueSocket("502"),
        uniqueAccount("502"),
        [],
      );

      expect(removedFrom).toEqual([]);
    });

    it("should handle mixed matching and non-matching topics", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topicMatch1 = uniqueTopic("socketmix-match1");
      const topicMatch2 = uniqueTopic("socketmix-match2");
      const topicNoMatch = uniqueTopic("socketmix-nomatch");
      const account = uniqueAccount("503");
      const socket = uniqueSocket("503");
      const otherSocket = uniqueSocket("503-other");

      // Set presence with our socket in 2 topics
      await service.setPresence(topicMatch1, account, socket);
      await service.setPresence(topicMatch2, account, socket);
      // Set presence with a different socket in 1 topic
      await service.setPresence(topicNoMatch, account, otherSocket);

      const removedFrom = await service.removePresenceBySocketId(
        socket,
        account,
        [topicMatch1, topicMatch2, topicNoMatch],
      );

      // Should only remove from matching topics
      expect(removedFrom).toHaveLength(2);
      expect(removedFrom).toContain(topicMatch1);
      expect(removedFrom).toContain(topicMatch2);
      expect(removedFrom).not.toContain(topicNoMatch);

      // Non-matching topic should still have the user
      const idsNoMatch = await service.getOnlineAccountIds(topicNoMatch);
      expect(idsNoMatch).toContain(account);

      // Cleanup
      await service.removePresence(topicNoMatch, account);
    });

    it("should handle topics where user has no presence entry", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topicPresent = uniqueTopic("socketclean-present");
      const topicAbsent = uniqueTopic("socketclean-absent");
      const account = uniqueAccount("504");
      const socket = uniqueSocket("504");

      // Only set presence in one topic
      await service.setPresence(topicPresent, account, socket);

      const removedFrom = await service.removePresenceBySocketId(
        socket,
        account,
        [topicPresent, topicAbsent],
      );

      // Should only report removal from the topic where user was present
      expect(removedFrom).toHaveLength(1);
      expect(removedFrom).toContain(topicPresent);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-concern: presence + typing + read receipts for the same topic
  // ---------------------------------------------------------------------------

  describe("cross-concern: all features in one topic", () => {
    it("should independently manage presence, typing, and read receipts", async () => {
      if (!redisAvailable) {
        pending();
        return;
      }

      const topic = uniqueTopic("cross-concern");
      const account1 = uniqueAccount("600");
      const account2 = uniqueAccount("601");

      // Set presence for both users
      await service.setPresence(topic, account1, uniqueSocket("600"));
      await service.setPresence(topic, account2, uniqueSocket("601"));

      // Set typing for account1 only
      await service.setTyping(topic, account1);

      // Set read receipts for both
      await service.setReadReceipt(topic, account1, 15);
      await service.setReadReceipt(topic, account2, 22);

      // Verify presence
      const presenceUsers = await service.getPresenceUsers(topic);
      expect(presenceUsers.length).toBe(2);

      // Verify typing
      const typingUsers = await service.getTypingUsers(topic);
      expect(typingUsers).toContain(account1);
      expect(typingUsers).not.toContain(account2);

      // Verify read receipts
      const receipts = await service.getAllReadReceipts(topic);
      expect(receipts.length).toBe(2);
      const r1 = receipts.find((r) => r.accountId === account1);
      expect(r1!.lastReadSequence).toBe(15);
      const r2 = receipts.find((r) => r.accountId === account2);
      expect(r2!.lastReadSequence).toBe(22);

      // Remove presence for account1 — should not affect typing or read receipts
      await service.removePresence(topic, account1);

      const presenceAfter = await service.getOnlineAccountIds(topic);
      expect(presenceAfter).not.toContain(account1);
      expect(presenceAfter).toContain(account2);

      // Typing should still show account1 (separate key namespace)
      const typingAfter = await service.getTypingUsers(topic);
      expect(typingAfter).toContain(account1);

      // Read receipt should still exist
      const receiptAfter = await service.getReadReceipt(topic, account1);
      expect(receiptAfter).not.toBeNull();
      expect(receiptAfter!.lastReadSequence).toBe(15);

      // Cleanup
      await service.removePresence(topic, account2);
      await service.clearTyping(topic, account1);
    });
  });
});
