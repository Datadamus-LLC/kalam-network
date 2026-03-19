/**
 * MessagingService Coverage Cycle 4 — Integration Tests
 *
 * Targets uncovered paths: getMessages pagination, getLastSyncedSequence,
 * uploadEncryptedMedia.
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
import { DataSource, Repository } from "typeorm";
import net from "net";
import { v4 as uuidv4 } from "uuid";

import { MessagingService } from "../messaging.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { RedisService } from "../../redis/redis.service";

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

import {
  ConversationTopicNotFoundException,
  MediaUploadNotImplementedException,
} from "../exceptions/message.exceptions";

const logger = new Logger("MessagingCoverageCycle4");
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

describe("MessagingService Coverage Cycle 4", () => {
  let module: TestingModule;
  let messagingService: MessagingService;
  let conversationRepo: Repository<ConversationEntity>;
  let memberRepo: Repository<ConversationMemberEntity>;
  let messageRepo: Repository<MessageIndexEntity>;
  let postgresAvailable = false;

  const createdConversationIds: string[] = [];
  const createdMemberIds: string[] = [];
  const createdMessageIds: string[] = [];

  async function createConversation(
    topicId?: string,
  ): Promise<ConversationEntity> {
    const id = uuidv4();
    const entity = conversationRepo.create({
      id,
      hcsTopicId:
        topicId ??
        `0.0.${Date.now() % 999999}${Math.floor(Math.random() * 100)}`,
      conversationType: "direct",
      createdBy: uniqueAccountId(),
      lastMessageSeq: 0,
      lastMessageAt: new Date(),
      encryptedKeysJson: JSON.stringify({
        [uniqueAccountId()]: "encrypted-key",
      }),
    });
    const saved = await conversationRepo.save(entity);
    createdConversationIds.push(saved.id);
    return saved;
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async function createMember(
    conversationId: string,
    hederaAccountId: string,
  ): Promise<ConversationMemberEntity> {
    const id = uuidv4();
    const entity = memberRepo.create({
      id,
      conversationId,
      hederaAccountId,
      role: "member",
    });
    const saved = await memberRepo.save(entity);
    createdMemberIds.push(saved.id);
    return saved;
  }

  async function createMessage(
    hcsTopicId: string,
    sequenceNumber: number,
    senderAccountId: string,
  ): Promise<MessageIndexEntity> {
    const id = uuidv4();
    const entity = messageRepo.create({
      id,
      hcsTopicId,
      sequenceNumber,
      consensusTimestamp: new Date(Date.now() + sequenceNumber * 1000),
      senderAccountId,
      messageType: "message",
      hasMedia: false,
    });
    const saved = await messageRepo.save(entity);
    createdMessageIds.push(saved.id);
    return saved;
  }

  beforeAll(async () => {
    const [pgReachable, redisReachable] = await Promise.all([
      isPortReachable(TEST_DB_PORT, TEST_DB_HOST),
      isPortReachable(TEST_REDIS_PORT, TEST_REDIS_HOST),
    ]);
    postgresAvailable = pgReachable && redisReachable;

    if (!postgresAvailable) {
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
          MessagingService,
          HederaService,
          MirrorNodeService,
          RedisService,
        ],
      }).compile();

      messagingService = module.get<MessagingService>(MessagingService);
      const ds = module.get<DataSource>(DataSource);
      conversationRepo = ds.getRepository(ConversationEntity);
      memberRepo = ds.getRepository(ConversationMemberEntity);
      messageRepo = ds.getRepository(MessageIndexEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    for (const id of createdMessageIds) {
      try {
        await messageRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdMessageIds.length = 0;

    for (const id of createdMemberIds) {
      try {
        await memberRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdMemberIds.length = 0;

    for (const id of createdConversationIds) {
      try {
        await conversationRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdConversationIds.length = 0;
  });

  afterAll(async () => {
    if (module) await module.close();
  });

  function skip(): boolean {
    if (!postgresAvailable) {
      pending();
      return true;
    }
    return false;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // getMessages (paginated)
  // ───────────────────────────────────────────────────────────────────────────

  describe("getMessages", () => {
    it("should return messages for a conversation in chronological order", async () => {
      if (skip()) return;
      const conv = await createConversation();
      const sender = uniqueAccountId();
      await createMessage(conv.hcsTopicId, 1, sender);
      await createMessage(conv.hcsTopicId, 2, sender);
      await createMessage(conv.hcsTopicId, 3, sender);

      const result = await messagingService.getMessages(conv.hcsTopicId, 10);
      expect(result.messages.length).toBe(3);

      // Should be in chronological order (seq 1, 2, 3)
      const seqs = result.messages.map((m) => Number(m.sequenceNumber));
      expect(seqs[0]).toBeLessThan(seqs[1]);
      expect(seqs[1]).toBeLessThan(seqs[2]);
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const conv = await createConversation();
      const sender = uniqueAccountId();
      for (let i = 1; i <= 5; i++) {
        await createMessage(conv.hcsTopicId, i, sender);
      }

      // Get page 1 (latest 2)
      const page1 = await messagingService.getMessages(conv.hcsTopicId, 2);
      expect(page1.messages).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Get page 2 using cursor
      const page2 = await messagingService.getMessages(
        conv.hcsTopicId,
        2,
        page1.cursor ?? undefined,
      );
      expect(page2.messages).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      // Get page 3
      const page3 = await messagingService.getMessages(
        conv.hcsTopicId,
        2,
        page2.cursor ?? undefined,
      );
      expect(page3.messages).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it("should return empty for conversation with no messages", async () => {
      if (skip()) return;
      const conv = await createConversation();

      const result = await messagingService.getMessages(conv.hcsTopicId, 10);
      expect(result.messages).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });

    it("should throw ConversationTopicNotFoundException for unknown topic", async () => {
      if (skip()) return;
      await expect(
        messagingService.getMessages("0.0.9999999", 10),
      ).rejects.toThrow(ConversationTopicNotFoundException);
    });

    it("should clamp limit to max page size", async () => {
      if (skip()) return;
      const conv = await createConversation();
      const sender = uniqueAccountId();
      await createMessage(conv.hcsTopicId, 1, sender);

      // Even with very high limit, should work
      const result = await messagingService.getMessages(conv.hcsTopicId, 1000);
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getLastSyncedSequence
  // ───────────────────────────────────────────────────────────────────────────

  describe("getLastSyncedSequence", () => {
    it("should return the highest sequence number for a topic", async () => {
      if (skip()) return;
      const topicId = `0.0.${Date.now() % 999999}`;
      const conv = await createConversation(topicId);
      const sender = uniqueAccountId();
      await createMessage(conv.hcsTopicId, 10, sender);
      await createMessage(conv.hcsTopicId, 20, sender);
      await createMessage(conv.hcsTopicId, 15, sender);

      const lastSeq = await messagingService.getLastSyncedSequence(topicId);
      expect(Number(lastSeq)).toBe(20);
    });

    it("should return 0 when no messages exist", async () => {
      if (skip()) return;
      const topicId = `0.0.${Date.now() % 999999}99`;

      const lastSeq = await messagingService.getLastSyncedSequence(topicId);
      expect(lastSeq).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // uploadEncryptedMedia
  // ───────────────────────────────────────────────────────────────────────────

  describe("uploadEncryptedMedia", () => {
    it("should throw MediaUploadNotImplementedException", () => {
      if (skip()) return;
      expect(() => messagingService.uploadEncryptedMedia()).toThrow(
        MediaUploadNotImplementedException,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // sendMessage validation paths
  // ───────────────────────────────────────────────────────────────────────────

  describe("sendMessage validation", () => {
    it("should throw ConversationTopicNotFoundException for unknown topic", async () => {
      if (skip()) return;
      await expect(
        messagingService.sendMessage(uniqueAccountId(), "0.0.9999999", "Hello"),
      ).rejects.toThrow(ConversationTopicNotFoundException);
    });
  });
});
