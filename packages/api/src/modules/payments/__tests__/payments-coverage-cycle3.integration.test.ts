/**
 * PaymentsService Coverage Cycle 3 — Integration Tests
 *
 * Targets uncovered paths in payments.service.ts to push line coverage
 * from ~53% toward 85%. Focuses on:
 *
 * - createSplitPayment: negative amounts, missing participant amounts,
 *   invalid currency, amount below minimum / above maximum
 * - getBalance: empty hederaAccountId => MissingWalletException
 * - queryTransactions: organizationId context, date range with `to`,
 *   combined filters, pending/failed status filters
 * - cancelPaymentRequest: attempt to cancel expired request
 * - getPaymentRequests: conversationId filter
 * - getPaymentHistory: received direction, empty result set
 * - getTransactionDetail: full fields including conversationId & organizationId
 * - toPaymentRequestResponse: response with paidAt populated
 * - validateAmount: exceeds MAX_AMOUNT
 * - validateCurrency: unsupported currency
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *   (PostgreSQL on TEST_DB_PORT=5433)
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
  InvalidCurrencyException,
  MissingWalletException,
  PaymentRequestNotActionableException,
  PaymentRequestNotFoundException,
  TransactionNotFoundException,
} from "../exceptions/payment.exceptions";
import { PAYMENT_CONSTANTS } from "../constants/payment.constants";
import type { JwtPayload } from "../../../common/guards/jwt-auth.guard";

const logger = new Logger("PaymentsCoverageCycle3");

const TEST_DB_PORT = parseInt(process.env.TEST_DB_PORT || "5433", 10);

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

describe("PaymentsService Coverage Cycle 3", () => {
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
  const senderAccountId = `0.0.3${testRunId}`;
  const recipientAccountId = `0.0.4${testRunId}`;
  const thirdAccountId = `0.0.5${testRunId}`;
  const testTopicId = `0.0.13${testRunId}`;

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
  const createdOrganizationIds: string[] = [];

  function makeSenderPayload(): JwtPayload {
    return {
      sub: senderUserId,
      hederaAccountId: senderAccountId,
      identifier: "c3-sender@test.local",
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
    paidTxId?: string;
    paidAt?: Date;
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
    if (opts.paidTxId) {
      req.paidTxId = opts.paidTxId;
    }
    if (opts.paidAt) {
      req.paidAt = opts.paidAt;
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
    entity.htsTransactionId = `0.0.c3-tx-${Date.now()}-${paymentId.slice(0, 8)}`;
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
    hcsMessageSeq?: number;
    tamamTxRef?: string;
    conversationId?: string;
    organizationId?: string;
    paymentRequestId?: string;
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
    if (opts.hcsMessageSeq) {
      entity.hcsMessageSeq = opts.hcsMessageSeq;
    }
    if (opts.tamamTxRef) {
      entity.tamamTxRef = opts.tamamTxRef;
    }
    if (opts.conversationId) {
      entity.conversationId = opts.conversationId;
    }
    if (opts.organizationId) {
      entity.organizationId = opts.organizationId;
    }
    if (opts.paymentRequestId) {
      entity.paymentRequestId = opts.paymentRequestId;
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
        displayName: "C3 Sender",
        status: "active",
      }),
      userRepo.create({
        id: recipientUserId,
        hederaAccountId: recipientAccountId,
        displayName: "C3 Recipient",
        status: "active",
      }),
      userRepo.create({
        id: thirdUserId,
        hederaAccountId: thirdAccountId,
        displayName: "C3 Third",
        status: "active",
      }),
    ];
    await userRepo.save(users);

    // Create conversation with sender + recipient + third as members
    conversationId = uuidv4();
    createdConversationIds.push(conversationId);

    const conversation = conversationRepo.create({
      id: conversationId,
      hcsTopicId: testTopicId,
      conversationType: "group",
      createdBy: senderAccountId,
      groupName: "C3 Test Group",
      lastMessageSeq: 0,
    });
    await conversationRepo.save(conversation);

    const members = [senderAccountId, recipientAccountId, thirdAccountId].map(
      (accountId) =>
        memberRepo.create({
          conversationId,
          hederaAccountId: accountId,
          role: "member",
          leftAt: null,
          lastReadSeq: 0,
        }),
    );
    await memberRepo.save(members);
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
      if (createdUserIds.length > 0) {
        await transactionRepo
          .createQueryBuilder()
          .delete()
          .from(TransactionEntity)
          .where("userId IN (:...ids)", {
            ids: [senderUserId, recipientUserId, thirdUserId],
          })
          .execute();
      }

      await paymentIndexRepo
        .createQueryBuilder()
        .delete()
        .from(PaymentIndexEntity)
        .where(
          "senderAccountId IN (:...ids) OR recipientAccountId IN (:...ids)",
          { ids: [senderAccountId, recipientAccountId, thirdAccountId] },
        )
        .execute();

      // Clean organizations created per-test
      if (createdOrganizationIds.length > 0) {
        const orgRepo = module.get<Repository<OrganizationEntity>>(
          getRepositoryToken(OrganizationEntity),
        );
        await orgRepo
          .createQueryBuilder()
          .delete()
          .from(OrganizationEntity)
          .where("id IN (:...ids)", { ids: [...createdOrganizationIds] })
          .execute();
        createdOrganizationIds.length = 0;
      }
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
  // 1. createSplitPayment — custom split with negative amount
  // -------------------------------------------------------------------------

  describe("createSplitPayment — custom split with negative amount", () => {
    it("should throw InvalidPaymentAmountException for custom split with negative participant amount", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createSplitPayment(makeSenderPayload(), {
          totalAmount: 30.0,
          currency: "TMUSD",
          splitMethod: "custom",
          participantAccountIds: [recipientAccountId],
          topicId: testTopicId,
          customAmounts: {
            [recipientAccountId]: -5,
          },
        }),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });
  });

  // -------------------------------------------------------------------------
  // 2. createSplitPayment — custom split with missing participant in customAmounts
  // -------------------------------------------------------------------------

  describe("createSplitPayment — custom split with missing participant amount", () => {
    it("should throw InvalidPaymentAmountException when customAmounts omits a participant", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createSplitPayment(makeSenderPayload(), {
          totalAmount: 50.0,
          currency: "TMUSD",
          splitMethod: "custom",
          participantAccountIds: [recipientAccountId, thirdAccountId],
          topicId: testTopicId,
          customAmounts: {
            // Only one participant provided, thirdAccountId is missing
            [recipientAccountId]: 30.0,
          },
        }),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });
  });

  // -------------------------------------------------------------------------
  // 3. createSplitPayment — invalid currency
  // -------------------------------------------------------------------------

  describe("createSplitPayment — invalid currency", () => {
    it("should throw InvalidCurrencyException for unsupported currency in split payment", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createSplitPayment(makeSenderPayload(), {
          totalAmount: 30.0,
          currency: "DOGE",
          splitMethod: "equal",
          participantAccountIds: [recipientAccountId],
          topicId: testTopicId,
        }),
      ).rejects.toThrow(InvalidCurrencyException);
    });
  });

  // -------------------------------------------------------------------------
  // 4. createSplitPayment — amount below minimum
  // -------------------------------------------------------------------------

  describe("createSplitPayment — amount below minimum", () => {
    it("should throw InvalidPaymentAmountException when totalAmount is below MIN_AMOUNT", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createSplitPayment(makeSenderPayload(), {
          totalAmount: 0.001, // Below PAYMENT_CONSTANTS.MIN_AMOUNT (0.01)
          currency: "TMUSD",
          splitMethod: "equal",
          participantAccountIds: [recipientAccountId],
          topicId: testTopicId,
        }),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });
  });

  // -------------------------------------------------------------------------
  // 5. validateAmount — exceeds MAX_AMOUNT
  // -------------------------------------------------------------------------

  describe("sendPayment — amount exceeds MAX_AMOUNT", () => {
    it("should throw InvalidPaymentAmountException when amount exceeds the configured maximum", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const overMaxAmount = PAYMENT_CONSTANTS.MAX_AMOUNT + 1;

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          recipientAccountId,
          overMaxAmount,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });
  });

  // -------------------------------------------------------------------------
  // 6. validateCurrency — unsupported currency in sendPayment
  // -------------------------------------------------------------------------

  describe("sendPayment — unsupported currency", () => {
    it("should throw InvalidCurrencyException for a currency not in the supported list", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          recipientAccountId,
          10,
          "BTC",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidCurrencyException);
    });
  });

  // -------------------------------------------------------------------------
  // 7. getBalance — empty hederaAccountId
  // -------------------------------------------------------------------------

  describe("getBalance — empty hederaAccountId", () => {
    it("should throw MissingWalletException when hederaAccountId is empty string", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(paymentsService.getBalance("")).rejects.toThrow(
        MissingWalletException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 8. queryTransactions — organizationId context filter
  // -------------------------------------------------------------------------

  describe("queryTransactions — organizationId context", () => {
    it("should filter transactions by organizationId instead of userId when orgId is provided", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const orgId = uuidv4();

      // Insert a transaction with organizationId
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 200,
        organizationId: orgId,
      });

      // Insert a personal transaction (no orgId)
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 50,
      });

      // Query with organizationId should only find the org transaction
      const orgResult = await paymentsService.queryTransactions(senderUserId, {
        organizationId: orgId,
      });
      expect(orgResult.transactions.length).toBe(1);
      expect(orgResult.transactions[0].amount).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // 9. queryTransactions — date range with `to` filter
  // -------------------------------------------------------------------------

  describe("queryTransactions — date range with `to` filter", () => {
    it("should exclude transactions created after the `to` date", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert an old transaction (7 days ago)
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 15,
        createdAtOffset: 7 * 24 * 60 * 60 * 1000,
      });

      // Insert a recent transaction (now)
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 25,
      });

      // Set `to` to 3 days ago — should exclude the recent transaction
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const result = await paymentsService.queryTransactions(senderUserId, {
        to: threeDaysAgo.toISOString(),
      });

      // Only the old transaction should appear
      for (const tx of result.transactions) {
        const txDate = new Date(tx.createdAt);
        expect(txDate.getTime()).toBeLessThanOrEqual(threeDaysAgo.getTime());
      }
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // 10. queryTransactions — combined direction + status + date range
  // -------------------------------------------------------------------------

  describe("queryTransactions — combined filters", () => {
    it("should apply direction, status, and date range filters simultaneously", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const now = Date.now();

      // Transaction 1: sent + completed + 2 days ago
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 10,
        status: "completed",
        createdAtOffset: 2 * 24 * 60 * 60 * 1000,
      });

      // Transaction 2: sent + failed + 1 day ago
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 20,
        status: "failed",
        createdAtOffset: 1 * 24 * 60 * 60 * 1000,
      });

      // Transaction 3: received + completed + now
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "received",
        amount: 30,
        status: "completed",
      });

      // Filter: sent + completed + from 3 days ago
      const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
      const result = await paymentsService.queryTransactions(senderUserId, {
        direction: "sent",
        status: "completed",
        from: threeDaysAgo.toISOString(),
      });

      // Should only match Transaction 1
      expect(result.transactions.length).toBe(1);
      expect(result.transactions[0].direction).toBe("sent");
      expect(result.transactions[0].status).toBe("completed");
      expect(result.transactions[0].amount).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // 11. queryTransactions — status=failed filter
  // -------------------------------------------------------------------------

  describe("queryTransactions — status=failed filter", () => {
    it("should return only failed transactions when status=failed", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

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
        direction: "sent",
        amount: 75,
        status: "failed",
      });

      const result = await paymentsService.queryTransactions(senderUserId, {
        status: "failed",
      });

      for (const tx of result.transactions) {
        expect(tx.status).toBe("failed");
      }
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // 12. queryTransactions — status=pending filter
  // -------------------------------------------------------------------------

  describe("queryTransactions — status=pending filter", () => {
    it("should return only pending transactions when status=pending", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 55,
        status: "pending",
      });

      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 60,
        status: "completed",
      });

      const result = await paymentsService.queryTransactions(senderUserId, {
        status: "pending",
      });

      for (const tx of result.transactions) {
        expect(tx.status).toBe("pending");
      }
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // 13. cancelPaymentRequest — attempt to cancel an expired request
  // -------------------------------------------------------------------------

  describe("cancelPaymentRequest — expired request", () => {
    it("should throw PaymentRequestNotActionableException when trying to cancel an expired request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        status: "expired",
        amount: 20,
      });

      await expect(
        paymentsService.cancelPaymentRequest(makeSenderPayload(), requestId),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });
  });

  // -------------------------------------------------------------------------
  // 14. getPaymentRequests — filter by conversationId
  // -------------------------------------------------------------------------

  describe("getPaymentRequests — conversationId filter", () => {
    it("should return only requests belonging to the specified conversationId", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const otherConversationId = uuidv4();

      // Insert 2 requests for our conversationId
      await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        amount: 10,
        conversationId,
      });
      await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        amount: 20,
        conversationId,
      });

      // Insert 1 request for a different conversationId
      await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        amount: 30,
        conversationId: otherConversationId,
      });

      const result = await paymentsService.getPaymentRequests(
        conversationId,
        undefined,
        10,
      );

      // All returned requests should belong to our conversationId
      for (const req of result.requests) {
        expect(req.conversationId).toBe(conversationId);
      }
      expect(result.requests.length).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // 15. getPaymentHistory — received direction records
  // -------------------------------------------------------------------------

  describe("getPaymentHistory — received direction", () => {
    it("should mark direction as 'received' when querying as the recipient", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert a payment from sender to recipient
      await insertPaymentIndexDirectly({
        senderAccount: senderAccountId,
        recipientAccount: recipientAccountId,
        amount: 42,
      });

      // Query as recipient
      const result = await paymentsService.getPaymentHistory(
        recipientAccountId,
        10,
      );

      expect(result.transactions.length).toBeGreaterThanOrEqual(1);

      const receivedTx = result.transactions.find(
        (tx) => tx.counterpartyId === senderAccountId,
      );
      expect(receivedTx).toBeDefined();
      expect(receivedTx!.direction).toBe("received");
    });
  });

  // -------------------------------------------------------------------------
  // 16. getPaymentHistory — empty result set
  // -------------------------------------------------------------------------

  describe("getPaymentHistory — empty result set", () => {
    it("should return empty transactions array with hasMore=false for an account with no payments", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const nonexistentAccountId = `0.0.999${testRunId}`;
      const result = await paymentsService.getPaymentHistory(
        nonexistentAccountId,
        10,
      );

      expect(result.transactions).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // 17. getTransactionDetail — full fields with conversationId & organizationId
  // -------------------------------------------------------------------------

  describe("getTransactionDetail — full fields with conversationId and organizationId", () => {
    it("should return conversationId, organizationId, paymentRequestId, and tamamTxRef in detail response", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const orgId = uuidv4();
      const paymentReqId = uuidv4();

      const txEntity = await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 150,
        status: "completed",
        description: "Full detail test",
        hederaTxId: `0.0.c3-full-detail-${Date.now()}`,
        hcsMessageSeq: 456,
        tamamTxRef: `tamam-c3-${Date.now()}`,
        conversationId,
        organizationId: orgId,
        paymentRequestId: paymentReqId,
      });

      const detail = await paymentsService.getTransactionDetail(
        txEntity.id,
        senderUserId,
      );

      expect(detail).toBeDefined();
      expect(detail.id).toBe(txEntity.id);
      expect(detail.conversationId).toBe(conversationId);
      expect(detail.organizationId).toBe(orgId);
      expect(detail.paymentRequestId).toBe(paymentReqId);
      expect(detail.hcsMessageSeq).toBe(456);
      expect(detail.tamamTxRef).toBe(txEntity.tamamTxRef);
      expect(detail.description).toBe("Full detail test");
      expect(detail.amount).toBe(150);
      expect(detail.direction).toBe("sent");

      // On-chain proof URLs should be populated
      expect(detail.onChainProof).toBeDefined();
      expect(detail.onChainProof.htsExplorerUrl).not.toBeNull();
      expect(detail.onChainProof.hcsExplorerUrl).not.toBeNull();

      // Counterparty profile should be populated for known user
      expect(detail.counterpartyProfile).not.toBeNull();
      expect(detail.counterpartyProfile!.displayName).toBe("C3 Recipient");
      expect(detail.counterpartyProfile!.hederaAccountId).toBe(
        recipientAccountId,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 18. toPaymentRequestResponse — response shape with paidAt populated
  // -------------------------------------------------------------------------

  describe("getPaymentRequest — response shape with paidAt populated", () => {
    it("should return paidTxId and paidAt as ISO strings when the request is paid", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const paidAt = new Date();
      const paidTxId = `0.0.c3-paid-tx-${Date.now()}`;

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId: senderUserId,
        status: "paid",
        amount: 99,
        paidTxId,
        paidAt,
      });

      const result = await paymentsService.getPaymentRequest(requestId);

      expect(result).toBeDefined();
      expect(result.id).toBe(requestId);
      expect(result.status).toBe("paid");
      expect(result.paidTxId).toBe(paidTxId);
      expect(result.paidAt).not.toBeNull();
      expect(typeof result.paidAt).toBe("string");
      // Verify paidAt is close to the time we set
      const paidAtDate = new Date(result.paidAt!);
      expect(Math.abs(paidAtDate.getTime() - paidAt.getTime())).toBeLessThan(
        2000,
      );
    });
  });

  // -------------------------------------------------------------------------
  // 19. cancelPaymentRequest — not found
  // -------------------------------------------------------------------------

  describe("cancelPaymentRequest — not found", () => {
    it("should throw PaymentRequestNotFoundException for non-existent request ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.cancelPaymentRequest(makeSenderPayload(), uuidv4()),
      ).rejects.toThrow(PaymentRequestNotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // 20. getTransactionDetail — not found for wrong userId
  // -------------------------------------------------------------------------

  describe("getTransactionDetail — access control by userId", () => {
    it("should throw TransactionNotFoundException when querying with a different userId", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const txEntity = await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 30,
        status: "completed",
      });

      // Recipient should not be able to access sender's transaction record
      await expect(
        paymentsService.getTransactionDetail(txEntity.id, recipientUserId),
      ).rejects.toThrow(TransactionNotFoundException);
    });
  });
});
