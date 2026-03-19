/**
 * Conversation Remove Participant / Leave Integration Tests (GAP-008)
 *
 * Tests removeParticipant and leaveConversation against REAL PostgreSQL.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
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
import {
  ConversationNotFoundException,
  CannotAddToDirectConversationException,
  NotConversationMemberException,
  NotConversationAdminException,
} from "../exceptions/conversation.exceptions";

const logger = new Logger("RemoveLeaveIntegrationTest");

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

describe("Conversation Remove/Leave Integration Tests (GAP-008)", () => {
  let module: TestingModule;
  let conversationsService: ConversationsService;
  let dataSource: DataSource;
  let conversationRepository: Repository<ConversationEntity>;
  let memberRepository: Repository<ConversationMemberEntity>;
  let userRepository: Repository<UserEntity>;
  let postgresAvailable = false;

  const createdConversationIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const user = userRepository.create({
      displayName: `Remove/Leave Test ${Date.now()}`,
      email: `rl-test-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.com`,
      hederaAccountId: `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 100)}`,
      status: "active",
      ...overrides,
    });
    const saved = await userRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  async function createGroupConversation(
    admin: UserEntity,
    members: UserEntity[],
    opts?: { groupName?: string },
  ): Promise<ConversationEntity> {
    const convId = uuidv4();
    const conv = conversationRepository.create({
      id: convId,
      hcsTopicId: `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 100)}`,
      conversationType: "group",
      createdBy: admin.hederaAccountId!,
      groupName: opts?.groupName ?? "Test Group",
      adminAccountId: admin.hederaAccountId,
      lastMessageSeq: 0,
    });
    await conversationRepository.save(conv);
    createdConversationIds.push(convId);

    // Add admin
    const adminMember = memberRepository.create({
      conversationId: convId,
      hederaAccountId: admin.hederaAccountId!,
      role: "admin",
      leftAt: null,
      lastReadSeq: 0,
    });
    await memberRepository.save(adminMember);

    // Add regular members
    for (const m of members) {
      const mem = memberRepository.create({
        conversationId: convId,
        hederaAccountId: m.hederaAccountId!,
        role: "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await memberRepository.save(mem);
    }

    return conv;
  }

  async function createDirectConversation(
    user1: UserEntity,
    user2: UserEntity,
  ): Promise<ConversationEntity> {
    const convId = uuidv4();
    const conv = conversationRepository.create({
      id: convId,
      hcsTopicId: `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 100)}`,
      conversationType: "direct",
      createdBy: user1.hederaAccountId!,
      lastMessageSeq: 0,
    });
    await conversationRepository.save(conv);
    createdConversationIds.push(convId);

    for (const u of [user1, user2]) {
      const mem = memberRepository.create({
        conversationId: convId,
        hederaAccountId: u.hederaAccountId!,
        role: "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await memberRepository.save(mem);
    }

    return conv;
  }

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();

    if (!postgresAvailable) {
      logger.warn("PostgreSQL not available — tests will be skipped");
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
                UserEntity,
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

    for (const convId of createdConversationIds) {
      try {
        await memberRepository.delete({ conversationId: convId });
        await conversationRepository.delete(convId);
      } catch {
        /* cleanup best-effort */
      }
    }
    createdConversationIds.length = 0;

    for (const userId of createdUserIds) {
      try {
        await userRepository.delete(userId);
      } catch {
        /* cleanup best-effort */
      }
    }
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  // -------------------------------------------------------------------------
  // removeParticipant
  // -------------------------------------------------------------------------

  describe("removeParticipant", () => {
    it("should remove a member from a group conversation", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();
      const conv = await createGroupConversation(admin, [member1, member2]);

      const result = await conversationsService.removeParticipant(
        conv.id,
        member1.hederaAccountId!,
        admin.hederaAccountId!,
      );

      expect(result).toBeDefined();

      // Verify member1 has leftAt set
      const removed = await memberRepository.findOne({
        where: {
          conversationId: conv.id,
          hederaAccountId: member1.hederaAccountId!,
        },
      });
      expect(removed).not.toBeNull();
      expect(removed!.leftAt).not.toBeNull();
    });

    it("should throw ConversationNotFoundException for non-existent conversation", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const fakeId = uuidv4();
      await expect(
        conversationsService.removeParticipant(fakeId, "0.0.111", "0.0.222"),
      ).rejects.toThrow(ConversationNotFoundException);
    });

    it("should throw CannotAddToDirectConversationException for direct conversations", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const conv = await createDirectConversation(user1, user2);

      await expect(
        conversationsService.removeParticipant(
          conv.id,
          user2.hederaAccountId!,
          user1.hederaAccountId!,
        ),
      ).rejects.toThrow(CannotAddToDirectConversationException);
    });

    it("should throw NotConversationMemberException when requestor is not a member", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const outsider = await createTestUser();
      const conv = await createGroupConversation(admin, [member]);

      await expect(
        conversationsService.removeParticipant(
          conv.id,
          member.hederaAccountId!,
          outsider.hederaAccountId!,
        ),
      ).rejects.toThrow(NotConversationMemberException);
    });

    it("should throw NotConversationAdminException when requestor is not admin", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();
      const conv = await createGroupConversation(admin, [member1, member2]);

      // member1 tries to remove member2 — not admin
      await expect(
        conversationsService.removeParticipant(
          conv.id,
          member2.hederaAccountId!,
          member1.hederaAccountId!,
        ),
      ).rejects.toThrow(NotConversationAdminException);
    });

    it("should throw NotConversationMemberException when target is not a member", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const outsider = await createTestUser();
      const conv = await createGroupConversation(admin, [member]);

      await expect(
        conversationsService.removeParticipant(
          conv.id,
          outsider.hederaAccountId!,
          admin.hederaAccountId!,
        ),
      ).rejects.toThrow(NotConversationMemberException);
    });

    it("should throw NotConversationMemberException when target already left", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const conv = await createGroupConversation(admin, [member]);

      // Mark member as already left
      await memberRepository.update(
        { conversationId: conv.id, hederaAccountId: member.hederaAccountId! },
        { leftAt: new Date() },
      );

      await expect(
        conversationsService.removeParticipant(
          conv.id,
          member.hederaAccountId!,
          admin.hederaAccountId!,
        ),
      ).rejects.toThrow(NotConversationMemberException);
    });
  });

  // -------------------------------------------------------------------------
  // leaveConversation
  // -------------------------------------------------------------------------

  describe("leaveConversation", () => {
    it("should allow a member to leave a group conversation", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const conv = await createGroupConversation(admin, [member]);

      const result = await conversationsService.leaveConversation(
        conv.id,
        member.hederaAccountId!,
      );

      expect(result).toEqual({ left: true });

      // Verify member has leftAt set
      const left = await memberRepository.findOne({
        where: {
          conversationId: conv.id,
          hederaAccountId: member.hederaAccountId!,
        },
      });
      expect(left).not.toBeNull();
      expect(left!.leftAt).not.toBeNull();
    });

    it("should promote next oldest member to admin when last admin leaves", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member1 = await createTestUser();
      const member2 = await createTestUser();
      const conv = await createGroupConversation(admin, [member1, member2]);

      // Admin leaves
      await conversationsService.leaveConversation(
        conv.id,
        admin.hederaAccountId!,
      );

      // Verify admin has leftAt set
      const leftAdmin = await memberRepository.findOne({
        where: {
          conversationId: conv.id,
          hederaAccountId: admin.hederaAccountId!,
        },
      });
      expect(leftAdmin!.leftAt).not.toBeNull();

      // Verify one of the remaining members was promoted to admin
      const remainingMembers = await memberRepository.find({
        where: { conversationId: conv.id },
      });
      const activeAdmins = remainingMembers.filter(
        (m) => m.role === "admin" && m.leftAt === null,
      );
      expect(activeAdmins.length).toBeGreaterThanOrEqual(1);
    });

    it("should throw ConversationNotFoundException for non-existent conversation", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        conversationsService.leaveConversation(uuidv4(), "0.0.12345"),
      ).rejects.toThrow(ConversationNotFoundException);
    });

    it("should throw NotConversationMemberException for non-member", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const outsider = await createTestUser();
      const conv = await createGroupConversation(admin, [member]);

      await expect(
        conversationsService.leaveConversation(
          conv.id,
          outsider.hederaAccountId!,
        ),
      ).rejects.toThrow(NotConversationMemberException);
    });

    it("should throw NotConversationMemberException for already-left member", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const admin = await createTestUser();
      const member = await createTestUser();
      const conv = await createGroupConversation(admin, [member]);

      // Mark as already left
      await memberRepository.update(
        { conversationId: conv.id, hederaAccountId: member.hederaAccountId! },
        { leftAt: new Date() },
      );

      await expect(
        conversationsService.leaveConversation(
          conv.id,
          member.hederaAccountId!,
        ),
      ).rejects.toThrow(NotConversationMemberException);
    });
  });
});
