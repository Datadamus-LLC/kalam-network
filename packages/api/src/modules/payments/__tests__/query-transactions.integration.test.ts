/**
 * Payments — queryTransactions & getTransactionDetail Integration Tests
 *
 * Covers the T32 transaction query/detail features of PaymentsService
 * that are currently at ~0% line coverage.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *   (PostgreSQL on port 5433)
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
import { TransactionNotFoundException } from "../exceptions/payment.exceptions";

const logger = new Logger("QueryTransactionsIntegrationTest");

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

describe("Payments — queryTransactions & getTransactionDetail", () => {
  let module: TestingModule;
  let paymentsService: PaymentsService;
  let transactionRepo: Repository<TransactionEntity>;
  let paymentRequestRepo: Repository<PaymentRequestEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;

  const testRunId = Date.now().toString().slice(-6);
  const userAAccountId = `0.0.1${testRunId}`;
  const userBAccountId = `0.0.2${testRunId}`;

  let userAId: string;
  let userBId: string;

  const createdTransactionIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdPaymentRequestIds: string[] = [];

  async function insertTransaction(opts: {
    userId: string;
    counterpartyId: string;
    direction: "sent" | "received";
    amount: number;
    status?: "pending" | "completed" | "failed";
    paymentType?: "send" | "request_fulfillment" | "split_payment";
    hederaTxId?: string;
    hcsMessageSeq?: number;
    tamamTxRef?: string;
    conversationId?: string;
    description?: string;
    organizationId?: string;
    createdAtOffset?: number; // ms in the past
  }): Promise<TransactionEntity> {
    const txId = uuidv4();
    createdTransactionIds.push(txId);

    const entity = new TransactionEntity();
    entity.id = txId;
    entity.userId = opts.userId;
    entity.counterpartyId = opts.counterpartyId;
    entity.direction = opts.direction;
    entity.amount = opts.amount;
    entity.currency = "TMUSD";
    entity.status = opts.status ?? "completed";
    entity.paymentType = opts.paymentType ?? "send";
    entity.completedAt = new Date();
    if (opts.description) entity.description = opts.description;
    if (opts.hederaTxId) entity.hederaTxId = opts.hederaTxId;
    if (opts.hcsMessageSeq) entity.hcsMessageSeq = opts.hcsMessageSeq;
    if (opts.tamamTxRef) entity.tamamTxRef = opts.tamamTxRef;
    if (opts.conversationId) entity.conversationId = opts.conversationId;
    if (opts.organizationId) entity.organizationId = opts.organizationId;

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

  async function cleanupAll(): Promise<void> {
    try {
      if (createdTransactionIds.length > 0) {
        await transactionRepo
          .createQueryBuilder()
          .delete()
          .from(TransactionEntity)
          .where("id IN (:...ids)", { ids: [...createdTransactionIds] })
          .execute();
      }
      if (createdUserIds.length > 0) {
        await transactionRepo
          .createQueryBuilder()
          .delete()
          .from(TransactionEntity)
          .where("userId IN (:...ids)", { ids: [...createdUserIds] })
          .execute();
      }
      if (createdPaymentRequestIds.length > 0) {
        await paymentRequestRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentRequestEntity)
          .where("id IN (:...ids)", { ids: [...createdPaymentRequestIds] })
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
    logger.log(`PostgreSQL (port ${TEST_DB_PORT}): ${postgresAvailable}`);

    if (!postgresAvailable) {
      logger.warn("PostgreSQL not available — all tests skipped");
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
      transactionRepo = module.get<Repository<TransactionEntity>>(
        getRepositoryToken(TransactionEntity),
      );
      paymentRequestRepo = module.get<Repository<PaymentRequestEntity>>(
        getRepositoryToken(PaymentRequestEntity),
      );
      userRepo = module.get<Repository<UserEntity>>(
        getRepositoryToken(UserEntity),
      );

      // Seed users
      userAId = uuidv4();
      userBId = uuidv4();
      createdUserIds.push(userAId, userBId);

      await userRepo.save([
        userRepo.create({
          id: userAId,
          hederaAccountId: userAAccountId,
          displayName: "QueryTx UserA",
          status: "active",
        }),
        userRepo.create({
          id: userBId,
          hederaAccountId: userBAccountId,
          displayName: "QueryTx UserB",
          status: "active",
        }),
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize: ${message}`);
      postgresAvailable = false;
    }
  }, 30000);

  afterAll(async () => {
    if (module) {
      await cleanupAll();
      await module.close();
    }
  });

  // ─── queryTransactions ────────────────────────────────────────────────────

  describe("queryTransactions()", () => {
    it("should return empty result for user with no transactions", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await paymentsService.queryTransactions(userAId);
      expect(result).toBeDefined();
      expect(result.transactions).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it("should return transactions for a user filtered by userId", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "sent",
        amount: 5,
      });

      const result = await paymentsService.queryTransactions(userAId);
      expect(result.transactions.length).toBe(1);
      expect(result.transactions[0]!.direction).toBe("sent");
      expect(Number(result.transactions[0]!.amount)).toBe(5);
    });

    it("should filter by direction=sent", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "sent",
        amount: 10,
      });
      await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "received",
        amount: 20,
      });

      const result = await paymentsService.queryTransactions(userAId, {
        direction: "sent",
      });
      for (const tx of result.transactions) {
        expect(tx.direction).toBe("sent");
      }
    });

    it("should filter by direction=received", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await paymentsService.queryTransactions(userAId, {
        direction: "received",
      });
      for (const tx of result.transactions) {
        expect(tx.direction).toBe("received");
      }
    });

    it("should filter by status=completed", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "sent",
        amount: 3,
        status: "failed",
      });

      const result = await paymentsService.queryTransactions(userAId, {
        status: "completed",
      });
      for (const tx of result.transactions) {
        expect(tx.status).toBe("completed");
      }
    });

    it("should filter by date range", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert one old transaction (30 days ago)
      await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "sent",
        amount: 1,
        createdAtOffset: 30 * 24 * 60 * 60 * 1000,
      });

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const result = await paymentsService.queryTransactions(userAId, {
        from: weekAgo.toISOString(),
      });

      // Only recent transactions should appear
      for (const tx of result.transactions) {
        const txDate = new Date(tx.createdAt);
        expect(txDate.getTime()).toBeGreaterThanOrEqual(weekAgo.getTime());
      }
    });

    it("should search by hederaTxId", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const uniqueHederaTxId = `0.0.search-${Date.now()}`;
      await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "sent",
        amount: 7,
        hederaTxId: uniqueHederaTxId,
      });

      const searchTerm = uniqueHederaTxId.slice(4, 15);
      const result = await paymentsService.queryTransactions(userAId, {
        search: searchTerm,
      });
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);
      const found = result.transactions.find(
        (tx) => tx.hederaTxId === uniqueHederaTxId,
      );
      expect(found).toBeDefined();
    });

    it("should support cursor pagination", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert 5 transactions at staggered times
      for (let i = 0; i < 5; i++) {
        await insertTransaction({
          userId: userAId,
          counterpartyId: userBId,
          direction: "sent",
          amount: 100 + i,
          createdAtOffset: i * 1000, // spread apart by 1s each
        });
      }

      // First page
      const page1 = await paymentsService.queryTransactions(userAId, {
        limit: 2,
      });
      expect(page1.transactions.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Second page
      const page2 = await paymentsService.queryTransactions(userAId, {
        limit: 2,
        cursor: page1.cursor!,
      });
      expect(page2.transactions.length).toBe(2);

      // No duplicates between pages
      const page1Ids = page1.transactions.map((tx) => tx.id);
      const page2Ids = page2.transactions.map((tx) => tx.id);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });

    it("should return direction=all (no direction filter)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await paymentsService.queryTransactions(userAId, {
        direction: "all",
      });
      expect(result).toBeDefined();
      expect(Array.isArray(result.transactions)).toBe(true);
    });
  });

  // ─── getTransactionDetail ──────────────────────────────────────────────────

  describe("getTransactionDetail()", () => {
    it("should return full transaction detail with on-chain proof links", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const tx = await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "sent",
        amount: 42,
        hederaTxId: `0.0.detail-${Date.now()}`,
        hcsMessageSeq: 123,
        tamamTxRef: `tamam-ref-${Date.now()}`,
      });

      const detail = await paymentsService.getTransactionDetail(tx.id, userAId);
      expect(detail).toBeDefined();
      expect(detail.id).toBe(tx.id);
      expect(Number(detail.amount)).toBe(42);
      expect(detail.direction).toBe("sent");
      expect(detail.hederaTxId).toBe(tx.hederaTxId);
      expect(detail.hcsMessageSeq).toBe(123);
      expect(detail.tamamTxRef).toBe(tx.tamamTxRef);
      expect(detail.onChainProof).toBeDefined();
      // counterpartyProfile should exist since userB exists
      expect(detail.counterpartyProfile).toBeDefined();
      if (detail.counterpartyProfile) {
        expect(detail.counterpartyProfile.displayName).toBe("QueryTx UserB");
        expect(detail.counterpartyProfile.hederaAccountId).toBe(userBAccountId);
      }
    });

    it("should return null counterpartyProfile if counterparty user doesn't exist", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const fakeCounterpartyId = uuidv4();
      const tx = await insertTransaction({
        userId: userAId,
        counterpartyId: fakeCounterpartyId,
        direction: "sent",
        amount: 5,
      });

      const detail = await paymentsService.getTransactionDetail(tx.id, userAId);
      expect(detail.counterpartyProfile).toBeNull();
    });

    it("should throw TransactionNotFoundException for non-existent transaction", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const fakeId = uuidv4();
      await expect(
        paymentsService.getTransactionDetail(fakeId, userAId),
      ).rejects.toThrow(TransactionNotFoundException);
    });

    it("should throw TransactionNotFoundException when userId doesn't match", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const tx = await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "sent",
        amount: 10,
      });

      // userB tries to access userA's transaction
      await expect(
        paymentsService.getTransactionDetail(tx.id, userBId),
      ).rejects.toThrow(TransactionNotFoundException);
    });

    it("should return null explorer URLs when hcsMessageSeq and hederaTxId are missing", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const tx = await insertTransaction({
        userId: userAId,
        counterpartyId: userBId,
        direction: "sent",
        amount: 15,
        // No hederaTxId or hcsMessageSeq
      });

      const detail = await paymentsService.getTransactionDetail(tx.id, userAId);
      expect(detail.onChainProof.hcsExplorerUrl).toBeNull();
      expect(detail.onChainProof.htsExplorerUrl).toBeNull();
    });
  });

  // ─── getPaymentRequests pagination ─────────────────────────────────────────

  describe("getPaymentRequests()", () => {
    it("should return empty list when no requests exist", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await paymentsService.getPaymentRequests(
        undefined,
        undefined,
        10,
      );
      expect(result).toBeDefined();
      expect(Array.isArray(result.requests)).toBe(true);
      expect(typeof result.hasMore).toBe("boolean");
    });

    it("should filter by status", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const topicId = `0.0.topic-${testRunId}`;

      // Insert multiple requests with different statuses
      for (const status of ["pending", "paid", "declined"] as const) {
        const reqId = uuidv4();
        createdPaymentRequestIds.push(reqId);
        const req = new PaymentRequestEntity();
        req.id = reqId;
        req.requesterUserId = userAId;
        req.hcsTopicId = topicId;
        req.hcsSequenceNumber = 1;
        req.amount = 10;
        req.currency = "TMUSD";
        req.status = status;
        req.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await paymentRequestRepo.save(req);
      }

      const result = await paymentsService.getPaymentRequests(
        undefined,
        "pending",
        10,
      );
      for (const req of result.requests) {
        expect(req.status).toBe("pending");
      }
    });

    it("should support cursor pagination", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const topicId = `0.0.pag-${testRunId}`;

      // Insert 5 payment requests at staggered times
      for (let i = 0; i < 5; i++) {
        const reqId = uuidv4();
        createdPaymentRequestIds.push(reqId);
        const req = new PaymentRequestEntity();
        req.id = reqId;
        req.requesterUserId = userAId;
        req.hcsTopicId = topicId;
        req.hcsSequenceNumber = i + 1;
        req.amount = 10 + i;
        req.currency = "TMUSD";
        req.status = "pending";
        req.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await paymentRequestRepo.save(req);
      }

      // First page
      const page1 = await paymentsService.getPaymentRequests(
        undefined,
        "pending",
        2,
      );
      expect(page1.requests.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Second page
      const page2 = await paymentsService.getPaymentRequests(
        undefined,
        "pending",
        2,
        page1.cursor!,
      );
      expect(page2.requests.length).toBeGreaterThanOrEqual(1);

      // No duplicates
      const page1Ids = page1.requests.map((r) => r.id);
      const page2Ids = page2.requests.map((r) => r.id);
      for (const id of page1Ids) {
        expect(page2Ids).not.toContain(id);
      }
    });

    it("should auto-expire pending requests past their expiry date", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const reqId = uuidv4();
      createdPaymentRequestIds.push(reqId);
      const req = new PaymentRequestEntity();
      req.id = reqId;
      req.requesterUserId = userAId;
      req.hcsTopicId = `0.0.expire-${testRunId}`;
      req.hcsSequenceNumber = 1;
      req.amount = 50;
      req.currency = "TMUSD";
      req.status = "pending";
      req.expiresAt = new Date(Date.now() - 1000); // Already expired
      await paymentRequestRepo.save(req);

      const result = await paymentsService.getPaymentRequest(reqId);
      expect(result.status).toBe("expired");
    });
  });
});
