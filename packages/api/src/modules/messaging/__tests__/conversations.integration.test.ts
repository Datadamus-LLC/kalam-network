/**
 * Integration tests for the Conversations module (T14).
 *
 * These tests require real infrastructure:
 *   - PostgreSQL database
 *   - Hedera Testnet operator credentials
 *
 * If the required infrastructure is not available, tests skip gracefully.
 *
 * NO MOCKS. NO FAKES. NO STUBS.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import configuration from "../../../config/configuration";
import { ConversationEntity } from "../../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../../database/entities/conversation-member.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { HederaModule } from "../../hedera/hedera.module";
import { ConversationsService } from "../conversations.service";
import { CreateConversationDto } from "../dto/create-conversation.dto";
import {
  ConversationNotFoundException,
  CannotAddToDirectConversationException,
  NotConversationMemberException,
  NotConversationAdminException,
  AlreadyMemberException,
  ParticipantNotFoundException,
  MissingEncryptionKeyException,
} from "../exceptions/conversation.exceptions";
import nacl from "tweetnacl";

const logger = new Logger("ConversationsIntegrationTest");

/**
 * Check if PostgreSQL is reachable by attempting a connection.
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

describe("Conversations Integration Tests", () => {
  let module: TestingModule;
  let conversationsService: ConversationsService;
  let dataSource: DataSource;
  let conversationRepository: Repository<ConversationEntity>;
  let memberRepository: Repository<ConversationMemberEntity>;
  let userRepository: Repository<UserEntity>;
  let postgresAvailable = false;
  let hederaConfigured = false;

  // Track IDs for cleanup
  const createdConversationIds: string[] = [];
  const createdUserIds: string[] = [];

  /** Create a test user directly in the database */
  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const user = userRepository.create({
      displayName: `Test User ${Date.now()}`,
      email: `test-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`,
      hederaAccountId: `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 100)}`,
      status: "active",
      ...overrides,
    });
    const saved = await userRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  /** Create a conversation directly in the database (bypassing HCS) */
  async function createTestConversation(
    type: "direct" | "group",
    createdBy: string,
    participantAccountIds: string[],
    opts?: { groupName?: string; lastMessageAt?: Date },
  ): Promise<ConversationEntity> {
    const convId = uuidv4();
    const conv = conversationRepository.create({
      id: convId,
      hcsTopicId: `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 100)}`,
      conversationType: type,
      createdBy,
      groupName: opts?.groupName ?? null,
      groupAvatarCid: null,
      adminAccountId: type === "group" ? createdBy : null,
      lastMessageAt: opts?.lastMessageAt ?? null,
      lastMessageSeq: 0,
      encryptedKeysJson: null,
      currentKeyId: null,
    });
    await conversationRepository.save(conv);
    createdConversationIds.push(convId);

    // Add all participants as members (including createdBy)
    const allAccountIds = [
      createdBy,
      ...participantAccountIds.filter((id) => id !== createdBy),
    ];
    for (const accountId of allAccountIds) {
      const member = memberRepository.create({
        conversationId: convId,
        hederaAccountId: accountId,
        role: accountId === createdBy ? "admin" : "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await memberRepository.save(member);
    }

    return conv;
  }

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    hederaConfigured = isHederaConfigured();

    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available — skipping integration tests. " +
          "Start PostgreSQL with: docker compose up -d postgres",
      );
      return;
    }

    if (!hederaConfigured) {
      logger.warn(
        "Hedera operator not configured — skipping HCS tests. " +
          "Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env",
      );
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
                UserEntity,
              ],
              synchronize: true, // Auto-create tables for integration tests
              logging: false,
            }),
          }),
          TypeOrmModule.forFeature([
            ConversationEntity,
            ConversationMemberEntity,
            UserEntity,
          ]),
          HederaModule,
          JwtModule.registerAsync({
            inject: [ConfigService],
            useFactory: (configService: ConfigService) => ({
              secret:
                configService.get<string>("jwt.secret") ||
                "test-secret-for-integration",
            }),
          }),
        ],
        providers: [ConversationsService],
      }).compile();

      conversationsService =
        module.get<ConversationsService>(ConversationsService);
      dataSource = module.get<DataSource>(DataSource);
      conversationRepository = dataSource.getRepository(ConversationEntity);
      memberRepository = dataSource.getRepository(ConversationMemberEntity);
      userRepository = dataSource.getRepository(UserEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;
    // Clean up members first (FK constraint), then conversations, then users
    for (const convId of createdConversationIds) {
      try {
        await memberRepository.delete({ conversationId: convId });
        await conversationRepository.delete(convId);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for conversation ${convId}: ${msg}`);
      }
    }
    createdConversationIds.length = 0;
    for (const userId of createdUserIds) {
      try {
        await userRepository.delete(userId);
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

  describe("ConversationsService", () => {
    it("should be defined when infrastructure is available", () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      expect(conversationsService).toBeDefined();
    });

    it("should reject creation with missing participants", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const dto: CreateConversationDto = {
        participantAccountIds: [],
        type: "direct",
      };

      // An empty participants list should fail validation
      // (In practice the DTO decorator @ArrayMinSize(1) catches this
      //  at the controller level. Here we test the service directly.)
      await expect(
        conversationsService.createConversation("0.0.99999", dto),
      ).rejects.toThrow();
    });

    it("should reject direct conversation with wrong participant count", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const dto: CreateConversationDto = {
        participantAccountIds: ["0.0.11111", "0.0.22222"],
        type: "direct",
      };

      await expect(
        conversationsService.createConversation("0.0.99999", dto),
      ).rejects.toThrow("Direct conversations require exactly 1 participant");
    });

    it("should reject group conversation without group name", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const dto: CreateConversationDto = {
        participantAccountIds: ["0.0.11111", "0.0.22222"],
        type: "group",
      };

      await expect(
        conversationsService.createConversation("0.0.99999", dto),
      ).rejects.toThrow("Group name is required");
    });

    it("should reject if initiator is in participants list", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const dto: CreateConversationDto = {
        participantAccountIds: ["0.0.99999"],
        type: "direct",
      };

      await expect(
        conversationsService.createConversation("0.0.99999", dto),
      ).rejects.toThrow("Initiator should not be included");
    });

    it("should reject if participant does not exist in database", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const dto: CreateConversationDto = {
        participantAccountIds: ["0.0.99998"],
        type: "direct",
      };

      await expect(
        conversationsService.createConversation("0.0.99999", dto),
      ).rejects.toThrow("not found");
    });

    it("should return empty list for user with no conversations", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const result =
        await conversationsService.getUserConversations("0.0.nonexistent");
      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    // --- getConversation tests ---

    it("should get a conversation by ID with participants", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const userA = await createTestUser({ displayName: "Alice Conv" });
      const userB = await createTestUser({ displayName: "Bob Conv" });

      const conv = await createTestConversation(
        "direct",
        userA.hederaAccountId!,
        [userB.hederaAccountId!],
      );

      const result = await conversationsService.getConversation(
        conv.id,
        userA.hederaAccountId!,
      );

      expect(result.id).toBe(conv.id);
      expect(result.type).toBe("direct");
      expect(result.hcsTopicId).toBe(conv.hcsTopicId);
      expect(result.createdBy).toBe(userA.hederaAccountId);
      expect(result.participants.length).toBe(2);

      const aliceParticipant = result.participants.find(
        (p) => p.accountId === userA.hederaAccountId,
      );
      expect(aliceParticipant).toBeDefined();
      expect(aliceParticipant!.displayName).toBe("Alice Conv");

      const bobParticipant = result.participants.find(
        (p) => p.accountId === userB.hederaAccountId,
      );
      expect(bobParticipant).toBeDefined();
      expect(bobParticipant!.displayName).toBe("Bob Conv");
    });

    it("should throw ConversationNotFoundException for non-existent ID", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      await expect(
        conversationsService.getConversation(uuidv4(), "0.0.999999"),
      ).rejects.toThrow("not found");
    });

    it("should throw NotConversationMemberException for non-member", async () => {
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
      ).rejects.toThrow("not a member");
    });

    // --- getUserConversations tests ---

    it("should list user conversations sorted by lastMessageAt", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const user = await createTestUser();
      const otherA = await createTestUser();
      const otherB = await createTestUser();
      const otherC = await createTestUser();

      // Create 3 conversations with different lastMessageAt times
      const now = new Date();
      await createTestConversation(
        "direct",
        user.hederaAccountId!,
        [otherA.hederaAccountId!],
        { lastMessageAt: new Date(now.getTime() - 3000) },
      );

      await createTestConversation(
        "direct",
        user.hederaAccountId!,
        [otherB.hederaAccountId!],
        { lastMessageAt: new Date(now.getTime() - 1000) },
      );

      await createTestConversation(
        "direct",
        user.hederaAccountId!,
        [otherC.hederaAccountId!],
        { lastMessageAt: new Date(now.getTime() - 2000) },
      );

      const result = await conversationsService.getUserConversations(
        user.hederaAccountId!,
      );

      expect(result.data.length).toBe(3);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();

      // Verify ordering: newest lastMessageAt first
      const times = result.data.map((c) =>
        c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0,
      );
      for (let i = 1; i < times.length; i++) {
        expect(times[i - 1]).toBeGreaterThanOrEqual(times[i]);
      }
    });

    it("should paginate conversations with cursor", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const user = await createTestUser();
      const now = new Date();

      // Create 5 conversations
      for (let i = 0; i < 5; i++) {
        const other = await createTestUser();
        await createTestConversation(
          "direct",
          user.hederaAccountId!,
          [other.hederaAccountId!],
          { lastMessageAt: new Date(now.getTime() - i * 1000) },
        );
      }

      // Get first page (limit 3)
      const page1 = await conversationsService.getUserConversations(
        user.hederaAccountId!,
        undefined,
        3,
      );

      expect(page1.data.length).toBe(3);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).not.toBeNull();

      // Get second page using cursor
      const page2 = await conversationsService.getUserConversations(
        user.hederaAccountId!,
        page1.nextCursor!,
        3,
      );

      expect(page2.data.length).toBe(2);
      expect(page2.hasMore).toBe(false);

      // Verify no duplicate conversations across pages
      const page1Ids = new Set(page1.data.map((c) => c.id));
      const page2Ids = new Set(page2.data.map((c) => c.id));
      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }
    });

    it("should return group conversation with groupName", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser({ displayName: "Group Admin" });
      const member1 = await createTestUser({ displayName: "Member One" });
      const member2 = await createTestUser({ displayName: "Member Two" });

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member1.hederaAccountId!, member2.hederaAccountId!],
        { groupName: "Project Team" },
      );

      const result = await conversationsService.getConversation(
        conv.id,
        admin.hederaAccountId!,
      );

      expect(result.type).toBe("group");
      expect(result.groupName).toBe("Project Team");
      expect(result.participants.length).toBe(3);
    });

    it("should handle conversations with null lastMessageAt", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const user = await createTestUser();
      const other = await createTestUser();

      // Conversation with no messages (lastMessageAt is null)
      await createTestConversation("direct", user.hederaAccountId!, [
        other.hederaAccountId!,
      ]);

      const result = await conversationsService.getUserConversations(
        user.hederaAccountId!,
      );

      expect(result.data.length).toBe(1);
      expect(result.data[0].lastMessageAt).toBeNull();
    });

    // -----------------------------------------------------------------------
    // addParticipant — DB_ONLY guard clauses
    // -----------------------------------------------------------------------

    it("should throw ConversationNotFoundException for non-existent conversation on addParticipant", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      await expect(
        conversationsService.addParticipant(
          uuidv4(),
          "0.0.999999",
          "0.0.888888",
        ),
      ).rejects.toThrow(ConversationNotFoundException);
    });

    it("should throw CannotAddToDirectConversationException when adding to direct conversation", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const newUser = await createTestUser();

      const conv = await createTestConversation(
        "direct",
        admin.hederaAccountId!,
        [member.hederaAccountId!],
      );

      await expect(
        conversationsService.addParticipant(
          conv.id,
          newUser.hederaAccountId!,
          admin.hederaAccountId!,
        ),
      ).rejects.toThrow(CannotAddToDirectConversationException);
    });

    it("should throw NotConversationMemberException when requestor is not a member", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const outsider = await createTestUser();
      const newUser = await createTestUser();

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member.hederaAccountId!],
        { groupName: "Test Group" },
      );

      await expect(
        conversationsService.addParticipant(
          conv.id,
          newUser.hederaAccountId!,
          outsider.hederaAccountId!, // not a member
        ),
      ).rejects.toThrow(NotConversationMemberException);
    });

    it("should throw NotConversationAdminException when requestor is not admin", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const newUser = await createTestUser();

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member.hederaAccountId!],
        { groupName: "Admin Test Group" },
      );

      await expect(
        conversationsService.addParticipant(
          conv.id,
          newUser.hederaAccountId!,
          member.hederaAccountId!, // member, not admin
        ),
      ).rejects.toThrow(NotConversationAdminException);
    });

    it("should throw AlreadyMemberException when user is already an active member", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member.hederaAccountId!],
        { groupName: "Dup Member Group" },
      );

      await expect(
        conversationsService.addParticipant(
          conv.id,
          member.hederaAccountId!, // already a member
          admin.hederaAccountId!,
        ),
      ).rejects.toThrow(AlreadyMemberException);
    });

    it("should throw ParticipantNotFoundException when new participant does not exist", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member.hederaAccountId!],
        { groupName: "No User Group" },
      );

      await expect(
        conversationsService.addParticipant(
          conv.id,
          "0.0.9999999", // non-existent user
          admin.hederaAccountId!,
        ),
      ).rejects.toThrow(ParticipantNotFoundException);
    });

    it("should throw MissingEncryptionKeyException when new participant has no encryption key", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      // Create new user WITHOUT encryption key
      const newUser = await createTestUser({
        encryptionPublicKey: null,
      });

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member.hederaAccountId!],
        { groupName: "No Key Group" },
      );

      await expect(
        conversationsService.addParticipant(
          conv.id,
          newUser.hederaAccountId!,
          admin.hederaAccountId!,
        ),
      ).rejects.toThrow(MissingEncryptionKeyException);
    });

    it("should allow re-join of a member who previously left", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      // Generate real X25519 key pairs for all participants
      const adminKeyPair = nacl.box.keyPair();
      const memberKeyPair = nacl.box.keyPair();
      const returningKeyPair = nacl.box.keyPair();

      const admin = await createTestUser({
        encryptionPublicKey: Buffer.from(adminKeyPair.publicKey).toString(
          "base64",
        ),
      });
      const member = await createTestUser({
        encryptionPublicKey: Buffer.from(memberKeyPair.publicKey).toString(
          "base64",
        ),
      });
      const returningUser = await createTestUser({
        encryptionPublicKey: Buffer.from(returningKeyPair.publicKey).toString(
          "base64",
        ),
      });

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member.hederaAccountId!, returningUser.hederaAccountId!],
        { groupName: "Rejoin Group" },
      );

      // Simulate the returning user leaving
      const membership = await memberRepository.findOne({
        where: {
          conversationId: conv.id,
          hederaAccountId: returningUser.hederaAccountId!,
        },
      });
      expect(membership).toBeDefined();
      membership!.leftAt = new Date();
      await memberRepository.save(membership!);

      // Now re-add the returning user — this exercises the rejoin path
      // The key rotation to HCS will fail (no Hedera credentials), but
      // the member addition is still persisted (tolerant error handling).
      const result = await conversationsService.addParticipant(
        conv.id,
        returningUser.hederaAccountId!,
        admin.hederaAccountId!,
      );

      // The response should include the returning user as an active participant
      const returningParticipant = result.participants.find(
        (p) => p.accountId === returningUser.hederaAccountId,
      );
      expect(returningParticipant).toBeDefined();

      // Verify in DB that leftAt is cleared
      const updated = await memberRepository.findOne({
        where: {
          conversationId: conv.id,
          hederaAccountId: returningUser.hederaAccountId!,
        },
      });
      expect(updated!.leftAt).toBeNull();
    });

    it("should add new participant to group conversation (DB-only, key rotation may fail)", async () => {
      if (!postgresAvailable) {
        logger.warn("SKIPPED: PostgreSQL not available");
        pending();
        return;
      }

      const adminKeyPair = nacl.box.keyPair();
      const memberKeyPair = nacl.box.keyPair();
      const newKeyPair = nacl.box.keyPair();

      const admin = await createTestUser({
        encryptionPublicKey: Buffer.from(adminKeyPair.publicKey).toString(
          "base64",
        ),
      });
      const member = await createTestUser({
        encryptionPublicKey: Buffer.from(memberKeyPair.publicKey).toString(
          "base64",
        ),
      });
      const newUser = await createTestUser({
        encryptionPublicKey: Buffer.from(newKeyPair.publicKey).toString(
          "base64",
        ),
      });

      const conv = await createTestConversation(
        "group",
        admin.hederaAccountId!,
        [member.hederaAccountId!],
        { groupName: "Add Participant Group" },
      );

      // addParticipant — key rotation to HCS may fail without credentials,
      // but the DB member addition still succeeds (tolerant error path)
      const result = await conversationsService.addParticipant(
        conv.id,
        newUser.hederaAccountId!,
        admin.hederaAccountId!,
      );

      // Verify the new participant is in the response
      const newParticipant = result.participants.find(
        (p) => p.accountId === newUser.hederaAccountId,
      );
      expect(newParticipant).toBeDefined();
      expect(newParticipant!.role).toBe("member");

      // Verify in DB
      const dbMember = await memberRepository.findOne({
        where: {
          conversationId: conv.id,
          hederaAccountId: newUser.hederaAccountId!,
        },
      });
      expect(dbMember).toBeDefined();
      expect(dbMember!.leftAt).toBeNull();
    });
  });
});
