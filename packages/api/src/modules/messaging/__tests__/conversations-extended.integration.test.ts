/**
 * Extended Integration Tests for Conversations and Messaging modules.
 *
 * Covers uncovered paths identified by coverage analysis:
 *   - ConversationsService (71% -> higher):
 *     getUserConversations empty list, pagination with limit=2 (5 convos),
 *     getConversation not found, getConversation user not member,
 *     addParticipant conversation not found, addParticipant already member,
 *     removeParticipant conversation not found,
 *     leaveConversation not a member
 *   - MessagingService (55% -> higher):
 *     getMessages pagination, getMessages empty for unknown topic,
 *     getLastSyncedSequence returns 0 for unknown topic
 *
 * Prerequisites:
 *   - PostgreSQL running on localhost:5433 (TEST_DB_PORT)
 *
 * NO MOCKS. NO FAKES. NO STUBS.
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
import {
  ConversationNotFoundException,
  NotConversationMemberException,
  AlreadyMemberException,
} from "../exceptions/conversation.exceptions";
import { ConversationTopicNotFoundException } from "../exceptions/message.exceptions";

const logger = new Logger("ConversationsExtendedIntegrationTest");

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
    socket.on("error", () => {
      resolve(false);
    });
    socket.connect(TEST_DB_PORT, "localhost");
  });
}

describe("Conversations & Messaging Extended Integration Tests", () => {
  let module: TestingModule;
  let conversationsService: ConversationsService;
  let messagingService: MessagingService;
  let conversationRepo: Repository<ConversationEntity>;
  let memberRepo: Repository<ConversationMemberEntity>;
  let messageRepo: Repository<MessageIndexEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;

  // Track IDs for cleanup
  const createdConversationIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdMessageIds: string[] = [];

  /** Unique Hedera-style account ID per call */
  function testAccountId(): string {
    return `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
  }

  /** Create a test user directly in the database */
  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const user = userRepo.create({
      displayName: `Test User ${Date.now()}`,
      email: `test-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`,
      hederaAccountId: testAccountId(),
      status: "active",
      ...overrides,
    });
    const saved = await userRepo.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  /**
   * Create a conversation + members directly in DB (bypassing HCS).
   * The createdAt is controlled via the optional `createdAt` override on the
   * conversation to allow deterministic ordering tests.
   */
  async function createTestConversation(
    type: "direct" | "group",
    createdBy: string,
    participantAccountIds: string[],
    opts?: {
      groupName?: string;
      lastMessageAt?: Date;
      topicId?: string;
      encryptedKeysJson?: string;
      currentKeyId?: string;
    },
  ): Promise<ConversationEntity> {
    const convId = uuidv4();
    const conv = conversationRepo.create({
      id: convId,
      hcsTopicId:
        opts?.topicId ??
        `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`,
      conversationType: type,
      createdBy,
      groupName: opts?.groupName ?? null,
      groupAvatarCid: null,
      adminAccountId: type === "group" ? createdBy : null,
      lastMessageAt: opts?.lastMessageAt ?? null,
      lastMessageSeq: 0,
      encryptedKeysJson: opts?.encryptedKeysJson ?? null,
      currentKeyId: opts?.currentKeyId ?? null,
    });
    await conversationRepo.save(conv);
    createdConversationIds.push(convId);

    const allAccountIds = [
      createdBy,
      ...participantAccountIds.filter((id) => id !== createdBy),
    ];
    for (const accountId of allAccountIds) {
      const member = memberRepo.create({
        conversationId: convId,
        hederaAccountId: accountId,
        role: accountId === createdBy ? "admin" : "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await memberRepo.save(member);
    }

    return conv;
  }

  /**
   * Insert a message record directly into the DB.
   */
  async function insertMessageDirectly(
    topicId: string,
    sequenceNumber: number,
    senderAccount: string,
  ): Promise<MessageIndexEntity> {
    const messageId = uuidv4();
    createdMessageIds.push(messageId);

    const message = messageRepo.create({
      id: messageId,
      hcsTopicId: topicId,
      sequenceNumber,
      consensusTimestamp: new Date(Date.now() - (100 - sequenceNumber) * 1000),
      senderAccountId: senderAccount,
      messageType: "message",
      encryptedPreview: null,
      hasMedia: false,
    });
    return messageRepo.save(message);
  }

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    if (!postgresAvailable) {
      logger.warn(
        `PostgreSQL not available on port ${TEST_DB_PORT} — tests will be skipped. ` +
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
                hedera: {
                  network: "testnet",
                  operatorId: "",
                  operatorKey: "",
                  notificationTopic: "",
                },
                jwt: { secret: "test-secret-ext-integration" },
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
          HederaModule,
          JwtModule.register({
            secret: "test-secret-ext-integration",
          }),
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
      logger.error(`Failed to initialize test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    // Clean up messages
    for (const msgId of createdMessageIds) {
      try {
        await messageRepo.delete(msgId);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for message ${msgId}: ${msg}`);
      }
    }
    createdMessageIds.length = 0;

    // Clean up members first (FK constraint), then conversations
    for (const convId of createdConversationIds) {
      try {
        await memberRepo.delete({ conversationId: convId });
        await conversationRepo.delete(convId);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for conversation ${convId}: ${msg}`);
      }
    }
    createdConversationIds.length = 0;

    // Clean up users
    for (const userId of createdUserIds) {
      try {
        await userRepo.delete(userId);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for user ${userId}: ${msg}`);
      }
    }
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  // ---------------------------------------------------------------------------
  // ConversationsService — getUserConversations
  // ---------------------------------------------------------------------------

  describe("ConversationsService.getUserConversations", () => {
    it("should return empty list for a user with no conversations", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const noConvoAccountId = testAccountId();
      const result =
        await conversationsService.getUserConversations(noConvoAccountId);

      expect(result.data).toEqual([]);
      expect(result.nextCursor).toBeNull();
      expect(result.hasMore).toBe(false);
    });

    it("should paginate 5 conversations with limit=2", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const user = await createTestUser();
      const now = Date.now();

      // Create 5 conversations with staggered lastMessageAt so ordering is deterministic
      for (let i = 0; i < 5; i++) {
        const other = await createTestUser();
        await createTestConversation(
          "direct",
          user.hederaAccountId!,
          [other.hederaAccountId!],
          { lastMessageAt: new Date(now - i * 2000) },
        );
      }

      // Page 1: expect 2 items, hasMore=true
      const page1 = await conversationsService.getUserConversations(
        user.hederaAccountId!,
        undefined,
        2,
      );
      expect(page1.data.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Page 2: expect 2 items, hasMore=true
      const page2 = await conversationsService.getUserConversations(
        user.hederaAccountId!,
        page1.nextCursor!,
        2,
      );
      expect(page2.data.length).toBe(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.nextCursor).not.toBeNull();

      // Page 3: expect 1 item, hasMore=false
      const page3 = await conversationsService.getUserConversations(
        user.hederaAccountId!,
        page2.nextCursor!,
        2,
      );
      expect(page3.data.length).toBe(1);
      expect(page3.hasMore).toBe(false);

      // Verify no duplicate IDs across all pages
      const allIds = [
        ...page1.data.map((c) => c.id),
        ...page2.data.map((c) => c.id),
        ...page3.data.map((c) => c.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // ConversationsService — getConversation
  // ---------------------------------------------------------------------------

  describe("ConversationsService.getConversation", () => {
    it("should throw ConversationNotFoundException for a non-existent conversation", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const fakeConvId = uuidv4();
      await expect(
        conversationsService.getConversation(fakeConvId, "0.0.999999"),
      ).rejects.toThrow(ConversationNotFoundException);
    });

    it("should throw NotConversationMemberException when user is not a member", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const userA = await createTestUser();
      const userB = await createTestUser();
      const outsider = await createTestUser();

      const conv = await createTestConversation(
        "direct",
        userA.hederaAccountId!,
        [userB.hederaAccountId!],
      );

      await expect(
        conversationsService.getConversation(
          conv.id,
          outsider.hederaAccountId!,
        ),
      ).rejects.toThrow(NotConversationMemberException);
    });
  });

  // ---------------------------------------------------------------------------
  // ConversationsService — addParticipant
  // ---------------------------------------------------------------------------

  describe("ConversationsService.addParticipant", () => {
    it("should throw ConversationNotFoundException when conversation does not exist", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const fakeConvId = uuidv4();
      await expect(
        conversationsService.addParticipant(
          fakeConvId,
          "0.0.111111",
          "0.0.222222",
        ),
      ).rejects.toThrow(ConversationNotFoundException);
    });

    it("should throw AlreadyMemberException when user is already an active member", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser();
      const existingMember = await createTestUser();

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [existingMember.hederaAccountId!],
        { groupName: "Already Member Group" },
      );

      await expect(
        conversationsService.addParticipant(
          conv.id,
          existingMember.hederaAccountId!,
          admin.hederaAccountId!,
        ),
      ).rejects.toThrow(AlreadyMemberException);
    });
  });

  // ---------------------------------------------------------------------------
  // ConversationsService — removeParticipant
  // ---------------------------------------------------------------------------

  describe("ConversationsService.removeParticipant", () => {
    it("should throw ConversationNotFoundException when conversation does not exist", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const fakeConvId = uuidv4();
      await expect(
        conversationsService.removeParticipant(
          fakeConvId,
          "0.0.111111",
          "0.0.222222",
        ),
      ).rejects.toThrow(ConversationNotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // ConversationsService — leaveConversation
  // ---------------------------------------------------------------------------

  describe("ConversationsService.leaveConversation", () => {
    it("should throw NotConversationMemberException when user is not a member", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const outsider = await createTestUser();

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member.hederaAccountId!],
        { groupName: "Leave Test Group" },
      );

      await expect(
        conversationsService.leaveConversation(
          conv.id,
          outsider.hederaAccountId!,
        ),
      ).rejects.toThrow(NotConversationMemberException);
    });
  });

  // ---------------------------------------------------------------------------
  // MessagingService — getMessages pagination
  // ---------------------------------------------------------------------------

  describe("MessagingService.getMessages", () => {
    it("should paginate messages correctly with limit=2 across 5 messages", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const sender = await createTestUser();
      const recipient = await createTestUser();
      const topicId = `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;

      await createTestConversation(
        "direct",
        sender.hederaAccountId!,
        [recipient.hederaAccountId!],
        { topicId },
      );

      // Insert 5 messages with sequential numbers
      for (let i = 1; i <= 5; i++) {
        await insertMessageDirectly(topicId, i, sender.hederaAccountId!);
      }

      // Page 1: limit=2 — should get most recent 2 messages (seq 4,5 in chrono order)
      const page1 = await messagingService.getMessages(topicId, 2);
      expect(page1.messages).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Messages should be in chronological order (oldest first within page)
      expect(Number(page1.messages[0].sequenceNumber)).toBeLessThan(
        Number(page1.messages[1].sequenceNumber),
      );

      // Page 2: use cursor from page 1
      const page2 = await messagingService.getMessages(
        topicId,
        2,
        page1.cursor!,
      );
      expect(page2.messages).toHaveLength(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.cursor).not.toBeNull();

      // Page 3: last page
      const page3 = await messagingService.getMessages(
        topicId,
        2,
        page2.cursor!,
      );
      expect(page3.messages).toHaveLength(1);
      expect(page3.hasMore).toBe(false);

      // Verify all 5 messages appear exactly once across pages
      const allSeqs = [
        ...page1.messages.map((m) => Number(m.sequenceNumber)),
        ...page2.messages.map((m) => Number(m.sequenceNumber)),
        ...page3.messages.map((m) => Number(m.sequenceNumber)),
      ];
      const uniqueSeqs = new Set(allSeqs);
      expect(uniqueSeqs.size).toBe(5);
    });

    it("should return empty messages for a topic with no messages", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const sender = await createTestUser();
      const recipient = await createTestUser();
      const topicId = `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;

      // Create conversation but insert no messages
      await createTestConversation(
        "direct",
        sender.hederaAccountId!,
        [recipient.hederaAccountId!],
        { topicId },
      );

      const result = await messagingService.getMessages(topicId);
      expect(result.messages).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("should throw ConversationTopicNotFoundException for an unknown topic", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const unknownTopicId = `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;

      await expect(
        messagingService.getMessages(unknownTopicId),
      ).rejects.toThrow(ConversationTopicNotFoundException);
    });
  });

  // ---------------------------------------------------------------------------
  // MessagingService — getLastSyncedSequence
  // ---------------------------------------------------------------------------

  describe("MessagingService.getLastSyncedSequence", () => {
    it("should return 0 for a topic with no messages", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const unknownTopicId = `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 1000)}`;
      const result =
        await messagingService.getLastSyncedSequence(unknownTopicId);
      expect(result).toBe(0);
    });
  });
});
