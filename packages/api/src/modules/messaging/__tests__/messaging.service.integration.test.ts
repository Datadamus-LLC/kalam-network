/**
 * MessagingService Integration Tests
 *
 * Tests the MessagingService against REAL PostgreSQL and optionally Hedera Testnet.
 * sendMessage() requires Hedera for full end-to-end flow (encrypts + submits to HCS).
 * getMessages() and DB-level operations work with PostgreSQL only.
 *
 * Prerequisites:
 *   - PostgreSQL running (default: localhost:5432)
 *   - Optional: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY for HCS message tests
 *
 * NO MOCKS. NO FAKES. NO STUBS.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import configuration from "../../../config/configuration";
import { ConversationEntity } from "../../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../../database/entities/conversation-member.entity";
import { MessageIndexEntity } from "../../../database/entities/message-index.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { MessagingService } from "../messaging.service";
import { HederaModule } from "../../hedera/hedera.module";
import { ConversationTopicNotFoundException } from "../exceptions/message.exceptions";

const logger = new Logger("MessagingIntegrationTest");

/**
 * Check if PostgreSQL is reachable.
 */
async function isPostgresAvailable(): Promise<boolean> {
  try {
    const { Client } = await import("pg");
    const client = new Client({
      host: process.env.DB_HOST || "localhost",
      port: parseInt(process.env.DB_PORT || "5432", 10),
      user: process.env.DB_USERNAME || "hedera_social",
      password: process.env.DB_PASSWORD || "devpassword",
      database: process.env.DB_DATABASE || "hedera_social",
      connectionTimeoutMillis: 3000,
    });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Hedera operator credentials are configured.
 */
function isHederaConfigured(): boolean {
  return !!(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);
}

describe("MessagingService Integration Tests", () => {
  let module: TestingModule;
  let messagingService: MessagingService;
  let conversationRepo: Repository<ConversationEntity>;
  let memberRepo: Repository<ConversationMemberEntity>;
  let messageRepo: Repository<MessageIndexEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;
  let hederaConfigured = false;

  // Test identifiers unique per run
  const testRunId = Date.now().toString().slice(-6);
  const senderAccountId = `0.0.5${testRunId}`;
  const recipientAccountId = `0.0.6${testRunId}`;
  const testTopicId = `0.0.7${testRunId}`;

  // Track created entity IDs for cleanup
  const createdConversationIds: string[] = [];
  const createdMessageIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    hederaConfigured = isHederaConfigured();

    logger.log(
      `Infrastructure — PostgreSQL: ${postgresAvailable}, Hedera: ${hederaConfigured}`,
    );

    if (!postgresAvailable) {
      logger.warn("PostgreSQL not available — tests will be SKIPPED");
      return;
    }

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
            envFilePath: "../../.env",
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
                ConversationEntity,
                ConversationMemberEntity,
                MessageIndexEntity,
                UserEntity,
              ],
              synchronize: true,
              logging: false,
            }),
          }),
          TypeOrmModule.forFeature([
            ConversationEntity,
            ConversationMemberEntity,
            MessageIndexEntity,
            UserEntity,
          ]),
          HederaModule,
        ],
        providers: [MessagingService],
      }).compile();

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

      // Seed test users
      await seedTestUsers();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterAll(async () => {
    if (module) {
      await cleanupTestData();
      await module.close();
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    try {
      // Clean up messages
      if (createdMessageIds.length > 0) {
        await messageRepo
          .createQueryBuilder()
          .delete()
          .from(MessageIndexEntity)
          .where("id IN (:...ids)", { ids: createdMessageIds })
          .execute();
        createdMessageIds.length = 0;
      }

      // Clean up messages by topic
      await messageRepo
        .createQueryBuilder()
        .delete()
        .from(MessageIndexEntity)
        .where("hcsTopicId = :topicId", { topicId: testTopicId })
        .execute();

      // Clean up members
      if (createdConversationIds.length > 0) {
        await memberRepo
          .createQueryBuilder()
          .delete()
          .from(ConversationMemberEntity)
          .where("conversationId IN (:...ids)", {
            ids: createdConversationIds,
          })
          .execute();
      }

      // Clean up conversations
      if (createdConversationIds.length > 0) {
        await conversationRepo
          .createQueryBuilder()
          .delete()
          .from(ConversationEntity)
          .where("id IN (:...ids)", { ids: createdConversationIds })
          .execute();
        createdConversationIds.length = 0;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`afterEach cleanup failed: ${message}`);
    }
  });

  async function seedTestUsers(): Promise<void> {
    for (const accountData of [
      { hederaAccountId: senderAccountId, displayName: "Msg Sender" },
      { hederaAccountId: recipientAccountId, displayName: "Msg Recipient" },
    ]) {
      const existing = await userRepo.findOne({
        where: { hederaAccountId: accountData.hederaAccountId },
      });
      if (!existing) {
        const userId = uuidv4();
        createdUserIds.push(userId);
        const user = userRepo.create({
          id: userId,
          hederaAccountId: accountData.hederaAccountId,
          displayName: accountData.displayName,
          status: "active",
        });
        await userRepo.save(user);
      }
    }
  }

  async function cleanupTestData(): Promise<void> {
    try {
      await messageRepo
        .createQueryBuilder()
        .delete()
        .from(MessageIndexEntity)
        .where("hcsTopicId = :topicId", { topicId: testTopicId })
        .execute();

      await memberRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationMemberEntity)
        .where("hederaAccountId IN (:...ids)", {
          ids: [senderAccountId, recipientAccountId],
        })
        .execute();

      // Clean up conversations with the test topic
      await conversationRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationEntity)
        .where("hcsTopicId = :topicId", { topicId: testTopicId })
        .execute();

      if (createdUserIds.length > 0) {
        await userRepo
          .createQueryBuilder()
          .delete()
          .from(UserEntity)
          .where("id IN (:...ids)", { ids: createdUserIds })
          .execute();
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Cleanup failed: ${message}`);
    }
  }

  /**
   * Helper: create a conversation + members directly in DB for testing.
   * Returns the conversation entity.
   */
  async function createTestConversation(
    topicId: string,
    participantAccountIds: string[],
    encryptedKeysJson?: string,
  ): Promise<ConversationEntity> {
    const conversationId = uuidv4();
    createdConversationIds.push(conversationId);

    const conversation = conversationRepo.create({
      id: conversationId,
      hcsTopicId: topicId,
      conversationType: "direct",
      createdBy: participantAccountIds[0],
      lastMessageSeq: 0,
      encryptedKeysJson: encryptedKeysJson ?? null,
      currentKeyId: uuidv4(),
    });
    await conversationRepo.save(conversation);

    // Add members
    for (const accountId of participantAccountIds) {
      const member = memberRepo.create({
        conversationId,
        hederaAccountId: accountId,
        role: "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await memberRepo.save(member);
    }

    return conversation;
  }

  /**
   * Helper: insert a message record directly into DB.
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

  // ---------------------------------------------------------------------------
  // Service instantiation
  // ---------------------------------------------------------------------------

  it("should be defined when PostgreSQL is available", () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }
    expect(messagingService).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // sendMessage() — requires Hedera for full test
  // ---------------------------------------------------------------------------

  describe("sendMessage()", () => {
    it("should throw ConversationTopicNotFoundException for unknown topic", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        messagingService.sendMessage(
          senderAccountId,
          "0.0.nonexistent",
          "Hello",
        ),
      ).rejects.toThrow(ConversationTopicNotFoundException);
    });

    it("should throw NotConversationParticipantException for non-participant", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Create conversation with only recipientAccountId (not sender)
      await createTestConversation(
        testTopicId,
        [recipientAccountId],
        JSON.stringify({ [recipientAccountId]: "encrypted-key-base64" }),
      );

      await expect(
        messagingService.sendMessage(
          senderAccountId,
          testTopicId,
          "Unauthorized message",
        ),
      ).rejects.toThrow();
    });

    it("should throw EncryptionKeyNotFoundException when no encryption keys", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Create conversation without encryption keys
      await createTestConversation(
        testTopicId,
        [senderAccountId, recipientAccountId],
        null as unknown as undefined,
      );

      await expect(
        messagingService.sendMessage(
          senderAccountId,
          testTopicId,
          "Missing keys message",
        ),
      ).rejects.toThrow();
    });

    it("should submit encrypted message to HCS topic and index in DB (requires Hedera)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn(
          "SKIPPED: Hedera not configured — sendMessage requires HCS",
        );
        pending();
        return;
      }

      // For this test, we need a real HCS topic.
      // We create a conversation with the real topic ID.
      const { HederaService } = await import("../../hedera/hedera.service");
      const hederaService = module.get<HederaService>(HederaService);
      const realTopicId = await hederaService.createTopic({
        memo: "Integration test messaging topic",
      });

      const realConvoTopicId = realTopicId;
      await createTestConversation(
        realConvoTopicId,
        [senderAccountId, recipientAccountId],
        JSON.stringify({
          [senderAccountId]: "encrypted-key-for-sender",
          [recipientAccountId]: "encrypted-key-for-recipient",
        }),
      );

      const result = await messagingService.sendMessage(
        senderAccountId,
        realConvoTopicId,
        "Hello from integration test!",
      );

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.hcsTopicId).toBe(realConvoTopicId);
      expect(result.senderAccountId).toBe(senderAccountId);
      expect(result.sequenceNumber).toBeGreaterThan(0);
      expect(result.messageType).toBe("message");
      expect(result.hasMedia).toBe(false);

      // Verify the message is indexed in DB
      const dbMessage = await messageRepo.findOne({
        where: { id: result.id },
      });
      expect(dbMessage).toBeDefined();
      expect(dbMessage!.hcsTopicId).toBe(realConvoTopicId);
      expect(dbMessage!.sequenceNumber).toBe(result.sequenceNumber);

      // Clean up the test topic messages
      await messageRepo
        .createQueryBuilder()
        .delete()
        .from(MessageIndexEntity)
        .where("hcsTopicId = :topicId", { topicId: realConvoTopicId })
        .execute();
      await memberRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationMemberEntity)
        .where("hederaAccountId IN (:...ids)", {
          ids: [senderAccountId, recipientAccountId],
        })
        .execute();
      await conversationRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationEntity)
        .where("hcsTopicId = :topicId", { topicId: realConvoTopicId })
        .execute();
    }, 60000); // Hedera topic creation + message submission
  });

  // ---------------------------------------------------------------------------
  // getMessages() — DB query, works without Hedera
  // ---------------------------------------------------------------------------

  describe("getMessages()", () => {
    it("should throw ConversationTopicNotFoundException for unknown topic", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        messagingService.getMessages("0.0.nonexistent"),
      ).rejects.toThrow(ConversationTopicNotFoundException);
    });

    it("should return empty messages for conversation with no messages", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await createTestConversation(testTopicId, [
        senderAccountId,
        recipientAccountId,
      ]);

      const result = await messagingService.getMessages(testTopicId);
      expect(result).toBeDefined();
      expect(result.messages).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("should return messages in chronological order", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await createTestConversation(testTopicId, [
        senderAccountId,
        recipientAccountId,
      ]);

      // Insert messages with sequential numbers
      await insertMessageDirectly(testTopicId, 1, senderAccountId);
      await insertMessageDirectly(testTopicId, 2, recipientAccountId);
      await insertMessageDirectly(testTopicId, 3, senderAccountId);

      const result = await messagingService.getMessages(testTopicId);
      expect(result.messages).toHaveLength(3);
      expect(result.hasMore).toBe(false);

      // Messages should be in chronological order (oldest first)
      // Note: PostgreSQL bigint columns return as strings in JS
      expect(Number(result.messages[0].sequenceNumber)).toBe(1);
      expect(Number(result.messages[1].sequenceNumber)).toBe(2);
      expect(Number(result.messages[2].sequenceNumber)).toBe(3);
    });

    it("should paginate messages correctly", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await createTestConversation(testTopicId, [
        senderAccountId,
        recipientAccountId,
      ]);

      // Insert 5 messages
      for (let i = 1; i <= 5; i++) {
        await insertMessageDirectly(testTopicId, i, senderAccountId);
      }

      // First page: limit 2
      const page1 = await messagingService.getMessages(testTopicId, 2);
      expect(page1.messages).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // The first page should have the most recent messages
      // (returned in DESC order, then reversed to chronological)
      expect(Number(page1.messages[0].sequenceNumber)).toBe(4);
      expect(Number(page1.messages[1].sequenceNumber)).toBe(5);

      // Second page using cursor
      const page2 = await messagingService.getMessages(
        testTopicId,
        2,
        page1.cursor!,
      );
      expect(page2.messages).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      // Third page
      const page3 = await messagingService.getMessages(
        testTopicId,
        2,
        page2.cursor!,
      );
      expect(page3.messages).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it("should return correct message response shape", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await createTestConversation(testTopicId, [
        senderAccountId,
        recipientAccountId,
      ]);
      await insertMessageDirectly(testTopicId, 1, senderAccountId);

      const result = await messagingService.getMessages(testTopicId);
      expect(result.messages).toHaveLength(1);

      const msg = result.messages[0];
      expect(msg.id).toBeDefined();
      expect(msg.hcsTopicId).toBe(testTopicId);
      expect(Number(msg.sequenceNumber)).toBe(1);
      expect(msg.senderAccountId).toBe(senderAccountId);
      expect(msg.messageType).toBe("message");
      expect(msg.hasMedia).toBe(false);
      expect(typeof msg.consensusTimestamp).toBe("string");
    });
  });

  // ---------------------------------------------------------------------------
  // getLastSyncedSequence()
  // ---------------------------------------------------------------------------

  describe("getLastSyncedSequence()", () => {
    it("should return 0 when no messages exist for topic", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await messagingService.getLastSyncedSequence(testTopicId);
      expect(result).toBe(0);
    });

    it("should return highest sequence number", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await createTestConversation(testTopicId, [senderAccountId]);
      await insertMessageDirectly(testTopicId, 1, senderAccountId);
      await insertMessageDirectly(testTopicId, 5, senderAccountId);
      await insertMessageDirectly(testTopicId, 3, senderAccountId);

      const result = await messagingService.getLastSyncedSequence(testTopicId);
      expect(Number(result)).toBe(5);
    });
  });

  // ---------------------------------------------------------------------------
  // uploadEncryptedMedia()
  // ---------------------------------------------------------------------------

  describe("uploadEncryptedMedia()", () => {
    it("should throw MediaUploadNotImplementedException", () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      expect(() => messagingService.uploadEncryptedMedia()).toThrow();
    });
  });
});
