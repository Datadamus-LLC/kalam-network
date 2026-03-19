/**
 * PaymentsService Coverage Cycle 4 — Integration Tests
 *
 * Targets uncovered DB query paths: queryTransactions, getTransactionDetail,
 * getPaymentHistory, getPaymentRequests, declinePaymentRequest, cancelPaymentRequest.
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

import { PaymentsService } from "../payments.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { TamamCustodyService } from "../../integrations/tamam-custody/tamam-custody.service";
import { RedisService } from "../../redis/redis.service";

import { PaymentRequestEntity } from "../../../database/entities/payment-request.entity";
import { PaymentIndexEntity } from "../../../database/entities/payment-index.entity";
import { TransactionEntity } from "../../../database/entities/transaction.entity";
import { ConversationMemberEntity } from "../../../database/entities/conversation-member.entity";
import { ConversationEntity } from "../../../database/entities/conversation.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { NotificationEntity } from "../../../database/entities/notification.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import { OrganizationEntity } from "../../../database/entities/organization.entity";
import { OrganizationMemberEntity } from "../../../database/entities/organization-member.entity";
import { OrganizationInvitationEntity } from "../../../database/entities/organization-invitation.entity";
import { PlatformTopicEntity } from "../../../database/entities/platform-topic.entity";
import { BusinessProfileEntity } from "../../../database/entities/business-profile.entity";
import { MessageIndexEntity } from "../../../database/entities/message-index.entity";

import {
  PaymentRequestNotFoundException,
  PaymentRequestAlreadyDeclinedException,
  PaymentRequestAlreadyCancelledException,
  PaymentRequestNotActionableException,
  InvalidPaymentAmountException,
  InvalidCurrencyException,
  TransactionNotFoundException,
} from "../exceptions/payment.exceptions";

import type { JwtPayload } from "../../../common/guards/jwt-auth.guard";

const logger = new Logger("PaymentsCoverageCycle4");
const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

const ALL_ENTITIES = [
  PaymentRequestEntity,
  PaymentIndexEntity,
  TransactionEntity,
  ConversationMemberEntity,
  ConversationEntity,
  UserEntity,
  NotificationEntity,
  SocialFollowEntity,
  FollowerCountEntity,
  PostIndexEntity,
  FeedItemEntity,
  PostLikeEntity,
  PostCommentEntity,
  OrganizationEntity,
  OrganizationMemberEntity,
  OrganizationInvitationEntity,
  PlatformTopicEntity,
  BusinessProfileEntity,
  MessageIndexEntity,
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

describe("PaymentsService Coverage Cycle 4", () => {
  let module: TestingModule;
  let paymentsService: PaymentsService;
  let dataSource: DataSource;
  let paymentRequestRepo: Repository<PaymentRequestEntity>;
  let paymentIndexRepo: Repository<PaymentIndexEntity>;
  let transactionRepo: Repository<TransactionEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;

  const createdUserIds: string[] = [];
  const createdPaymentRequestIds: string[] = [];
  const createdPaymentIndexIds: string[] = [];
  const createdTransactionIds: string[] = [];

  async function createTestUser(
    overrides?: Partial<UserEntity>,
  ): Promise<UserEntity> {
    const id = uuidv4();
    const user = userRepo.create({
      id,
      displayName: `Test User ${id.slice(0, 8)}`,
      hederaAccountId: uniqueAccountId(),
      status: "active",
      ...overrides,
    });
    const saved = await userRepo.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  function makeJwtPayload(userId: string, hederaAccountId: string): JwtPayload {
    return {
      sub: userId,
      hederaAccountId,
      identifier: `test-${userId.slice(0, 8)}@test.local`,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  async function createPaymentRequest(
    requesterUserId: string,
    overrides?: Partial<PaymentRequestEntity>,
  ): Promise<PaymentRequestEntity> {
    const id = uuidv4();
    const entity = paymentRequestRepo.create({
      id,
      requesterUserId,
      hcsTopicId: `0.0.${Date.now() % 999999}`,
      hcsSequenceNumber: 1,
      amount: 10,
      currency: "TMUSD",
      status: "pending",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      ...overrides,
    });
    const saved = await paymentRequestRepo.save(entity);
    createdPaymentRequestIds.push(saved.id);
    return saved;
  }

  async function createTransaction(
    userId: string,
    counterpartyId: string,
    overrides?: Partial<TransactionEntity>,
  ): Promise<TransactionEntity> {
    const id = uuidv4();
    const entity = transactionRepo.create({
      id,
      userId,
      counterpartyId,
      direction: "sent",
      amount: 5,
      currency: "TMUSD",
      status: "completed",
      paymentType: "send",
      completedAt: new Date(),
      ...overrides,
    });
    const saved = await transactionRepo.save(entity);
    createdTransactionIds.push(saved.id);
    return saved;
  }

  async function createPaymentIndex(
    senderAccountId: string,
    recipientAccountId: string,
    overrides?: Partial<PaymentIndexEntity>,
  ): Promise<PaymentIndexEntity> {
    const id = uuidv4();
    const entity = paymentIndexRepo.create({
      id,
      senderAccountId,
      recipientAccountId,
      amount: 5,
      currency: "TMUSD",
      htsTransactionId: `0.0.${Date.now()}@${Date.now()}`,
      hcsTopicId: `0.0.${Date.now() % 999999}`,
      hcsSequenceNumber: 1,
      paymentType: "send",
      tamamReference: "",
      status: "confirmed",
      ...overrides,
    });
    const saved = await paymentIndexRepo.save(entity);
    createdPaymentIndexIds.push(saved.id);
    return saved;
  }

  beforeAll(async () => {
    const [pgReachable, redisReachable] = await Promise.all([
      isPortReachable(TEST_DB_PORT, TEST_DB_HOST),
      isPortReachable(TEST_REDIS_PORT, TEST_REDIS_HOST),
    ]);
    postgresAvailable = pgReachable;

    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available on port 5433 — tests will be skipped",
      );
      return;
    }

    if (!redisReachable) {
      logger.warn("Redis not available on port 6380 — tests will be skipped");
      postgresAvailable = false;
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
                tamam: { custody: { apiUrl: "", apiKey: "", apiSecret: "" } },
                hashscan: { baseUrl: "https://hashscan.io" },
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
          PaymentsService,
          HederaService,
          MirrorNodeService,
          TamamCustodyService,
          RedisService,
        ],
      }).compile();

      paymentsService = module.get<PaymentsService>(PaymentsService);
      dataSource = module.get<DataSource>(DataSource);
      paymentRequestRepo = dataSource.getRepository(PaymentRequestEntity);
      paymentIndexRepo = dataSource.getRepository(PaymentIndexEntity);
      transactionRepo = dataSource.getRepository(TransactionEntity);
      userRepo = dataSource.getRepository(UserEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    for (const id of createdTransactionIds) {
      try {
        await transactionRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdTransactionIds.length = 0;

    for (const id of createdPaymentIndexIds) {
      try {
        await paymentIndexRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdPaymentIndexIds.length = 0;

    for (const id of createdPaymentRequestIds) {
      try {
        await paymentRequestRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdPaymentRequestIds.length = 0;

    for (const id of createdUserIds) {
      try {
        await userRepo.delete(id);
      } catch {
        /* best-effort */
      }
    }
    createdUserIds.length = 0;
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
  // queryTransactions
  // ───────────────────────────────────────────────────────────────────────────

  describe("queryTransactions", () => {
    it("should return transactions for a user", async () => {
      if (skip()) return;
      const sender = await createTestUser();
      const receiver = await createTestUser();
      await createTransaction(sender.id, receiver.id, {
        direction: "sent",
        amount: 10,
      });
      await createTransaction(sender.id, receiver.id, {
        direction: "sent",
        amount: 20,
      });

      const result = await paymentsService.queryTransactions(sender.id);
      expect(result.transactions.length).toBeGreaterThanOrEqual(2);
      expect(result.hasMore).toBe(false);
    });

    it("should filter by direction=sent", async () => {
      if (skip()) return;
      const sender = await createTestUser();
      const receiver = await createTestUser();
      await createTransaction(sender.id, receiver.id, { direction: "sent" });
      await createTransaction(receiver.id, sender.id, {
        direction: "received",
        userId: sender.id,
        counterpartyId: receiver.id,
      });

      const result = await paymentsService.queryTransactions(sender.id, {
        direction: "sent",
      });
      for (const tx of result.transactions) {
        expect(tx.direction).toBe("sent");
      }
    });

    it("should filter by status=completed", async () => {
      if (skip()) return;
      const sender = await createTestUser();
      const receiver = await createTestUser();
      await createTransaction(sender.id, receiver.id, { status: "completed" });
      await createTransaction(sender.id, receiver.id, { status: "failed" });

      const result = await paymentsService.queryTransactions(sender.id, {
        status: "completed",
      });
      for (const tx of result.transactions) {
        expect(tx.status).toBe("completed");
      }
    });

    it("should filter by date range", async () => {
      if (skip()) return;
      const sender = await createTestUser();
      const receiver = await createTestUser();
      await createTransaction(sender.id, receiver.id);

      const now = new Date();
      const result = await paymentsService.queryTransactions(sender.id, {
        from: new Date(now.getTime() - 60000).toISOString(),
        to: new Date(now.getTime() + 60000).toISOString(),
      });
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const sender = await createTestUser();
      const receiver = await createTestUser();
      for (let i = 0; i < 3; i++) {
        await createTransaction(sender.id, receiver.id);
        await new Promise<void>((r) => {
          const t = setTimeout(() => {
            clearTimeout(t);
            r();
          }, 50);
        });
      }

      const page1 = await paymentsService.queryTransactions(sender.id, {
        limit: 2,
      });
      expect(page1.transactions.length).toBe(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await paymentsService.queryTransactions(sender.id, {
        limit: 2,
        cursor: page1.cursor ?? undefined,
      });
      expect(page2.transactions.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty when no transactions exist", async () => {
      if (skip()) return;
      const user = await createTestUser();
      const result = await paymentsService.queryTransactions(user.id);
      expect(result.transactions).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getTransactionDetail
  // ───────────────────────────────────────────────────────────────────────────

  describe("getTransactionDetail", () => {
    it("should return full transaction detail with counterparty profile", async () => {
      if (skip()) return;
      const sender = await createTestUser({ displayName: "Sender Name" });
      const receiver = await createTestUser({ displayName: "Receiver Name" });
      const tx = await createTransaction(sender.id, receiver.id, {
        hederaTxId: "0.0.12345@1234567890.123",
        hcsMessageSeq: 42,
      });

      const detail = await paymentsService.getTransactionDetail(
        tx.id,
        sender.id,
      );
      expect(detail.id).toBe(tx.id);
      expect(detail.direction).toBe("sent");
      expect(detail.counterpartyProfile).not.toBeNull();
      expect(detail.counterpartyProfile?.displayName).toBe("Receiver Name");
      expect(detail.onChainProof).toBeDefined();
      expect(detail.onChainProof.htsExplorerUrl).toContain(
        "0.0.12345@1234567890.123",
      );
    });

    it("should throw TransactionNotFoundException when not found", async () => {
      if (skip()) return;
      const user = await createTestUser();
      await expect(
        paymentsService.getTransactionDetail(uuidv4(), user.id),
      ).rejects.toThrow(TransactionNotFoundException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getPaymentHistory
  // ───────────────────────────────────────────────────────────────────────────

  describe("getPaymentHistory", () => {
    it("should return paginated payment history for a user", async () => {
      if (skip()) return;
      const senderAccount = uniqueAccountId();
      const recipientAccount = uniqueAccountId();
      await createPaymentIndex(senderAccount, recipientAccount);
      await createPaymentIndex(senderAccount, recipientAccount);

      const result = await paymentsService.getPaymentHistory(senderAccount);
      expect(result.transactions.length).toBeGreaterThanOrEqual(2);
      for (const tx of result.transactions) {
        expect(tx.direction).toBe("sent");
      }
    });

    it("should set direction=received for recipient", async () => {
      if (skip()) return;
      const senderAccount = uniqueAccountId();
      const recipientAccount = uniqueAccountId();
      await createPaymentIndex(senderAccount, recipientAccount);

      const result = await paymentsService.getPaymentHistory(recipientAccount);
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
      expect(result.transactions[0].direction).toBe("received");
    });

    it("should paginate with cursor", async () => {
      if (skip()) return;
      const senderAccount = uniqueAccountId();
      const recipientAccount = uniqueAccountId();
      for (let i = 0; i < 3; i++) {
        await createPaymentIndex(senderAccount, recipientAccount);
        await new Promise<void>((r) => {
          const t = setTimeout(() => {
            clearTimeout(t);
            r();
          }, 50);
        });
      }

      const page1 = await paymentsService.getPaymentHistory(senderAccount, 2);
      expect(page1.transactions).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await paymentsService.getPaymentHistory(
        senderAccount,
        2,
        page1.cursor ?? undefined,
      );
      expect(page2.transactions.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty when no payments exist", async () => {
      if (skip()) return;
      const result = await paymentsService.getPaymentHistory(uniqueAccountId());
      expect(result.transactions).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getPaymentRequests
  // ───────────────────────────────────────────────────────────────────────────

  describe("getPaymentRequests", () => {
    it("should list payment requests with pagination", async () => {
      if (skip()) return;
      const user = await createTestUser();
      for (let i = 0; i < 3; i++) {
        await createPaymentRequest(user.id);
        await new Promise<void>((r) => {
          const t = setTimeout(() => {
            clearTimeout(t);
            r();
          }, 50);
        });
      }

      const page1 = await paymentsService.getPaymentRequests(
        undefined,
        undefined,
        2,
      );
      expect(page1.requests.length).toBeGreaterThanOrEqual(2);
    });

    it("should filter by status", async () => {
      if (skip()) return;
      const user = await createTestUser();
      await createPaymentRequest(user.id, { status: "pending" });
      await createPaymentRequest(user.id, { status: "declined" });

      const result = await paymentsService.getPaymentRequests(
        undefined,
        "pending",
      );
      for (const req of result.requests) {
        expect(req.status).toBe("pending");
      }
    });

    it("should auto-expire past-due requests", async () => {
      if (skip()) return;
      const user = await createTestUser();
      await createPaymentRequest(user.id, {
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await paymentsService.getPaymentRequests();
      const expired = result.requests.filter((r) => r.status === "expired");
      expect(expired.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // declinePaymentRequest validation
  // ───────────────────────────────────────────────────────────────────────────

  describe("declinePaymentRequest validation", () => {
    it("should throw when requester tries to decline own request", async () => {
      if (skip()) return;
      const user = await createTestUser();
      const request = await createPaymentRequest(user.id);
      const jwt = makeJwtPayload(user.id, user.hederaAccountId!);

      await expect(
        paymentsService.declinePaymentRequest(jwt, request.id),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should throw for already declined request", async () => {
      if (skip()) return;
      const requester = await createTestUser();
      const decliner = await createTestUser();
      const request = await createPaymentRequest(requester.id, {
        status: "declined",
      });
      const jwt = makeJwtPayload(decliner.id, decliner.hederaAccountId!);

      await expect(
        paymentsService.declinePaymentRequest(jwt, request.id),
      ).rejects.toThrow(PaymentRequestAlreadyDeclinedException);
    });

    it("should throw for non-pending request", async () => {
      if (skip()) return;
      const requester = await createTestUser();
      const decliner = await createTestUser();
      const request = await createPaymentRequest(requester.id, {
        status: "paid",
      });
      const jwt = makeJwtPayload(decliner.id, decliner.hederaAccountId!);

      await expect(
        paymentsService.declinePaymentRequest(jwt, request.id),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should throw for non-existent request", async () => {
      if (skip()) return;
      const user = await createTestUser();
      const jwt = makeJwtPayload(user.id, user.hederaAccountId!);

      await expect(
        paymentsService.declinePaymentRequest(jwt, uuidv4()),
      ).rejects.toThrow(PaymentRequestNotFoundException);
    });

    it("should decline a pending request from another user", async () => {
      if (skip()) return;
      const requester = await createTestUser();
      const decliner = await createTestUser();
      const request = await createPaymentRequest(requester.id, {
        status: "pending",
      });
      const jwt = makeJwtPayload(decliner.id, decliner.hederaAccountId!);

      // HCS submission will fail (no topic configured) but decline should still persist
      const result = await paymentsService.declinePaymentRequest(
        jwt,
        request.id,
      );
      expect(result.status).toBe("declined");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // cancelPaymentRequest validation
  // ───────────────────────────────────────────────────────────────────────────

  describe("cancelPaymentRequest validation", () => {
    it("should throw when non-requester tries to cancel", async () => {
      if (skip()) return;
      const requester = await createTestUser();
      const other = await createTestUser();
      const request = await createPaymentRequest(requester.id);
      const jwt = makeJwtPayload(other.id, other.hederaAccountId!);

      await expect(
        paymentsService.cancelPaymentRequest(jwt, request.id),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should throw for already cancelled request", async () => {
      if (skip()) return;
      const requester = await createTestUser();
      const request = await createPaymentRequest(requester.id, {
        status: "cancelled",
      });
      const jwt = makeJwtPayload(requester.id, requester.hederaAccountId!);

      await expect(
        paymentsService.cancelPaymentRequest(jwt, request.id),
      ).rejects.toThrow(PaymentRequestAlreadyCancelledException);
    });

    it("should throw for non-pending request", async () => {
      if (skip()) return;
      const requester = await createTestUser();
      const request = await createPaymentRequest(requester.id, {
        status: "paid",
      });
      const jwt = makeJwtPayload(requester.id, requester.hederaAccountId!);

      await expect(
        paymentsService.cancelPaymentRequest(jwt, request.id),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should cancel a pending request by the requester", async () => {
      if (skip()) return;
      const requester = await createTestUser();
      const request = await createPaymentRequest(requester.id, {
        status: "pending",
      });
      const jwt = makeJwtPayload(requester.id, requester.hederaAccountId!);

      const result = await paymentsService.cancelPaymentRequest(
        jwt,
        request.id,
      );
      expect(result.status).toBe("cancelled");
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Validation helpers (tested indirectly via sendPayment)
  // ───────────────────────────────────────────────────────────────────────────

  describe("validateCurrency / validateAmount", () => {
    it("should throw InvalidCurrencyException for unsupported currency", async () => {
      if (skip()) return;
      const sender = await createTestUser();
      const receiver = await createTestUser();
      const jwt = makeJwtPayload(sender.id, sender.hederaAccountId!);

      await expect(
        paymentsService.sendPayment(
          jwt,
          receiver.hederaAccountId!,
          10,
          "BTC",
          "0.0.999",
        ),
      ).rejects.toThrow(InvalidCurrencyException);
    });

    it("should throw InvalidPaymentAmountException for amount below minimum", async () => {
      if (skip()) return;
      const sender = await createTestUser();
      const receiver = await createTestUser();
      const jwt = makeJwtPayload(sender.id, sender.hederaAccountId!);

      await expect(
        paymentsService.sendPayment(
          jwt,
          receiver.hederaAccountId!,
          0,
          "TMUSD",
          "0.0.999",
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw when sending to yourself", async () => {
      if (skip()) return;
      const sender = await createTestUser();
      const jwt = makeJwtPayload(sender.id, sender.hederaAccountId!);

      await expect(
        paymentsService.sendPayment(
          jwt,
          sender.hederaAccountId!,
          10,
          "TMUSD",
          "0.0.999",
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // getPaymentRequest (single)
  // ───────────────────────────────────────────────────────────────────────────

  describe("getPaymentRequest", () => {
    it("should return a single payment request by ID", async () => {
      if (skip()) return;
      const user = await createTestUser();
      const request = await createPaymentRequest(user.id, {
        description: "Test request",
      });

      const result = await paymentsService.getPaymentRequest(request.id);
      expect(result.id).toBe(request.id);
      expect(result.description).toBe("Test request");
      expect(result.status).toBe("pending");
    });

    it("should auto-expire if past expiresAt", async () => {
      if (skip()) return;
      const user = await createTestUser();
      const request = await createPaymentRequest(user.id, {
        status: "pending",
        expiresAt: new Date(Date.now() - 1000),
      });

      const result = await paymentsService.getPaymentRequest(request.id);
      expect(result.status).toBe("expired");
    });

    it("should throw PaymentRequestNotFoundException for non-existent", async () => {
      if (skip()) return;
      await expect(paymentsService.getPaymentRequest(uuidv4())).rejects.toThrow(
        PaymentRequestNotFoundException,
      );
    });
  });
});
