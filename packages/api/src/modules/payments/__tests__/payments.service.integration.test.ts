/**
 * PaymentsService Integration Tests
 *
 * Tests the PaymentsService against REAL PostgreSQL and optionally Hedera Testnet.
 * Payment request creation and querying work against PostgreSQL.
 * sendPayment() and fulfillPaymentRequest() require Hedera for HBAR transfers.
 *
 * Prerequisites:
 *   - PostgreSQL running (default: localhost:5432)
 *   - Optional: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY for transfer tests
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
  PaymentRequestNotFoundException,
  PaymentRequestExpiredException,
  PaymentRequestAlreadyPaidException,
  PaymentRequestAlreadyDeclinedException,
  PaymentRequestNotActionableException,
  CannotPayOwnRequestException,
  MissingWalletException,
  UserNotFoundException,
  TransactionNotFoundException,
  NotConversationParticipantException,
} from "../exceptions/payment.exceptions";
import { PAYMENT_CONSTANTS } from "../constants/payment.constants";
import type { JwtPayload } from "../../../common/guards/jwt-auth.guard";

const logger = new Logger("PaymentsIntegrationTest");

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

describe("PaymentsService Integration Tests", () => {
  let module: TestingModule;
  let paymentsService: PaymentsService;
  let paymentRequestRepo: Repository<PaymentRequestEntity>;
  let paymentIndexRepo: Repository<PaymentIndexEntity>;
  let transactionRepo: Repository<TransactionEntity>;
  let conversationRepo: Repository<ConversationEntity>;
  let memberRepo: Repository<ConversationMemberEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;
  let hederaConfigured = false;

  // Test identifiers unique per run
  const testRunId = Date.now().toString().slice(-6);
  const senderAccountId = `0.0.8${testRunId}`;
  const recipientAccountId = `0.0.9${testRunId}`;
  const testTopicId = `0.0.10${testRunId}`;

  // User IDs (UUID) for JwtPayload
  let senderUserId: string;
  let recipientUserId: string;

  // Track created entities for cleanup
  const createdPaymentRequestIds: string[] = [];
  const createdPaymentIndexIds: string[] = [];
  const createdTransactionIds: string[] = [];
  const createdConversationIds: string[] = [];
  const createdUserIds: string[] = [];

  function makeSenderPayload(): JwtPayload {
    return {
      sub: senderUserId,
      hederaAccountId: senderAccountId,
      identifier: "sender@test.local",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  function makeRecipientPayload(): JwtPayload {
    return {
      sub: recipientUserId,
      hederaAccountId: recipientAccountId,
      identifier: "recipient@test.local",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }

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

      // Seed test users and conversation
      await seedTestData();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to initialize test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterAll(async () => {
    if (module) {
      await cleanupAllTestData();
      await module.close();
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    try {
      // Clean up payment requests
      if (createdPaymentRequestIds.length > 0) {
        await paymentRequestRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentRequestEntity)
          .where("id IN (:...ids)", { ids: [...createdPaymentRequestIds] })
          .execute();
        createdPaymentRequestIds.length = 0;
      }

      // Clean up payment index
      if (createdPaymentIndexIds.length > 0) {
        await paymentIndexRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentIndexEntity)
          .where("id IN (:...ids)", { ids: [...createdPaymentIndexIds] })
          .execute();
        createdPaymentIndexIds.length = 0;
      }

      // Clean up transactions
      if (createdTransactionIds.length > 0) {
        await transactionRepo
          .createQueryBuilder()
          .delete()
          .from(TransactionEntity)
          .where("id IN (:...ids)", { ids: [...createdTransactionIds] })
          .execute();
        createdTransactionIds.length = 0;
      }

      // Also clean by user IDs
      await transactionRepo
        .createQueryBuilder()
        .delete()
        .from(TransactionEntity)
        .where("userId IN (:...ids)", { ids: [senderUserId, recipientUserId] })
        .execute();

      // Clean payment indices by account
      await paymentIndexRepo
        .createQueryBuilder()
        .delete()
        .from(PaymentIndexEntity)
        .where(
          "senderAccountId IN (:...ids) OR recipientAccountId IN (:...ids)",
          { ids: [senderAccountId, recipientAccountId] },
        )
        .execute();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`afterEach cleanup failed: ${message}`);
    }
  });

  async function seedTestData(): Promise<void> {
    // Create users
    senderUserId = uuidv4();
    recipientUserId = uuidv4();
    createdUserIds.push(senderUserId, recipientUserId);

    const senderUser = userRepo.create({
      id: senderUserId,
      hederaAccountId: senderAccountId,
      displayName: "Payment Sender",
      status: "active",
    });
    const recipientUser = userRepo.create({
      id: recipientUserId,
      hederaAccountId: recipientAccountId,
      displayName: "Payment Recipient",
      status: "active",
    });
    await userRepo.save([senderUser, recipientUser]);

    // Create conversation
    const conversationId = uuidv4();
    createdConversationIds.push(conversationId);

    const conversation = conversationRepo.create({
      id: conversationId,
      hcsTopicId: testTopicId,
      conversationType: "direct",
      createdBy: senderAccountId,
      lastMessageSeq: 0,
    });
    await conversationRepo.save(conversation);

    // Add members
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
      // Clean up payment requests by requester
      await paymentRequestRepo
        .createQueryBuilder()
        .delete()
        .from(PaymentRequestEntity)
        .where("requesterUserId IN (:...ids)", {
          ids: [senderUserId, recipientUserId],
        })
        .execute();

      // Clean up transactions by user
      await transactionRepo
        .createQueryBuilder()
        .delete()
        .from(TransactionEntity)
        .where("userId IN (:...ids)", { ids: [senderUserId, recipientUserId] })
        .execute();

      // Clean up payment indices
      await paymentIndexRepo
        .createQueryBuilder()
        .delete()
        .from(PaymentIndexEntity)
        .where(
          "senderAccountId IN (:...ids) OR recipientAccountId IN (:...ids)",
          { ids: [senderAccountId, recipientAccountId] },
        )
        .execute();

      // Clean up members
      await memberRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationMemberEntity)
        .where("hederaAccountId IN (:...ids)", {
          ids: [senderAccountId, recipientAccountId],
        })
        .execute();

      // Clean up conversations
      if (createdConversationIds.length > 0) {
        await conversationRepo
          .createQueryBuilder()
          .delete()
          .from(ConversationEntity)
          .where("id IN (:...ids)", { ids: createdConversationIds })
          .execute();
      }

      // Clean up users
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
   * Helper: insert a payment index record directly into DB.
   */
  async function insertPaymentIndexDirectly(options: {
    senderAccount: string;
    recipientAccount: string;
    amount: number;
    currency?: string;
    status?: "confirmed" | "failed";
    paymentType?: "send" | "request_fulfillment" | "split_payment";
    createdAtOffset?: number; // milliseconds in the past
  }): Promise<PaymentIndexEntity> {
    const paymentId = uuidv4();
    createdPaymentIndexIds.push(paymentId);

    const entity = new PaymentIndexEntity();
    entity.id = paymentId;
    entity.senderAccountId = options.senderAccount;
    entity.recipientAccountId = options.recipientAccount;
    entity.amount = options.amount;
    entity.currency = options.currency ?? "TMUSD";
    entity.htsTransactionId = `0.0.test-tx-${Date.now()}`;
    entity.hcsTopicId = testTopicId;
    entity.hcsSequenceNumber = 0;
    entity.paymentType = options.paymentType ?? "send";
    entity.tamamReference = "";
    entity.status = options.status ?? "confirmed";

    const saved = await paymentIndexRepo.save(entity);

    // Adjust createdAt if offset specified
    if (options.createdAtOffset) {
      await paymentIndexRepo
        .createQueryBuilder()
        .update()
        .set({
          createdAt: new Date(Date.now() - options.createdAtOffset),
        })
        .where("id = :id", { id: paymentId })
        .execute();
    }

    return saved;
  }

  /**
   * Helper: insert a transaction record directly.
   */
  async function insertTransactionDirectly(options: {
    userId: string;
    counterpartyId: string;
    direction: "sent" | "received";
    amount: number;
    currency?: string;
    status?: "pending" | "completed" | "failed";
    paymentType?: "send" | "request_fulfillment" | "split_payment";
    createdAtOffset?: number;
  }): Promise<TransactionEntity> {
    const txId = uuidv4();
    createdTransactionIds.push(txId);

    const entity = new TransactionEntity();
    entity.id = txId;
    entity.userId = options.userId;
    entity.counterpartyId = options.counterpartyId;
    entity.direction = options.direction;
    entity.amount = options.amount;
    entity.currency = options.currency ?? "TMUSD";
    entity.status = options.status ?? "completed";
    entity.paymentType = options.paymentType ?? "send";
    entity.completedAt = new Date();

    const saved = await transactionRepo.save(entity);

    if (options.createdAtOffset) {
      await transactionRepo
        .createQueryBuilder()
        .update()
        .set({
          createdAt: new Date(Date.now() - options.createdAtOffset),
        })
        .where("id = :id", { id: txId })
        .execute();
    }

    return saved;
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
    expect(paymentsService).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // createPaymentRequest()
  // ---------------------------------------------------------------------------

  describe("createPaymentRequest()", () => {
    it("should throw InvalidPaymentAmountException for zero amount", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createPaymentRequest(
          makeSenderPayload(),
          testTopicId,
          0,
          "TMUSD",
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw InvalidPaymentAmountException for negative amount", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createPaymentRequest(
          makeSenderPayload(),
          testTopicId,
          -5,
          "TMUSD",
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw InvalidPaymentAmountException for amount above max", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createPaymentRequest(
          makeSenderPayload(),
          testTopicId,
          PAYMENT_CONSTANTS.MAX_AMOUNT + 1,
          "TMUSD",
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw InvalidCurrencyException for unsupported currency", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createPaymentRequest(
          makeSenderPayload(),
          testTopicId,
          10,
          "BTC",
        ),
      ).rejects.toThrow(InvalidCurrencyException);
    });

    it("should throw for non-participant in conversation", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const outsiderPayload: JwtPayload = {
        sub: uuidv4(),
        hederaAccountId: "0.0.99999999",
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

    it("should create a pending payment request in DB (requires Hedera)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn(
          "SKIPPED: Hedera not configured — createPaymentRequest requires HCS",
        );
        pending();
        return;
      }

      // For this test, we need a real HCS topic
      const { HederaService } = await import("../../hedera/hedera.service");
      const hederaService = module.get<HederaService>(HederaService);
      const realTopicId = await hederaService.createTopic({
        memo: "Integration test payments topic",
      });

      // Create a conversation with the real topic
      const realConvoId = uuidv4();
      const realConvo = conversationRepo.create({
        id: realConvoId,
        hcsTopicId: realTopicId,
        conversationType: "direct",
        createdBy: senderAccountId,
        lastMessageSeq: 0,
      });
      await conversationRepo.save(realConvo);

      const senderMember = memberRepo.create({
        conversationId: realConvoId,
        hederaAccountId: senderAccountId,
        role: "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await memberRepo.save(senderMember);

      const result = await paymentsService.createPaymentRequest(
        makeSenderPayload(),
        realTopicId,
        10.5,
        "TMUSD",
        "Integration test payment request",
      );

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.status).toBe("pending");
      expect(result.amount).toBe(10.5);
      expect(result.currency).toBe("TMUSD");
      expect(result.description).toBe("Integration test payment request");
      expect(result.hcsTopicId).toBe(realTopicId);
      expect(result.requesterUserId).toBe(senderUserId);
      expect(result.expiresAt).toBeDefined();

      // Verify in DB
      const dbRequest = await paymentRequestRepo.findOne({
        where: { id: result.id },
      });
      expect(dbRequest).toBeDefined();
      expect(dbRequest!.status).toBe("pending");
      expect(Number(dbRequest!.amount)).toBeCloseTo(10.5, 4);

      // Clean up
      createdPaymentRequestIds.push(result.id);
      await memberRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationMemberEntity)
        .where("conversationId = :id", { id: realConvoId })
        .execute();
      await conversationRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationEntity)
        .where("id = :id", { id: realConvoId })
        .execute();
    }, 30000);

    it("should use custom expiry time when provided (requires Hedera)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn("SKIPPED: Hedera not configured");
        pending();
        return;
      }

      const { HederaService } = await import("../../hedera/hedera.service");
      const hederaService = module.get<HederaService>(HederaService);
      const realTopicId = await hederaService.createTopic({
        memo: "Integration test payments topic 2",
      });

      const realConvoId = uuidv4();
      const realConvo = conversationRepo.create({
        id: realConvoId,
        hcsTopicId: realTopicId,
        conversationType: "direct",
        createdBy: senderAccountId,
        lastMessageSeq: 0,
      });
      await conversationRepo.save(realConvo);

      const senderMember = memberRepo.create({
        conversationId: realConvoId,
        hederaAccountId: senderAccountId,
        role: "member",
        leftAt: null,
        lastReadSeq: 0,
      });
      await memberRepo.save(senderMember);

      const customExpiry = new Date(
        Date.now() + 24 * 60 * 60 * 1000,
      ).toISOString();

      const result = await paymentsService.createPaymentRequest(
        makeSenderPayload(),
        realTopicId,
        5,
        "TMUSD",
        "Custom expiry test",
        customExpiry,
      );

      expect(result).toBeDefined();
      expect(result.expiresAt).toBeDefined();
      // The expiry should be close to what we set (within a minute)
      const expiryDate = new Date(result.expiresAt);
      const expectedDate = new Date(customExpiry);
      expect(
        Math.abs(expiryDate.getTime() - expectedDate.getTime()),
      ).toBeLessThan(60000);

      createdPaymentRequestIds.push(result.id);
      await memberRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationMemberEntity)
        .where("conversationId = :id", { id: realConvoId })
        .execute();
      await conversationRepo
        .createQueryBuilder()
        .delete()
        .from(ConversationEntity)
        .where("id = :id", { id: realConvoId })
        .execute();
    }, 30000);
  });

  // ---------------------------------------------------------------------------
  // declinePaymentRequest()
  // ---------------------------------------------------------------------------

  describe("declinePaymentRequest()", () => {
    it("should throw PaymentRequestNotFoundException for invalid ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.declinePaymentRequest(makeRecipientPayload(), uuidv4()),
      ).rejects.toThrow(PaymentRequestNotFoundException);
    });

    it("should decline a pending payment request and update status in DB", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Create a payment request directly in DB (bypassing HCS)
      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 25;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "pending";
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      // Decline as the recipient (different user)
      const result = await paymentsService.declinePaymentRequest(
        makeRecipientPayload(),
        requestId,
        "Not interested",
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(requestId);
      expect(result.status).toBe("declined");

      // Verify in DB
      const dbRequest = await paymentRequestRepo.findOne({
        where: { id: requestId },
      });
      expect(dbRequest).toBeDefined();
      expect(dbRequest!.status).toBe("declined");
    });

    it("should not allow requester to decline their own request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 10;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "pending";
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      // Try to decline as the requester (same user)
      await expect(
        paymentsService.declinePaymentRequest(makeSenderPayload(), requestId),
      ).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentHistory()
  // ---------------------------------------------------------------------------

  describe("getPaymentHistory()", () => {
    it("should return empty history for user with no payments", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await paymentsService.getPaymentHistory("0.0.nonexistent");
      expect(result).toBeDefined();
      expect(result.transactions).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeNull();
    });

    it("should return payment history with correct data", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert payment records
      await insertPaymentIndexDirectly({
        senderAccount: senderAccountId,
        recipientAccount: recipientAccountId,
        amount: 50,
      });
      await insertPaymentIndexDirectly({
        senderAccount: recipientAccountId,
        recipientAccount: senderAccountId,
        amount: 25,
      });

      const result = await paymentsService.getPaymentHistory(senderAccountId);
      expect(result.transactions).toHaveLength(2);

      // Verify direction is computed correctly
      const sentTx = result.transactions.find((t) => t.direction === "sent");
      const receivedTx = result.transactions.find(
        (t) => t.direction === "received",
      );

      expect(sentTx).toBeDefined();
      expect(sentTx!.amount).toBe(50);
      expect(sentTx!.counterpartyId).toBe(recipientAccountId);

      expect(receivedTx).toBeDefined();
      expect(receivedTx!.amount).toBe(25);
      expect(receivedTx!.counterpartyId).toBe(recipientAccountId);
    });

    it("should paginate payment history correctly", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert multiple payments with different timestamps
      for (let i = 0; i < 5; i++) {
        await insertPaymentIndexDirectly({
          senderAccount: senderAccountId,
          recipientAccount: recipientAccountId,
          amount: (i + 1) * 10,
          createdAtOffset: i * 60000, // stagger by 1 minute each
        });
      }

      // Page 1
      const page1 = await paymentsService.getPaymentHistory(senderAccountId, 2);
      expect(page1.transactions).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

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
    });

    it("should return correct transaction response shape", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertPaymentIndexDirectly({
        senderAccount: senderAccountId,
        recipientAccount: recipientAccountId,
        amount: 100,
        currency: "TMUSD",
        paymentType: "send",
        status: "confirmed",
      });

      const result = await paymentsService.getPaymentHistory(senderAccountId);
      expect(result.transactions).toHaveLength(1);

      const tx = result.transactions[0];
      expect(tx.id).toBeDefined();
      expect(tx.direction).toBe("sent");
      expect(tx.amount).toBe(100);
      expect(tx.currency).toBe("TMUSD");
      expect(tx.status).toBe("completed"); // "confirmed" maps to "completed"
      expect(tx.counterpartyId).toBe(recipientAccountId);
      expect(tx.hederaTxId).toBeDefined();
      expect(tx.paymentType).toBe("send");
      expect(typeof tx.createdAt).toBe("string");
    });
  });

  // ---------------------------------------------------------------------------
  // queryTransactions() — T32 rich filtering
  // ---------------------------------------------------------------------------

  describe("queryTransactions()", () => {
    it("should return empty for user with no transactions", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await paymentsService.queryTransactions(uuidv4());
      expect(result.transactions).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("should filter by direction", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert sent and received transactions
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 100,
      });
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "received",
        amount: 50,
      });

      const sentOnly = await paymentsService.queryTransactions(senderUserId, {
        direction: "sent",
      });
      expect(sentOnly.transactions).toHaveLength(1);
      expect(sentOnly.transactions[0].direction).toBe("sent");

      const receivedOnly = await paymentsService.queryTransactions(
        senderUserId,
        { direction: "received" },
      );
      expect(receivedOnly.transactions).toHaveLength(1);
      expect(receivedOnly.transactions[0].direction).toBe("received");

      const all = await paymentsService.queryTransactions(senderUserId, {
        direction: "all",
      });
      expect(all.transactions).toHaveLength(2);
    });

    it("should filter by status", async () => {
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
        amount: 50,
        status: "failed",
      });

      const completedOnly = await paymentsService.queryTransactions(
        senderUserId,
        { status: "completed" },
      );
      expect(completedOnly.transactions).toHaveLength(1);
      expect(completedOnly.transactions[0].status).toBe("completed");
      expect(completedOnly.transactions[0].amount).toBe(100);

      const failedOnly = await paymentsService.queryTransactions(senderUserId, {
        status: "failed",
      });
      expect(failedOnly.transactions).toHaveLength(1);
      expect(failedOnly.transactions[0].status).toBe("failed");
    });

    it("should filter by date range", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert old transaction (7 days ago)
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 100,
        createdAtOffset: 7 * 24 * 60 * 60 * 1000,
      });

      // Insert recent transaction (1 hour ago)
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 50,
        createdAtOffset: 60 * 60 * 1000,
      });

      // Filter for last 3 days only
      const threeDaysAgo = new Date(
        Date.now() - 3 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const recent = await paymentsService.queryTransactions(senderUserId, {
        from: threeDaysAgo,
      });
      expect(recent.transactions).toHaveLength(1);
      expect(recent.transactions[0].amount).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------
  // sendPayment() — requires Hedera
  // ---------------------------------------------------------------------------

  describe("sendPayment()", () => {
    it("should reject self-payment", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // sendPayment checks amount first, then self-payment
      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          senderAccountId, // sending to self
          10,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should reject invalid amount (0)", async () => {
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

    it("should reject invalid currency", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          recipientAccountId,
          10,
          "ETH",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidCurrencyException);
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentRequest()
  // ---------------------------------------------------------------------------

  describe("getPaymentRequest()", () => {
    it("should throw PaymentRequestNotFoundException for unknown ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(paymentsService.getPaymentRequest(uuidv4())).rejects.toThrow(
        PaymentRequestNotFoundException,
      );
    });

    it("should return a stored payment request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 42;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "pending";
      paymentRequest.description = "Test request";
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      const result = await paymentsService.getPaymentRequest(requestId);
      expect(result).toBeDefined();
      expect(result.id).toBe(requestId);
      expect(result.amount).toBe(42);
      expect(result.currency).toBe("TMUSD");
      expect(result.status).toBe("pending");
      expect(result.description).toBe("Test request");
    });

    it("should auto-expire a payment request past its expiry date", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 20;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "pending";
      paymentRequest.expiresAt = new Date(Date.now() - 1000); // Already expired
      await paymentRequestRepo.save(paymentRequest);

      const result = await paymentsService.getPaymentRequest(requestId);
      expect(result.status).toBe("expired");

      // Verify status updated in DB
      const dbRequest = await paymentRequestRepo.findOne({
        where: { id: requestId },
      });
      expect(dbRequest!.status).toBe("expired");
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentRequests() — list with filters
  // ---------------------------------------------------------------------------

  describe("getPaymentRequests()", () => {
    it("should return empty list when no requests exist", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const result = await paymentsService.getPaymentRequests(
        uuidv4(), // non-existent conversation
      );
      expect(result.requests).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    it("should filter by status", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert requests with different statuses
      for (const status of ["pending", "declined"] as const) {
        const reqId = uuidv4();
        createdPaymentRequestIds.push(reqId);

        const req = new PaymentRequestEntity();
        req.id = reqId;
        req.requesterUserId = senderUserId;
        req.hcsTopicId = testTopicId;
        req.hcsSequenceNumber = 1;
        req.amount = 10;
        req.currency = "TMUSD";
        req.status = status;
        req.conversationId = createdConversationIds[0];
        req.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await paymentRequestRepo.save(req);
      }

      const pendingOnly = await paymentsService.getPaymentRequests(
        createdConversationIds[0],
        "pending",
      );
      expect(pendingOnly.requests.every((r) => r.status === "pending")).toBe(
        true,
      );

      const declinedOnly = await paymentsService.getPaymentRequests(
        createdConversationIds[0],
        "declined",
      );
      expect(declinedOnly.requests.every((r) => r.status === "declined")).toBe(
        true,
      );
    });

    it("should paginate payment requests correctly", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert 5 payment requests staggered by time
      for (let i = 0; i < 5; i++) {
        const reqId = uuidv4();
        createdPaymentRequestIds.push(reqId);

        const req = new PaymentRequestEntity();
        req.id = reqId;
        req.requesterUserId = senderUserId;
        req.hcsTopicId = testTopicId;
        req.hcsSequenceNumber = i + 1;
        req.amount = (i + 1) * 5;
        req.currency = "TMUSD";
        req.status = "pending";
        req.conversationId = createdConversationIds[0];
        req.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await paymentRequestRepo.save(req);

        // Stagger createdAt so pagination cursor works deterministically
        await paymentRequestRepo
          .createQueryBuilder()
          .update()
          .set({
            createdAt: new Date(Date.now() - i * 60000),
          })
          .where("id = :id", { id: reqId })
          .execute();
      }

      // Page 1 (limit 2)
      const page1 = await paymentsService.getPaymentRequests(
        createdConversationIds[0],
        undefined,
        2,
      );
      expect(page1.requests).toHaveLength(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.cursor).not.toBeNull();

      // Page 2
      const page2 = await paymentsService.getPaymentRequests(
        createdConversationIds[0],
        undefined,
        2,
        page1.cursor!,
      );
      expect(page2.requests).toHaveLength(2);
      expect(page2.hasMore).toBe(true);

      // Page 3
      const page3 = await paymentsService.getPaymentRequests(
        createdConversationIds[0],
        undefined,
        2,
        page2.cursor!,
      );
      expect(page3.requests).toHaveLength(1);
      expect(page3.hasMore).toBe(false);
    });

    it("should auto-expire pending requests past their expiry in list results", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const expiredReqId = uuidv4();
      const freshReqId = uuidv4();
      createdPaymentRequestIds.push(expiredReqId, freshReqId);

      // Insert an expired request (expiresAt in the past)
      const expiredReq = new PaymentRequestEntity();
      expiredReq.id = expiredReqId;
      expiredReq.requesterUserId = senderUserId;
      expiredReq.hcsTopicId = testTopicId;
      expiredReq.hcsSequenceNumber = 1;
      expiredReq.amount = 15;
      expiredReq.currency = "TMUSD";
      expiredReq.status = "pending";
      expiredReq.conversationId = createdConversationIds[0];
      expiredReq.expiresAt = new Date(Date.now() - 60000); // 1 min ago
      await paymentRequestRepo.save(expiredReq);

      // Insert a fresh pending request
      const freshReq = new PaymentRequestEntity();
      freshReq.id = freshReqId;
      freshReq.requesterUserId = senderUserId;
      freshReq.hcsTopicId = testTopicId;
      freshReq.hcsSequenceNumber = 2;
      freshReq.amount = 20;
      freshReq.currency = "TMUSD";
      freshReq.status = "pending";
      freshReq.conversationId = createdConversationIds[0];
      freshReq.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(freshReq);

      // Query all requests for this conversation
      const result = await paymentsService.getPaymentRequests(
        createdConversationIds[0],
      );

      const expiredResult = result.requests.find((r) => r.id === expiredReqId);
      const freshResult = result.requests.find((r) => r.id === freshReqId);

      expect(expiredResult).toBeDefined();
      expect(expiredResult!.status).toBe("expired");
      expect(freshResult).toBeDefined();
      expect(freshResult!.status).toBe("pending");

      // Verify expired status was persisted to DB
      const dbExpired = await paymentRequestRepo.findOne({
        where: { id: expiredReqId },
      });
      expect(dbExpired!.status).toBe("expired");
    });
  });

  // ---------------------------------------------------------------------------
  // fulfillPaymentRequest() — non-Hedera error paths
  // ---------------------------------------------------------------------------

  describe("fulfillPaymentRequest() — error paths", () => {
    it("should throw PaymentRequestNotFoundException for unknown request ID", async () => {
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

    it("should throw CannotPayOwnRequestException when requester tries to fulfill own request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 50;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "pending";
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      // The sender (requester) tries to fulfill their own request
      await expect(
        paymentsService.fulfillPaymentRequest(
          makeSenderPayload(),
          requestId,
          testTopicId,
        ),
      ).rejects.toThrow(CannotPayOwnRequestException);
    });

    it("should throw PaymentRequestAlreadyPaidException for already-paid request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 30;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "paid";
      paymentRequest.paidTxId = "0.0.fake-tx-already-paid";
      paymentRequest.paidAt = new Date();
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      await expect(
        paymentsService.fulfillPaymentRequest(
          makeRecipientPayload(),
          requestId,
          testTopicId,
        ),
      ).rejects.toThrow(PaymentRequestAlreadyPaidException);
    });

    it("should throw PaymentRequestAlreadyDeclinedException for declined request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 30;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "declined";
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      await expect(
        paymentsService.fulfillPaymentRequest(
          makeRecipientPayload(),
          requestId,
          testTopicId,
        ),
      ).rejects.toThrow(PaymentRequestAlreadyDeclinedException);
    });

    it("should throw PaymentRequestExpiredException for expired request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 30;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "pending";
      paymentRequest.expiresAt = new Date(Date.now() - 60000); // expired 1 min ago
      await paymentRequestRepo.save(paymentRequest);

      await expect(
        paymentsService.fulfillPaymentRequest(
          makeRecipientPayload(),
          requestId,
          testTopicId,
        ),
      ).rejects.toThrow(PaymentRequestExpiredException);

      // Verify status was updated to 'expired' in DB
      const dbReq = await paymentRequestRepo.findOne({
        where: { id: requestId },
      });
      expect(dbReq!.status).toBe("expired");
    });

    it("should throw MissingWalletException when requester has no Hedera account (requires Hedera)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn(
          "SKIPPED: Hedera not configured — fulfillPaymentRequest requires HCS for transfer",
        );
        pending();
        return;
      }

      // Create a user without a Hedera account
      const noWalletUserId = uuidv4();
      createdUserIds.push(noWalletUserId);

      const noWalletUser = userRepo.create({
        id: noWalletUserId,
        hederaAccountId: null,
        displayName: "No Wallet User",
        status: "registered",
      });
      await userRepo.save(noWalletUser);

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = noWalletUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 20;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "pending";
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      await expect(
        paymentsService.fulfillPaymentRequest(
          makeRecipientPayload(),
          requestId,
          testTopicId,
        ),
      ).rejects.toThrow(MissingWalletException);
    });
  });

  // ---------------------------------------------------------------------------
  // declinePaymentRequest() — additional edge cases
  // ---------------------------------------------------------------------------

  describe("declinePaymentRequest() — additional edge cases", () => {
    it("should throw PaymentRequestAlreadyDeclinedException for already-declined request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 15;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "declined";
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

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

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 15;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "paid";
      paymentRequest.paidTxId = "0.0.paid-tx";
      paymentRequest.paidAt = new Date();
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      await expect(
        paymentsService.declinePaymentRequest(
          makeRecipientPayload(),
          requestId,
        ),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should throw PaymentRequestNotActionableException for expired request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 15;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "expired";
      paymentRequest.expiresAt = new Date(Date.now() - 60000);
      await paymentRequestRepo.save(paymentRequest);

      await expect(
        paymentsService.declinePaymentRequest(
          makeRecipientPayload(),
          requestId,
        ),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });
  });

  // ---------------------------------------------------------------------------
  // sendPayment() — additional error paths
  // ---------------------------------------------------------------------------

  describe("sendPayment() — additional error paths", () => {
    it("should throw UserNotFoundException for unknown recipient", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          "0.0.99999999", // non-existent account
          10,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(UserNotFoundException);
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
          -5,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw InvalidPaymentAmountException for amount exceeding max", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.sendPayment(
          makeSenderPayload(),
          recipientAccountId,
          PAYMENT_CONSTANTS.MAX_AMOUNT + 1,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw NotConversationParticipantException for non-member sender", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const outsiderPayload: JwtPayload = {
        sub: uuidv4(),
        hederaAccountId: "0.0.77777777",
        identifier: "outsider@test.local",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      // Create a user in DB so UserNotFoundException is not hit first
      const outsiderUserId = outsiderPayload.sub;
      createdUserIds.push(outsiderUserId);
      const outsiderUser = userRepo.create({
        id: outsiderUserId,
        hederaAccountId: outsiderPayload.hederaAccountId,
        displayName: "Outsider",
        status: "active",
      });
      await userRepo.save(outsiderUser);

      await expect(
        paymentsService.sendPayment(
          outsiderPayload,
          recipientAccountId,
          10,
          "TMUSD",
          testTopicId,
        ),
      ).rejects.toThrow(NotConversationParticipantException);
    });
  });

  // ---------------------------------------------------------------------------
  // queryTransactions() — additional filter & pagination tests
  // ---------------------------------------------------------------------------

  describe("queryTransactions() — additional filters", () => {
    it("should filter by 'to' date (upper bound)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Recent transaction (1 hour ago)
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 100,
        createdAtOffset: 60 * 60 * 1000,
      });

      // Old transaction (10 days ago)
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 200,
        createdAtOffset: 10 * 24 * 60 * 60 * 1000,
      });

      // Filter: only before 5 days ago (should return only the old one)
      const fiveDaysAgo = new Date(
        Date.now() - 5 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const result = await paymentsService.queryTransactions(senderUserId, {
        to: fiveDaysAgo,
      });
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount).toBe(200);
    });

    it("should filter by both from and to date range", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Transaction 1: 2 days ago
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 10,
        createdAtOffset: 2 * 24 * 60 * 60 * 1000,
      });

      // Transaction 2: 5 days ago
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 20,
        createdAtOffset: 5 * 24 * 60 * 60 * 1000,
      });

      // Transaction 3: 10 days ago
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 30,
        createdAtOffset: 10 * 24 * 60 * 60 * 1000,
      });

      // Filter: between 6 days ago and 1 day ago
      const sixDaysAgo = new Date(
        Date.now() - 6 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const oneDayAgo = new Date(
        Date.now() - 1 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const result = await paymentsService.queryTransactions(senderUserId, {
        from: sixDaysAgo,
        to: oneDayAgo,
      });
      expect(result.transactions).toHaveLength(2);

      const amounts = result.transactions.map((t) => t.amount).sort();
      expect(amounts).toEqual([10, 20]);
    });

    it("should handle combined direction + status filters", async () => {
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
        amount: 50,
        status: "failed",
      });
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "received",
        amount: 25,
        status: "completed",
      });
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "received",
        amount: 75,
        status: "failed",
      });

      // Only sent + completed
      const result = await paymentsService.queryTransactions(senderUserId, {
        direction: "sent",
        status: "completed",
      });
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount).toBe(100);
      expect(result.transactions[0].direction).toBe("sent");
      expect(result.transactions[0].status).toBe("completed");

      // Only received + failed
      const result2 = await paymentsService.queryTransactions(senderUserId, {
        direction: "received",
        status: "failed",
      });
      expect(result2.transactions).toHaveLength(1);
      expect(result2.transactions[0].amount).toBe(75);
    });

    it("should paginate queryTransactions results", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Insert 5 transactions with staggered timestamps
      for (let i = 0; i < 5; i++) {
        await insertTransactionDirectly({
          userId: senderUserId,
          counterpartyId: recipientUserId,
          direction: "sent",
          amount: (i + 1) * 10,
          createdAtOffset: i * 60000,
        });
      }

      // Page 1 (limit 2)
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
      expect(page2.hasMore).toBe(true);

      // Page 3
      const page3 = await paymentsService.queryTransactions(senderUserId, {
        limit: 2,
        cursor: page2.cursor!,
      });
      expect(page3.transactions).toHaveLength(1);
      expect(page3.hasMore).toBe(false);

      // Verify no overlap between pages
      const allIds = [
        ...page1.transactions.map((t) => t.id),
        ...page2.transactions.map((t) => t.id),
        ...page3.transactions.map((t) => t.id),
      ];
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(5);
    });

    it("should filter pending transactions", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 100,
        status: "pending",
      });
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 200,
        status: "completed",
      });

      const pendingOnly = await paymentsService.queryTransactions(
        senderUserId,
        { status: "pending" },
      );
      expect(pendingOnly.transactions).toHaveLength(1);
      expect(pendingOnly.transactions[0].amount).toBe(100);
      expect(pendingOnly.transactions[0].status).toBe("pending");
    });

    it("should search by Hedera transaction ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const specificHederaTxId = `0.0.search-target-${Date.now()}`;

      const txId = uuidv4();
      createdTransactionIds.push(txId);

      const entity = new TransactionEntity();
      entity.id = txId;
      entity.userId = senderUserId;
      entity.counterpartyId = recipientUserId;
      entity.direction = "sent";
      entity.amount = 42;
      entity.currency = "TMUSD";
      entity.status = "completed";
      entity.paymentType = "send";
      entity.completedAt = new Date();
      entity.hederaTxId = specificHederaTxId;
      await transactionRepo.save(entity);

      // Also insert a non-matching transaction
      await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 99,
        status: "completed",
      });

      const result = await paymentsService.queryTransactions(senderUserId, {
        search: "search-target",
      });
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].amount).toBe(42);
      expect(result.transactions[0].hederaTxId).toBe(specificHederaTxId);
    });

    it("should search by counterparty display name", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // recipientUserId was seeded with displayName "Payment Recipient"
      // The search looks for users table display_name matching the search
      const txId = uuidv4();
      createdTransactionIds.push(txId);

      const entity = new TransactionEntity();
      entity.id = txId;
      entity.userId = senderUserId;
      entity.counterpartyId = recipientUserId; // maps to "Payment Recipient"
      entity.direction = "sent";
      entity.amount = 77;
      entity.currency = "TMUSD";
      entity.status = "completed";
      entity.paymentType = "send";
      entity.completedAt = new Date();
      await transactionRepo.save(entity);

      const result = await paymentsService.queryTransactions(senderUserId, {
        search: "Payment Recipient",
      });
      expect(result.transactions.length).toBeGreaterThanOrEqual(1);

      const found = result.transactions.find((t) => t.id === txId);
      expect(found).toBeDefined();
      expect(found!.amount).toBe(77);
    });
  });

  // ---------------------------------------------------------------------------
  // getTransactionDetail() — T32 detail with on-chain proof links
  // ---------------------------------------------------------------------------

  describe("getTransactionDetail()", () => {
    it("should throw TransactionNotFoundException for non-existent transaction", async () => {
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

      // Insert a transaction belonging to senderUserId
      const tx = await insertTransactionDirectly({
        userId: senderUserId,
        counterpartyId: recipientUserId,
        direction: "sent",
        amount: 100,
      });

      // Try to fetch with recipientUserId (wrong user)
      await expect(
        paymentsService.getTransactionDetail(tx.id, recipientUserId),
      ).rejects.toThrow(TransactionNotFoundException);
    });

    it("should return full transaction detail with counterparty profile", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const txId = uuidv4();
      createdTransactionIds.push(txId);

      const entity = new TransactionEntity();
      entity.id = txId;
      entity.userId = senderUserId;
      entity.counterpartyId = recipientUserId;
      entity.direction = "sent";
      entity.amount = 250;
      entity.currency = "TMUSD";
      entity.status = "completed";
      entity.paymentType = "send";
      entity.completedAt = new Date();
      entity.hederaTxId = "0.0.detail-tx-123";
      entity.description = "Test detail description";
      await transactionRepo.save(entity);

      const detail = await paymentsService.getTransactionDetail(
        txId,
        senderUserId,
      );

      // Basic fields
      expect(detail.id).toBe(txId);
      expect(detail.direction).toBe("sent");
      expect(detail.amount).toBe(250);
      expect(detail.currency).toBe("TMUSD");
      expect(detail.status).toBe("completed");
      expect(detail.paymentType).toBe("send");
      expect(detail.description).toBe("Test detail description");
      expect(detail.hederaTxId).toBe("0.0.detail-tx-123");
      expect(typeof detail.createdAt).toBe("string");
      expect(detail.completedAt).not.toBeNull();

      // Counterparty profile (should resolve from recipientUserId)
      expect(detail.counterpartyProfile).toBeDefined();
      expect(detail.counterpartyProfile!.displayName).toBe("Payment Recipient");
      expect(detail.counterpartyProfile!.hederaAccountId).toBe(
        recipientAccountId,
      );

      // On-chain proof URLs
      expect(detail.onChainProof).toBeDefined();
      expect(detail.onChainProof.htsExplorerUrl).not.toBeNull();
      expect(detail.onChainProof.htsExplorerUrl).toContain("0.0.detail-tx-123");
    });

    it("should return null counterpartyProfile when counterparty user not found", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const txId = uuidv4();
      createdTransactionIds.push(txId);

      const nonExistentUserId = uuidv4();

      const entity = new TransactionEntity();
      entity.id = txId;
      entity.userId = senderUserId;
      entity.counterpartyId = nonExistentUserId;
      entity.direction = "sent";
      entity.amount = 50;
      entity.currency = "TMUSD";
      entity.status = "completed";
      entity.paymentType = "send";
      entity.completedAt = new Date();
      await transactionRepo.save(entity);

      const detail = await paymentsService.getTransactionDetail(
        txId,
        senderUserId,
      );

      expect(detail.id).toBe(txId);
      expect(detail.counterpartyProfile).toBeNull();
    });

    it("should return null hcsExplorerUrl when no hcsMessageSeq", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const txId = uuidv4();
      createdTransactionIds.push(txId);

      const entity = new TransactionEntity();
      entity.id = txId;
      entity.userId = senderUserId;
      entity.counterpartyId = recipientUserId;
      entity.direction = "sent";
      entity.amount = 60;
      entity.currency = "TMUSD";
      entity.status = "completed";
      entity.paymentType = "send";
      entity.completedAt = new Date();
      // No hederaTxId, no hcsMessageSeq
      await transactionRepo.save(entity);

      const detail = await paymentsService.getTransactionDetail(
        txId,
        senderUserId,
      );

      expect(detail.onChainProof.hcsExplorerUrl).toBeNull();
      expect(detail.onChainProof.htsExplorerUrl).toBeNull();
    });

    it("should include conversation and payment request references when present", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const payReqId = uuidv4();
      createdPaymentRequestIds.push(payReqId);

      // Create a payment request to reference
      const payReq = new PaymentRequestEntity();
      payReq.id = payReqId;
      payReq.requesterUserId = senderUserId;
      payReq.hcsTopicId = testTopicId;
      payReq.hcsSequenceNumber = 1;
      payReq.amount = 80;
      payReq.currency = "TMUSD";
      payReq.status = "paid";
      payReq.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      payReq.conversationId = createdConversationIds[0];
      await paymentRequestRepo.save(payReq);

      const txId = uuidv4();
      createdTransactionIds.push(txId);

      const entity = new TransactionEntity();
      entity.id = txId;
      entity.userId = senderUserId;
      entity.counterpartyId = recipientUserId;
      entity.direction = "sent";
      entity.amount = 80;
      entity.currency = "TMUSD";
      entity.status = "completed";
      entity.paymentType = "request_fulfillment";
      entity.completedAt = new Date();
      entity.conversationId = createdConversationIds[0];
      entity.paymentRequestId = payReqId;
      entity.hcsMessageSeq = 42;
      entity.hederaTxId = "0.0.fulfillment-tx";
      await transactionRepo.save(entity);

      const detail = await paymentsService.getTransactionDetail(
        txId,
        senderUserId,
      );

      expect(detail.conversationId).toBe(createdConversationIds[0]);
      expect(detail.paymentRequestId).toBe(payReqId);
      expect(detail.paymentType).toBe("request_fulfillment");
      expect(detail.hcsMessageSeq).toBe(42);
      expect(detail.onChainProof.hcsExplorerUrl).not.toBeNull();
      expect(detail.onChainProof.htsExplorerUrl).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getBalance() — non-Hedera error path
  // ---------------------------------------------------------------------------

  describe("getBalance()", () => {
    it("should throw MissingWalletException for empty account ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(paymentsService.getBalance("")).rejects.toThrow(
        MissingWalletException,
      );
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentHistory() — additional coverage
  // ---------------------------------------------------------------------------

  describe("getPaymentHistory() — additional coverage", () => {
    it("should map 'failed' status correctly", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertPaymentIndexDirectly({
        senderAccount: senderAccountId,
        recipientAccount: recipientAccountId,
        amount: 75,
        status: "failed",
      });

      const result = await paymentsService.getPaymentHistory(senderAccountId);
      expect(result.transactions).toHaveLength(1);
      expect(result.transactions[0].status).toBe("failed");
      expect(result.transactions[0].amount).toBe(75);
    });

    it("should filter by recipient account (received payments)", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Create a third user to be a unique sender
      const thirdAccountId = `0.0.11${testRunId}`;

      await insertPaymentIndexDirectly({
        senderAccount: thirdAccountId,
        recipientAccount: recipientAccountId,
        amount: 33,
      });

      const result =
        await paymentsService.getPaymentHistory(recipientAccountId);
      const receivedTx = result.transactions.find(
        (t) => t.direction === "received" && t.amount === 33,
      );
      expect(receivedTx).toBeDefined();
      expect(receivedTx!.counterpartyId).toBe(thirdAccountId);
    });

    it("should handle request_fulfillment payment type", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertPaymentIndexDirectly({
        senderAccount: senderAccountId,
        recipientAccount: recipientAccountId,
        amount: 120,
        paymentType: "request_fulfillment",
      });

      const result = await paymentsService.getPaymentHistory(senderAccountId);
      const fulfillmentTx = result.transactions.find(
        (t) => t.paymentType === "request_fulfillment",
      );
      expect(fulfillmentTx).toBeDefined();
      expect(fulfillmentTx!.amount).toBe(120);
      expect(fulfillmentTx!.direction).toBe("sent");
    });

    it("should support USDC currency", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await insertPaymentIndexDirectly({
        senderAccount: senderAccountId,
        recipientAccount: recipientAccountId,
        amount: 500,
        currency: "USDC",
      });

      const result = await paymentsService.getPaymentHistory(senderAccountId);
      const usdcTx = result.transactions.find((t) => t.currency === "USDC");
      expect(usdcTx).toBeDefined();
      expect(usdcTx!.amount).toBe(500);
      expect(usdcTx!.currency).toBe("USDC");
    });
  });

  // ---------------------------------------------------------------------------
  // getPaymentRequest() — additional coverage
  // ---------------------------------------------------------------------------

  describe("getPaymentRequest() — additional coverage", () => {
    it("should return all fields correctly for a request with description and conversation", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 99;
      paymentRequest.amount = 123.456;
      paymentRequest.currency = "USDC";
      paymentRequest.status = "pending";
      paymentRequest.description = "Dinner split";
      paymentRequest.conversationId = createdConversationIds[0];
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      const result = await paymentsService.getPaymentRequest(requestId);

      expect(result.id).toBe(requestId);
      expect(result.requesterUserId).toBe(senderUserId);
      expect(result.hcsTopicId).toBe(testTopicId);
      expect(result.hcsSequenceNumber).toBe(99);
      expect(result.amount).toBeCloseTo(123.456, 3);
      expect(result.currency).toBe("USDC");
      expect(result.status).toBe("pending");
      expect(result.description).toBe("Dinner split");
      expect(result.conversationId).toBe(createdConversationIds[0]);
      expect(result.paidTxId).toBeNull();
      expect(result.paidAt).toBeNull();
      expect(typeof result.expiresAt).toBe("string");
      expect(typeof result.createdAt).toBe("string");
    });

    it("should return paid request with paidTxId and paidAt", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);
      const paidTime = new Date();

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 55;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "paid";
      paymentRequest.paidTxId = "0.0.paid-tx-detail";
      paymentRequest.paidAt = paidTime;
      paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
      await paymentRequestRepo.save(paymentRequest);

      const result = await paymentsService.getPaymentRequest(requestId);

      expect(result.status).toBe("paid");
      expect(result.paidTxId).toBe("0.0.paid-tx-detail");
      expect(result.paidAt).not.toBeNull();
    });

    it("should not auto-expire a non-pending request even if past expiry", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = uuidv4();
      createdPaymentRequestIds.push(requestId);

      const paymentRequest = new PaymentRequestEntity();
      paymentRequest.id = requestId;
      paymentRequest.requesterUserId = senderUserId;
      paymentRequest.hcsTopicId = testTopicId;
      paymentRequest.hcsSequenceNumber = 1;
      paymentRequest.amount = 10;
      paymentRequest.currency = "TMUSD";
      paymentRequest.status = "paid"; // already paid
      paymentRequest.paidTxId = "0.0.already-paid";
      paymentRequest.paidAt = new Date();
      paymentRequest.expiresAt = new Date(Date.now() - 60000); // expired
      await paymentRequestRepo.save(paymentRequest);

      const result = await paymentsService.getPaymentRequest(requestId);

      // Should remain "paid" — autoExpire only changes "pending" to "expired"
      expect(result.status).toBe("paid");
    });
  });
});
