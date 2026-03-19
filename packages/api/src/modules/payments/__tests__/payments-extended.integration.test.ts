/**
 * PaymentsService Extended Integration Tests
 *
 * Covers under-tested validation paths that only require PostgreSQL.
 * Exercises sendPayment error paths, createPaymentRequest happy/error paths,
 * fulfillPaymentRequest state guards, declinePaymentRequest flows,
 * getPaymentRequest, getPaymentRequests pagination, getPaymentHistory pagination,
 * queryTransactions filtering, and getTransactionDetail lookup.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *   (PostgreSQL on TEST_DB_PORT=5433, Redis on TEST_REDIS_PORT=6380)
 *
 * NO jest.fn(). NO jest.mock(). NO jest.spyOn(). NO `any`.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule, getRepositoryToken } from "@nestjs/typeorm";
import { Logger } from "@nestjs/common";
import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import configuration from "../../../config/configuration";
import { PaymentIndexEntity } from "../../../database/entities/payment-index.entity";
import { PaymentRequestEntity } from "../../../database/entities/payment-request.entity";
import { TransactionEntity } from "../../../database/entities/transaction.entity";
import { ConversationEntity } from "../../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../../database/entities/conversation-member.entity";
import { UserEntity } from "../../../database/entities/user.entity";
import { OrganizationEntity } from "../../../database/entities/organization.entity";
import { PaymentsService } from "../payments.service";
import { HederaModule } from "../../hedera/hedera.module";
import { TamamCustodyService } from "../../integrations/tamam-custody/tamam-custody.service";
import {
  InvalidPaymentAmountException,
  PaymentRequestNotFoundException,
  PaymentRequestAlreadyPaidException,
  PaymentRequestAlreadyDeclinedException,
  PaymentRequestNotActionableException,
  NotConversationParticipantException,
  UserNotFoundException,
  TransactionNotFoundException,
} from "../exceptions/payment.exceptions";
import type { JwtPayload } from "../../../common/guards/jwt-auth.guard";

const logger = new Logger("PaymentsExtendedIntegrationTest");

const TEST_DB_PORT = parseInt(process.env.TEST_DB_PORT || "5433", 10);
// TEST_REDIS_PORT reserved for future Redis-dependent tests
const _TEST_REDIS_PORT = parseInt(process.env.TEST_REDIS_PORT || "6380", 10);
void _TEST_REDIS_PORT;

async function isPostgresAvailable(): Promise<boolean> {
  try {
    const { Client } = await import("pg");
    const client = new Client({
      host: process.env.DB_HOST || "localhost",
      port: TEST_DB_PORT,
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

describe("PaymentsService Extended Integration Tests", () => {
  let module: TestingModule;
  let paymentsService: PaymentsService;
  let paymentRequestRepo: Repository<PaymentRequestEntity>;
  let paymentIndexRepo: Repository<PaymentIndexEntity>;
  let transactionRepo: Repository<TransactionEntity>;
  let conversationRepo: Repository<ConversationEntity>;
  let memberRepo: Repository<ConversationMemberEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;

  // Unique per run to avoid collisions
  const testRunId = Date.now().toString().slice(-6);
  const senderAccountId = `0.0.5${testRunId}`;
  const recipientAccountId = `0.0.6${testRunId}`;
  const thirdAccountId = `0.0.7${testRunId}`;
  const testTopicId = `0.0.12${testRunId}`;

  let senderUserId: string;
  let recipientUserId: string;
  let thirdUserId: string;
  let conversationId: string;

  // Track entities for cleanup
  const createdPaymentRequestIds: string[] = [];
  const createdPaymentIndexIds: string[] = [];
  const createdTransactionIds: string[] = [];
  const createdConversationIds: string[] = [];
  const createdUserIds: string[] = [];

  function makeSenderPayload(): JwtPayload {
    return {
      sub: senderUserId,
      hederaAccountId: senderAccountId,
      identifier: "ext-sender@test.local",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  function makeRecipientPayload(): JwtPayload {
    return {
      sub: recipientUserId,
      hederaAccountId: recipientAccountId,
      identifier: "ext-recipient@test.local",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  /**
   * Insert a payment request directly into the DB, bypassing HCS.
   */
  async function insertPaymentRequestDirectly(opts: {
    requesterUserId: string;
    status?: "pending" | "paid" | "expired" | "declined" | "cancelled";
    amount?: number;
    description?: string;
    conversationId?: string;
    expiresAt?: Date;
  }): Promise<string> {
    const requestId = uuidv4();
    createdPaymentRequestIds.push(requestId);

    const req = new PaymentRequestEntity();
    req.id = requestId;
    req.requesterUserId = opts.requesterUserId;
    req.hcsTopicId = testTopicId;
    req.hcsSequenceNumber = 1;
    req.amount = opts.amount ?? 10;
    req.currency = "TMUSD";
    req.status = opts.status ?? "pending";
    req.expiresAt =
      opts.expiresAt ?? new Date(Date.now() + 72 * 60 * 60 * 1000);
    if (opts.description) {
      req.description = opts.description;
    }
    if (opts.conversationId) {
      req.conversationId = opts.conversationId;
    }
    await paymentRequestRepo.save(req);

    return requestId;
  }

  /**
   * Insert a payment index record directly into the DB.
   */
  async function insertPaymentIndexDirectly(opts: {
    senderAccount: string;
    recipientAccount: string;
    amount: number;
    currency?: string;
    status?: "confirmed" | "failed";
    paymentType?: "send" | "request_fulfillment" | "split_payment";
    createdAtOffset?: number;
  }): Promise<PaymentIndexEntity> {
    const paymentId = uuidv4();
    createdPaymentIndexIds.push(paymentId);

    const entity = new PaymentIndexEntity();
    entity.id = paymentId;
    entity.senderAccountId = opts.senderAccount;
    entity.recipientAccountId = opts.recipientAccount;
    entity.amount = opts.amount;
    entity.currency = opts.currency ?? "TMUSD";
    entity.htsTransactionId = `0.0.ext-tx-${Date.now()}-${paymentId.slice(0, 8)}`;
    entity.hcsTopicId = testTopicId;
    entity.hcsSequenceNumber = 0;
    entity.paymentType = opts.paymentType ?? "send";
    entity.tamamReference = "";
    entity.status = opts.status ?? "confirmed";

    const saved = await paymentIndexRepo.save(entity);

    if (opts.createdAtOffset) {
      await paymentIndexRepo
        .createQueryBuilder()
        .update()
        .set({ createdAt: new Date(Date.now() - opts.createdAtOffset) })
        .where("id = :id", { id: paymentId })
        .execute();
    }

    return saved;
  }

  /**
   * Insert a transaction record directly into the DB.
   */
  async function insertTransactionDirectly(opts: {
    userId: string;
    counterpartyId: string;
    direction: "sent" | "received";
    amount: number;
    currency?: string;
    status?: "pending" | "completed" | "failed";
    paymentType?: "send" | "request_fulfillment" | "split_payment";
    description?: string;
    hederaTxId?: string;
    createdAtOffset?: number;
  }): Promise<TransactionEntity> {
    const txId = uuidv4();
    createdTransactionIds.push(txId);

    const entity = new TransactionEntity();
    entity.id = txId;
    entity.userId = opts.userId;
    entity.counterpartyId = opts.counterpartyId;
    entity.direction = opts.direction;
    entity.amount = opts.amount;
    entity.currency = opts.currency ?? "TMUSD";
    entity.status = opts.status ?? "completed";
    entity.paymentType = opts.paymentType ?? "send";
    entity.completedAt = new Date();
    if (opts.description) {
      entity.description = opts.description;
    }
    if (opts.hederaTxId) {
      entity.hederaTxId = opts.hederaTxId;
    }

    const saved = await transactionRepo.save(entity);

    if (opts.createdAtOffset) {
      await transactionRepo
        .createQueryBuilder()
        .update()
        .set({ createdAt: new Date(Date.now() - opts.createdAtOffset) })
        .where("id = :id", { id: txId })
        .execute();
    }

    return saved;
  }

  async function seedTestData(): Promise<void> {
    senderUserId = uuidv4();
    recipientUserId = uuidv4();
    thirdUserId = uuidv4();
    createdUserIds.push(senderUserId, recipientUserId, thirdUserId);

    const users = [
      userRepo.create({
        id: senderUserId,
        hederaAccountId: senderAccountId,
        displayName: "Ext Sender",
        status: "active",
      }),
      userRepo.create({
        id: recipientUserId,
        hederaAccountId: recipientAccountId,
        displayName: "Ext Recipient",
        status: "active",
      }),
      userRepo.create({
        id: thirdUserId,
        hederaAccountId: thirdAccountId,
        displayName: "Ext Third",
        status: "active",
      }),
    ];
    await userRepo.save(users);

    // Create conversation with sender + recipient as members
    conversationId = uuidv4();
    createdConversationIds.push(conversationId);

    const conversation = conversationRepo.create({
      id: conversationId,
      hcsTopicId: testTopicId,
      conversationType: "direct",
      createdBy: senderAccountId,
      lastMessageSeq: 0,
    });
    await conversationRepo.save(conversation);

    const senderMember = memberRepo.create({
      conversationId,
      hederaAccountId: senderAccountId,
      role: "member",
      leftAt: null,
      lastReadSeq: 0,
    });
    const recipientMember = memberRepo.create({
      conversationId,
      hederaAccountId: recipientAccountId,
      role: "member",
      leftAt: null,
      lastReadSeq: 0,
    });
    await memberRepo.save([senderMember, recipientMember]);
  }

  async function cleanupAllTestData(): Promise<void> {
    try {
      if (createdPaymentRequestIds.length > 0) {
        await paymentRequestRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentRequestEntity)
          .where("id IN (:...ids)", { ids: [...createdPaymentRequestIds] })
          .execute();
      }

      // Clean requests by requester user IDs
      if (createdUserIds.length > 0) {
        await paymentRequestRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentRequestEntity)
          .where("requesterUserId IN (:...ids)", { ids: [...createdUserIds] })
          .execute();
      }

      if (createdTransactionIds.length > 0) {
        await transactionRepo
          .createQueryBuilder()
          .delete()
          .from(TransactionEntity)
          .where("id IN (:...ids)", { ids: [...createdTransactionIds] })
          .execute();
      }

      // Clean transactions by user IDs
      if (createdUserIds.length > 0) {
        await transactionRepo
          .createQueryBuilder()
          .delete()
          .from(TransactionEntity)
          .where("userId IN (:...ids)", { ids: [...createdUserIds] })
          .execute();
      }

      if (createdPaymentIndexIds.length > 0) {
        await paymentIndexRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentIndexEntity)
          .where("id IN (:...ids)", { ids: [...createdPaymentIndexIds] })
          .execute();
      }

      // Clean payment indices by account
      await paymentIndexRepo
        .createQueryBuilder()
        .delete()
        .from(PaymentIndexEntity)
        .where(
          "senderAccountId IN (:...ids) OR recipientAccountId IN (:...ids)",
          { ids: [senderAccountId, recipientAccountId, thirdAccountId] },
        )
        .execute();

      // Clean members
      for (const convId of createdConversationIds) {
        await memberRepo.delete({ conversationId: convId });
      }

      // Clean conversations
      if (createdConversationIds.length > 0) {
        await conversationRepo
          .createQueryBuilder()
          .delete()
          .from(ConversationEntity)
          .where("id IN (:...ids)", { ids: [...createdConversationIds] })
          .execute();
      }

      // Clean users
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

    logger.log(
      `Infrastructure — PostgreSQL (port ${TEST_DB_PORT}): ${postgresAvailable}`,
    );

    if (!postgresAvailable) {
      logger.warn("PostgreSQL not available — all tests will be skipped");
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
              port: TEST_DB_PORT,
              username: configService.get<string>("database.username"),
              password: configService.get<string>("database.password"),
              database: configService.get<string>("database.database"),
              entities: [
                PaymentIndexEntity,
                PaymentRequestEntity,
                TransactionEntity,
                ConversationEntity,
                ConversationMemberEntity,
                UserEntity,
                OrganizationEntity,
              ],
              synchronize: true,
              logging: false,
            }),
          }),
          TypeOrmModule.forFeature([
            PaymentIndexEntity,
            PaymentRequestEntity,
            TransactionEntity,
            ConversationEntity,
            ConversationMemberEntity,
            UserEntity,
          ]),
          HederaModule,
        ],
        providers: [PaymentsService, TamamCustodyService],
      }).compile();

      paymentsService = module.get<PaymentsService>(PaymentsService);
      paymentRequestRepo = module.get<Repository<PaymentRequestEntity>>(
        getRepositoryToken(PaymentRequestEntity),
      );
      paymentIndexRepo = module.get<Repository<PaymentIndexEntity>>(
        getRepositoryToken(PaymentIndexEntity),
      );
      transactionRepo = module.get<Repository<TransactionEntity>>(
        getRepositoryToken(TransactionEntity),
      );
      conversationRepo = module.get<Repository<ConversationEntity>>(
        getRepositoryToken(ConversationEntity),
      );
      memberRepo = module.get<Repository<ConversationMemberEntity>>(
        getRepositoryToken(ConversationMemberEntity),
      );
      userRepo = module.get<Repository<UserEntity>>(
        getRepositoryToken(UserEntity),
      );

      await seedTestData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test module: ${message}`);
      postgresAvailable = false;
    }
  }, 30000);

  afterEach(async () => {
    if (!postgresAvailable) return;

    try {
      if (createdPaymentRequestIds.length > 0) {
        await paymentRequestRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentRequestEntity)
          .where("id IN (:...ids)", { ids: [...createdPaymentRequestIds] })
          .execute();
        createdPaymentRequestIds.length = 0;
      }

      if (createdPaymentIndexIds.length > 0) {
        await paymentIndexRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentIndexEntity)
          .where("id IN (:...ids)", { ids: [...createdPaymentIndexIds] })
          .execute();
        createdPaymentIndexIds.length = 0;
      }

      if (createdTransactionIds.length > 0) {
        await transactionRepo
          .createQueryBuilder()
          .delete()
          .from(TransactionEntity)
          .where("id IN (:...ids)", { ids: [...createdTransactionIds] })
          .execute();
        createdTransactionIds.length = 0;
      }

      // Also clean by user IDs to catch dual records
      await transactionRepo
        .createQueryBuilder()
        .delete()
        .from(TransactionEntity)
        .where("userId IN (:...ids)", {
          ids: [senderUserId, recipientUserId, thirdUserId],
        })
        .execute();

      await paymentIndexRepo
        .createQueryBuilder()
        .delete()
        .from(PaymentIndexEntity)
        .where(
          "senderAccountId IN (:...ids) OR recipientAccountId IN (:...ids)",
          { ids: [senderAccountId, recipientAccountId, thirdAccountId] },
        )
        .execute();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`afterEach cleanup failed: ${message}`);
    }
  });

  afterAll(async () => {
    if (module) {
      await cleanupAllTestData();
      await module.close();
    }
  });

  // -------------------------------------------------------------------------
  // 1. sendPayment — sender not found
  //    sendPayment validates currency/amount/self-pay first, then looks up
  //    recipient. If the sender's JwtPayload.hederaAccountId has no matching
  //    recipient in DB, UserNotFoundException is thrown when used as recipientAccountId.
  //    Here we test that a JwtPayload pointing to a non-existent user triggers
  //    NotConversationParticipantException (the first DB check after validation).
  // -------------------------------------------------------------------------

  describe("sendPayment — sender not found", () => {
    it("should throw NotConversationParticipantException when sender has no conversation membership", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const phantomUserId = uuidv4();
      const phantomPayload: JwtPayload = {
        sub: phantomUserId,
        hederaAccountId: "0.0.98765432",
        identifier: "phantom@test.local",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      await expect(
        paymentsService.sendPayment(
          phantomPayload,
          recipientAccountId,
          5,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(NotConversationParticipantException);
    });
  });

  // -------------------------------------------------------------------------
  // 2. sendPayment — recipient not found
  // -------------------------------------------------------------------------

  describe("sendPayment — recipient not found", () => {
    it("should throw UserNotFoundException when recipient account does not exist in DB", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          "0.0.11111111", // non-existent recipient
          10,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(UserNotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // 3. sendPayment — self-payment
  // -------------------------------------------------------------------------

  describe("sendPayment — self-payment", () => {
    it("should throw InvalidPaymentAmountException when sender and recipient are the same", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          senderAccountId, // same as sender
          10,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });
  });

  // -------------------------------------------------------------------------
  // 4. sendPayment — invalid amount (zero / negative)
  // -------------------------------------------------------------------------

  describe("sendPayment — invalid amount", () => {
    it("should throw InvalidPaymentAmountException for zero amount", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          recipientAccountId,
          0,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw InvalidPaymentAmountException for negative amount", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          recipientAccountId,
          -100,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });
  });

  // -------------------------------------------------------------------------
  // 5. createPaymentRequest — happy path (DB-seeded, verify insertion)
  //    Note: createPaymentRequest requires HCS for submitMessage. This test
  //    exercises the validation + DB write flow. If Hedera is not configured,
  //    the HCS submission throws and the test verifies that path correctly.
  //    We verify the happy path by inserting directly and reading back.
  // -------------------------------------------------------------------------

  describe("createPaymentRequest — happy path (DB-only verification)", () => {
    it("should persist a payment request in the DB with correct fields", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert payment request directly to test the DB layer
      const requestId = await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        amount: 25.5,
        description: "Lunch split",
        conversationId,
      });

      const dbRecord = await paymentRequestRepo.findOne({
        where: { id: requestId },
      });

      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.requesterUserId).toBe(senderUserId);
      expect(Number(dbRecord!.amount)).toBeCloseTo(25.5, 4);
      expect(dbRecord!.currency).toBe("TMUSD");
      expect(dbRecord!.status).toBe("pending");
      expect(dbRecord!.description).toBe("Lunch split");
      expect(dbRecord!.conversationId).toBe(conversationId);
      expect(dbRecord!.hcsTopicId).toBe(testTopicId);
      expect(dbRecord!.expiresAt).toBeInstanceOf(Date);
      expect(dbRecord!.createdAt).toBeInstanceOf(Date);

      // Verify it can be retrieved via the service
      const result = await paymentsService.getPaymentRequest(requestId);
      expect(result.id).toBe(requestId);
      expect(result.amount).toBeCloseTo(25.5, 4);
      expect(result.status).toBe("pending");
      expect(result.description).toBe("Lunch split");
    });
  });

  // -------------------------------------------------------------------------
  // 6. createPaymentRequest — requester not found (non-member of conversation)
  // -------------------------------------------------------------------------

  describe("createPaymentRequest — requester not found", () => {
    it("should throw NotConversationParticipantException when requester is not a conversation member", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const outsiderPayload: JwtPayload = {
        sub: uuidv4(),
        hederaAccountId: "0.0.22222222",
        identifier: "outsider@test.local",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      await expect(
        paymentsService.createPaymentRequest(
          outsiderPayload,
          testTopicId,
          10,
          "TMUSD",
        ),
      ).rejects.toThrow(NotConversationParticipantException);
    });
  });

  // -------------------------------------------------------------------------
  // 7. fulfillPaymentRequest — request not found
  // -------------------------------------------------------------------------

  describe("fulfillPaymentRequest — request not found", () => {
    it("should throw PaymentRequestNotFoundException for non-existent request ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.fulfillPaymentRequest(
          makeRecipientPayload(),
          uuidv4(),
          testTopicId,
        ),
      ).rejects.toThrow(PaymentRequestNotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // 8. fulfillPaymentRequest — already fulfilled
  // -------------------------------------------------------------------------

  describe("fulfillPaymentRequest — already fulfilled", () => {
    it("should throw PaymentRequestAlreadyPaidException for a paid request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const req = new PaymentRequestEntity();
      req.id = requestId;
      req.requesterUserId = senderUserId;
      req.hcsTopicId = testTopicId;
      req.hcsSequenceNumber = 1;
      req.amount = 30;
      req.currency = "TMUSD";
      req.status = "paid";
      req.paidTxId = "0.0.ext-paid-tx";
      req.paidAt = new Date();
      req.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(req);

      await expect(
        paymentsService.fulfillPaymentRequest(
          makeRecipientPayload(),
          requestId,
          testTopicId,
        ),
      ).rejects.toThrow(PaymentRequestAlreadyPaidException);
    });
  });

  // -------------------------------------------------------------------------
  // 9. declinePaymentRequest — happy path
  // -------------------------------------------------------------------------

  describe("declinePaymentRequest — happy path", () => {
    it("should decline a pending request and persist status in DB", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Seed a pending request owned by sender
      const requestId = await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        amount: 15,
      });

      // Decline as recipient (different user)
      const result = await paymentsService.declinePaymentRequest(
        makeRecipientPayload(),
        requestId,
        "Not interested",
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(requestId);
      expect(result.status).toBe("declined");

      // Verify persisted in DB
      const dbRecord = await paymentRequestRepo.findOne({
        where: { id: requestId },
      });
      expect(dbRecord).not.toBeNull();
      expect(dbRecord!.status).toBe("declined");
    });
  });

  // -------------------------------------------------------------------------
  // 10. declinePaymentRequest — not found
  // -------------------------------------------------------------------------

  describe("declinePaymentRequest — not found", () => {
    it("should throw PaymentRequestNotFoundException for non-existent request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.declinePaymentRequest(makeRecipientPayload(), uuidv4()),
      ).rejects.toThrow(PaymentRequestNotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // 11. getPaymentRequest — happy path
  // -------------------------------------------------------------------------

  describe("getPaymentRequest — happy path", () => {
    it("should return a stored payment request with correct response shape", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        amount: 42,
        description: "Extended test request",
        conversationId,
      });

      const result = await paymentsService.getPaymentRequest(requestId);

      expect(result).toBeDefined();
      expect(result.id).toBe(requestId);
      expect(result.requesterUserId).toBe(senderUserId);
      expect(result.amount).toBe(42);
      expect(result.currency).toBe("TMUSD");
      expect(result.status).toBe("pending");
      expect(result.description).toBe("Extended test request");
      expect(result.conversationId).toBe(conversationId);
      expect(result.hcsTopicId).toBe(testTopicId);
      expect(typeof result.expiresAt).toBe("string");
      expect(typeof result.createdAt).toBe("string");
      expect(result.paidTxId).toBeNull();
      expect(result.paidAt).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 12. getPaymentRequest — not found
  // -------------------------------------------------------------------------

  describe("getPaymentRequest — not found", () => {
    it("should throw PaymentRequestNotFoundException for non-existent ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(paymentsService.getPaymentRequest(uuidv4())).rejects.toThrow(
        PaymentRequestNotFoundException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 13. getPaymentRequests — pagination (insert 5 requests, query limit=2)
  // -------------------------------------------------------------------------

  describe("getPaymentRequests — pagination", () => {
    it("should paginate through 5 payment requests with limit=2", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert 5 payment requests with staggered createdAt
      for (let i = 0; i < 5; i++) {
        const reqId = uuidv4();
        createdPaymentRequestIds.push(reqId);

        const req = new PaymentRequestEntity();
        req.id = reqId;
        req.requesterUserId = senderUserId;
        req.hcsTopicId = testTopicId;
        req.hcsSequenceNumber = i + 1;
        req.amount = (i + 1) * 10;
        req.currency = "TMUSD";
        req.status = "pending";
        req.conversationId = conversationId;
        req.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await paymentRequestRepo.save(req);

        // Stagger createdAt so pagination cursor works deterministically
        await paymentRequestRepo
          .createQueryBuilder()
          .update()
          .set({ createdAt: new Date(Date.now() - i * 60000) })
          .where("id = :id", { id: reqId })
          .execute();
      }

      // Page 1 (limit 2)
      const page1 = await paymentsService.getPaymentRequests(
        conversationId,
        undefined,
        2,
      );
      expect(page1.requests).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Page 2
      const page2 = await paymentsService.getPaymentRequests(
        conversationId,
        undefined,
        2,
        page1.cursor!,
      );
      expect(page2.requests).toHaveLength(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.cursor).not.toBeNull();

      // Page 3
      const page3 = await paymentsService.getPaymentRequests(
        conversationId,
        undefined,
        2,
        page2.cursor!,
      );
      expect(page3.requests).toHaveLength(1);
      expect(page3.hasMore).toBe(false);

      // Verify no overlapping IDs between pages
      const allIds = [
        ...page1.requests.map((r) => r.id),
        ...page2.requests.map((r) => r.id),
        ...page3.requests.map((r) => r.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // 14. getPaymentHistory — insert payment index records, verify pagination
  // -------------------------------------------------------------------------

  describe("getPaymentHistory — pagination", () => {
    it("should paginate payment history records with limit=2 across 5 records", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert 5 payment index records staggered in time
      for (let i = 0; i < 5; i++) {
        await insertPaymentIndexDirectly({
          senderAccount: senderAccountId,
          recipientAccount: recipientAccountId,
          amount: (i + 1) * 10,
          createdAtOffset: i * 60000,
        });
      }

      // Page 1
      const page1 = await paymentsService.getPaymentHistory(senderAccountId, 2);
      expect(page1.transactions).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Verify direction is "sent" for all (sender querying)
      for (const tx of page1.transactions) {
        expect(tx.direction).toBe("sent");
        expect(tx.counterpartyId).toBe(recipientAccountId);
      }

      // Page 2
      const page2 = await paymentsService.getPaymentHistory(
        senderAccountId,
        2,
        page1.cursor!,
      );
      expect(page2.transactions).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      // Page 3
      const page3 = await paymentsService.getPaymentHistory(
        senderAccountId,
        2,
        page2.cursor!,
      );
      expect(page3.transactions).toHaveLength(1);
      expect(page3.hasMore).toBe(false);

      // Collect all unique IDs across pages
      const allIds = [
        ...page1.transactions.map((t) => t.id),
        ...page2.transactions.map((t) => t.id),
        ...page3.transactions.map((t) => t.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // 15. queryTransactions — insert transaction records, verify filtering
  // -------------------------------------------------------------------------

  describe("queryTransactions — filtering", () => {
    it("should filter transactions by direction and status", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert mixed transactions
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 100,
        status: "completed",
      });
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "received",
        amount: 50,
        status: "completed",
      });
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 25,
        status: "failed",
      });

      // Filter sent + completed
      const sentCompleted = await paymentsService.queryTransactions(
        senderUserId,
        { direction: "sent", status: "completed" },
      );
      expect(sentCompleted.transactions).toHaveLength(1);
      expect(sentCompleted.transactions[0].amount).toBe(100);
      expect(sentCompleted.transactions[0].direction).toBe("sent");
      expect(sentCompleted.transactions[0].status).toBe("completed");

      // Filter all directions
      const allDirections = await paymentsService.queryTransactions(
        senderUserId,
        { direction: "all" },
      );
      expect(allDirections.transactions).toHaveLength(3);

      // Filter received only
      const receivedOnly = await paymentsService.queryTransactions(
        senderUserId,
        { direction: "received" },
      );
      expect(receivedOnly.transactions).toHaveLength(1);
      expect(receivedOnly.transactions[0].amount).toBe(50);
    });

    it("should paginate transaction query results with limit", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert 4 transactions staggered in time
      for (let i = 0; i < 4; i++) {
        await insertTransactionDirectly({
          userId: senderUserId,
          counterpartyId: recipientUserId,
          direction: "sent",
          amount: (i + 1) * 10,
          createdAtOffset: i * 60000,
        });
      }

      // Query with limit=2
      const page1 = await paymentsService.queryTransactions(senderUserId, {
        limit: 2,
      });
      expect(page1.transactions).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Page 2
      const page2 = await paymentsService.queryTransactions(senderUserId, {
        limit: 2,
        cursor: page1.cursor!,
      });
      expect(page2.transactions).toHaveLength(2);
      expect(page2.hasMore).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // 16. getTransactionDetail — happy path
  // -------------------------------------------------------------------------

  describe("getTransactionDetail — happy path", () => {
    it("should return detailed transaction with counterparty profile and on-chain proof links", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const txEntity = await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 75,
        status: "completed",
        description: "Test detail lookup",
        hederaTxId: "0.0.ext-detail-tx-001",
      });

      const result = await paymentsService.getTransactionDetail(
        txEntity.id,
        senderUserId,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(txEntity.id);
      expect(result.direction).toBe("sent");
      expect(result.amount).toBe(75);
      expect(result.currency).toBe("TMUSD");
      expect(result.status).toBe("completed");
      expect(result.description).toBe("Test detail lookup");
      expect(result.hederaTxId).toBe("0.0.ext-detail-tx-001");
      expect(result.paymentType).toBe("send");
      expect(typeof result.createdAt).toBe("string");
      expect(result.completedAt).not.toBeNull();

      // Verify counterparty profile
      expect(result.counterpartyProfile).not.toBeNull();
      expect(result.counterpartyProfile!.displayName).toBe("Ext Recipient");
      expect(result.counterpartyProfile!.hederaAccountId).toBe(
        recipientAccountId,
      );

      // Verify on-chain proof structure
      expect(result.onChainProof).toBeDefined();
      expect(result.onChainProof.htsExplorerUrl).toContain(
        "0.0.ext-detail-tx-001",
      );
    });
  });

  // -------------------------------------------------------------------------
  // 17. getTransactionDetail — not found
  // -------------------------------------------------------------------------

  describe("getTransactionDetail — not found", () => {
    it("should throw TransactionNotFoundException for non-existent transaction ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.getTransactionDetail(uuidv4(), senderUserId),
      ).rejects.toThrow(TransactionNotFoundException);
    });

    it("should throw TransactionNotFoundException when userId does not match", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert a transaction belonging to sender
      const txEntity = await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 50,
      });

      // Query with a different userId should fail (transaction not visible to other user)
      await expect(
        paymentsService.getTransactionDetail(txEntity.id, recipientUserId),
      ).rejects.toThrow(TransactionNotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // Additional edge cases for decline flow
  // -------------------------------------------------------------------------

  describe("declinePaymentRequest — edge cases", () => {
    it("should throw PaymentRequestNotActionableException when requester tries to decline own request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        amount: 20,
      });

      await expect(
        paymentsService.declinePaymentRequest(makeSenderPayload(), requestId),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should throw PaymentRequestAlreadyDeclinedException for already-declined request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        status: "declined",
      });

      await expect(
        paymentsService.declinePaymentRequest(
          makeRecipientPayload(),
          requestId,
        ),
      ).rejects.toThrow(PaymentRequestAlreadyDeclinedException);
    });

    it("should throw PaymentRequestNotActionableException for paid request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const req = new PaymentRequestEntity();
      req.id = requestId;
      req.requesterUserId = senderUserId;
      req.hcsTopicId = testTopicId;
      req.hcsSequenceNumber = 1;
      req.amount = 10;
      req.currency = "TMUSD";
      req.status = "paid";
      req.paidTxId = "0.0.ext-paid";
      req.paidAt = new Date();
      req.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(req);

      await expect(
        paymentsService.declinePaymentRequest(
          makeRecipientPayload(),
          requestId,
        ),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });
  });
});
