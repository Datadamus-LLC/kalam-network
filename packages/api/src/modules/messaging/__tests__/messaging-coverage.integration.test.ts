/**
 * Messaging Module — Additional Coverage Tests
 *
 * Targets uncovered paths in:
 *   - MessagingService.getMessages() pagination (lines 216-272)
 *   - ConversationsService.getUserConversations() pagination edge cases
 *   - Message DB operations and edge cases
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *   PostgreSQL on port 5433
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import net from "net";
import { ConversationEntity } from "../../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../../database/entities/conversation-member.entity";
import { MessageIndexEntity } from "../../../database/entities/message-index.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { ConversationsService } from "../conversations.service";
import { MessagingService } from "../messaging.service";
import { HederaModule } from "../../hedera/hedera.module";
import { ConversationTopicNotFoundException } from "../exceptions/message.exceptions";

const logger = new Logger("MessagingCoverageIntegrationTest");

const TEST_DB_PORT = 5433;

async function isPostgresAvailable(): Promise<boolean> {
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
    socket.on("error", () => resolve(false));
    socket.connect(TEST_DB_PORT, "localhost");
  });
}

function uniqueAccountId(): string {
  return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
}

function uniqueTopicId(): string {
  return `0.0.${800000 + Math.floor(Math.random() * 99999)}`;
}

describe("Messaging — Additional Coverage Tests", () => {
  let module: TestingModule;
  let messagingService: MessagingService;
  let conversationsService: ConversationsService;
  let conversationRepo: Repository<ConversationEntity>;
  let memberRepo: Repository<ConversationMemberEntity>;
  let messageRepo: Repository<MessageIndexEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;

  const createdConversationIds: string[] = [];
  const createdMessageIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestUser(accountId?: string): Promise<UserEntity> {
    const hederaId = accountId ?? uniqueAccountId();
    const user = userRepo.create({
      displayName: `MsgCov_${hederaId}`,
      email: `msgcov-${Date.now()}-${Math.floor(Math.random() * 10000)}@test.io`,
      hederaAccountId: hederaId,
      status: "active",
    });
    const saved = await userRepo.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  async function createTestConversation(
    creatorAccountId: string,
    memberAccountIds: string[],
    topicId?: string,
  ): Promise<ConversationEntity> {
    const convId = uuidv4();
    const hcsTopic = topicId ?? uniqueTopicId();
    createdConversationIds.push(convId);

    const conversation = conversationRepo.create({
      id: convId,
      hcsTopicId: hcsTopic,
      conversationType: memberAccountIds.length > 1 ? "group" : "direct",
      createdBy: creatorAccountId,
      lastMessageSeq: 0,
    });
    await conversationRepo.save(conversation);

    // Add creator as admin
    const creatorMember = memberRepo.create({
      conversationId: convId,
      hederaAccountId: creatorAccountId,
      role: "admin",
      leftAt: null,
      lastReadSeq: 0,
    });
    await memberRepo.save(creatorMember);

    // Add other members
    for (const accountId of memberAccountIds) {
      if (accountId === creatorAccountId) continue;
      const m = memberRepo.create({
        conversationId: convId,
        hederaAccountId: accountId,
        role: "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await memberRepo.save(m);
    }

    return conversation;
  }

  async function insertMessage(
    topicId: string,
    senderAccountId: string,
    sequenceNumber: number,
  ): Promise<MessageIndexEntity> {
    const msgId = uuidv4();
    createdMessageIds.push(msgId);

    const msg = messageRepo.create({
      id: msgId,
      hcsTopicId: topicId,
      sequenceNumber,
      consensusTimestamp: new Date(Date.now() - (100 - sequenceNumber) * 1000),
      senderAccountId,
      messageType: "message",
      encryptedPreview: null,
      hasMedia: false,
    });
    return messageRepo.save(msg);
  }

  async function cleanupAll(): Promise<void> {
    try {
      if (createdMessageIds.length > 0) {
        await messageRepo
          .createQueryBuilder()
          .delete()
          .from(MessageIndexEntity)
          .where("id IN (:...ids)", { ids: [...createdMessageIds] })
          .execute();
      }
      for (const convId of createdConversationIds) {
        try {
          await memberRepo.delete({ conversationId: convId });
        } catch {
          /* best-effort */
        }
      }
      if (createdConversationIds.length > 0) {
        await conversationRepo
          .createQueryBuilder()
          .delete()
          .from(ConversationEntity)
          .where("id IN (:...ids)", { ids: [...createdConversationIds] })
          .execute();
      }
      if (createdUserIds.length > 0) {
        await userRepo
          .createQueryBuilder()
          .delete()
          .from(UserEntity)
          .where("id IN (:...ids)", { ids: [...createdUserIds] })
          .execute();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Cleanup failed: ${message}`);
    }
  }

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    logger.log(`PostgreSQL(:${TEST_DB_PORT}): ${postgresAvailable}`);

    if (!postgresAvailable) {
      logger.warn("PostgreSQL not available — tests skipped");
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
                  host: "localhost",
                  port: TEST_DB_PORT,
                  username: "test",
                  password: "test",
                  database: "hedera_social_test",
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
              }),
            ],
          }),
          TypeOrmModule.forRoot({
            type: "postgres",
            host: "localhost",
            port: TEST_DB_PORT,
            username: "test",
            password: "test",
            database: "hedera_social_test",
            entities: [
              ConversationEntity,
              ConversationMemberEntity,
              MessageIndexEntity,
              UserEntity,
            ],
            synchronize: true,
            logging: false,
          }),
          TypeOrmModule.forFeature([
            ConversationEntity,
            ConversationMemberEntity,
            MessageIndexEntity,
            UserEntity,
          ]),
          JwtModule.register({
            secret:
              "test-jwt-secret-key-minimum-32-characters-long-for-testing",
          }),
          HederaModule,
        ],
        providers: [ConversationsService, MessagingService],
      }).compile();

      conversationsService =
        module.get<ConversationsService>(ConversationsService);
      messagingService = module.get<MessagingService>(MessagingService);
      conversationRepo = module.get<Repository<ConversationEntity>>(
        getRepositoryToken(ConversationEntity),
      );
      memberRepo = module.get<Repository<ConversationMemberEntity>>(
        getRepositoryToken(ConversationMemberEntity),
      );
      messageRepo = module.get<Repository<MessageIndexEntity>>(
        getRepositoryToken(MessageIndexEntity),
      );
      userRepo = module.get<Repository<UserEntity>>(
        getRepositoryToken(UserEntity),
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Module init failed: ${message}`);
      postgresAvailable = false;
    }
  }, 30000);

  afterAll(async () => {
    if (module) {
      await cleanupAll();
      await module.close();
    }
  });

  // ─── getMessages() pagination ──────────────────────────────────────────────

  describe("getMessages() — pagination", () => {
    it("should return messages in chronological order with cursor pagination", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const conv = await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
      ]);

      // Insert 6 messages
      for (let i = 1; i <= 6; i++) {
        await insertMessage(conv.hcsTopicId, user.hederaAccountId, i);
      }

      // First page: limit=3
      const page1 = await messagingService.getMessages(conv.hcsTopicId, 3);
      expect(page1.messages.length).toBe(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Messages should be in chronological order (oldest first)
      for (let i = 0; i < page1.messages.length - 1; i++) {
        expect(Number(page1.messages[i]!.sequenceNumber)).toBeLessThan(
          Number(page1.messages[i + 1]!.sequenceNumber),
        );
      }

      // Second page using cursor
      const page2 = await messagingService.getMessages(
        conv.hcsTopicId,
        3,
        page1.cursor!,
      );
      expect(page2.messages.length).toBe(3);

      // No overlapping sequence numbers
      const page1Seqs = page1.messages.map((m) => Number(m.sequenceNumber));
      const page2Seqs = page2.messages.map((m) => Number(m.sequenceNumber));
      for (const seq of page1Seqs) {
        expect(page2Seqs).not.toContain(seq);
      }
    });

    it("should return empty messages for conversation with no messages", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const conv = await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
      ]);

      const result = await messagingService.getMessages(conv.hcsTopicId);
      expect(result.messages).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it("should throw ConversationTopicNotFoundException for unknown topic", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(messagingService.getMessages("0.0.9999999")).rejects.toThrow(
        ConversationTopicNotFoundException,
      );
    });

    it("should clamp limit to valid range", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const conv = await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
      ]);

      // limit=0 should be clamped to 1
      const result = await messagingService.getMessages(conv.hcsTopicId, 0);
      expect(result).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
    });

    it("should handle cursor with non-numeric value gracefully", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const conv = await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
      ]);
      await insertMessage(conv.hcsTopicId, user.hederaAccountId, 1);

      // Non-numeric cursor should be ignored
      const result = await messagingService.getMessages(
        conv.hcsTopicId,
        10,
        "invalid",
      );
      expect(result).toBeDefined();
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── getUserConversations() pagination ──────────────────────────────────────

  describe("getUserConversations() — pagination edge cases", () => {
    it("should return conversations for user with multiple conversations", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const other1 = await createTestUser();
      const other2 = await createTestUser();
      const other3 = await createTestUser();

      await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
        other1.hederaAccountId,
      ]);
      await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
        other2.hederaAccountId,
      ]);
      await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
        other3.hederaAccountId,
      ]);

      const result = await conversationsService.getUserConversations(
        user.hederaAccountId,
        undefined,
        2,
      );
      expect(result.data.length).toBe(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).not.toBeNull();

      // Second page
      const page2 = await conversationsService.getUserConversations(
        user.hederaAccountId,
        result.nextCursor!,
        2,
      );
      expect(page2.data.length).toBe(1);
      expect(page2.hasMore).toBe(false);
    });

    it("should return empty for user with no conversations", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result =
        await conversationsService.getUserConversations(uniqueAccountId());
      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  // ─── getLastSyncedSequence ─────────────────────────────────────────────────

  describe("getLastSyncedSequence()", () => {
    it("should return the highest sequence number for a topic", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const conv = await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
      ]);

      await insertMessage(conv.hcsTopicId, user.hederaAccountId, 5);
      await insertMessage(conv.hcsTopicId, user.hederaAccountId, 10);
      await insertMessage(conv.hcsTopicId, user.hederaAccountId, 3);

      const lastSeq = await messagingService.getLastSyncedSequence(
        conv.hcsTopicId,
      );
      expect(Number(lastSeq)).toBe(10);
    });

    it("should return 0 for topic with no messages", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user = await createTestUser();
      const conv = await createTestConversation(user.hederaAccountId, [
        user.hederaAccountId,
      ]);

      const lastSeq = await messagingService.getLastSyncedSequence(
        conv.hcsTopicId,
      );
      expect(Number(lastSeq)).toBe(0);
    });
  });
});
