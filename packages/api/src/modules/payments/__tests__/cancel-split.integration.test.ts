/**
 * Payment Cancel & Split Integration Tests (GAP-006)
 *
 * Tests cancelPaymentRequest and createSplitPayment against REAL PostgreSQL.
 * Cancel tests seed payment requests directly in DB (bypassing HCS).
 * Split payment success tests require Hedera credentials (HCS topic submission).
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
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
  PaymentRequestNotFoundException,
  PaymentRequestAlreadyCancelledException,
  PaymentRequestNotActionableException,
  InvalidPaymentAmountException,
  NotConversationParticipantException,
} from "../exceptions/payment.exceptions";
import type { JwtPayload } from "../../../common/guards/jwt-auth.guard";

const logger = new Logger("CancelSplitIntegrationTest");

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

function isHederaConfigured(): boolean {
  return !!(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);
}

describe("Payment Cancel & Split Integration Tests", () => {
  let module: TestingModule;
  let paymentsService: PaymentsService;
  let paymentRequestRepo: Repository<PaymentRequestEntity>;
  let conversationRepo: Repository<ConversationEntity>;
  let memberRepo: Repository<ConversationMemberEntity>;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;
  let hederaConfigured = false;

  const testRunId = Date.now().toString().slice(-6);
  const requesterAccountId = `0.0.7${testRunId}`;
  const participant1AccountId = `0.0.8${testRunId}`;
  const participant2AccountId = `0.0.9${testRunId}`;
  const testTopicId = `0.0.11${testRunId}`;

  let requesterUserId: string;
  let participant1UserId: string;
  let participant2UserId: string;

  const createdPaymentRequestIds: string[] = [];
  const createdConversationIds: string[] = [];
  const createdUserIds: string[] = [];

  function makeRequesterPayload(): JwtPayload {
    return {
      sub: requesterUserId,
      hederaAccountId: requesterAccountId,
      identifier: "requester@test.local",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  function makeParticipant1Payload(): JwtPayload {
    return {
      sub: participant1UserId,
      hederaAccountId: participant1AccountId,
      identifier: "participant1@test.local",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  }

  /**
   * Insert a payment request directly into the DB, bypassing HCS.
   * This follows the same pattern as the existing payments.service.integration.test.ts.
   */
  async function insertPaymentRequestDirectly(opts: {
    requesterUserId: string;
    status?: "pending" | "paid" | "expired" | "declined" | "cancelled";
    amount?: number;
  }): Promise<string> {
    const requestId = uuidv4();
    createdPaymentRequestIds.push(requestId);

    const paymentRequest = new PaymentRequestEntity();
    paymentRequest.id = requestId;
    paymentRequest.requesterUserId = opts.requesterUserId;
    paymentRequest.hcsTopicId = testTopicId;
    paymentRequest.hcsSequenceNumber = 1;
    paymentRequest.amount = opts.amount ?? 10;
    paymentRequest.currency = "TMUSD";
    paymentRequest.status = opts.status ?? "pending";
    paymentRequest.expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    await paymentRequestRepo.save(paymentRequest);

    return requestId;
  }

  async function seedTestData(): Promise<void> {
    requesterUserId = uuidv4();
    participant1UserId = uuidv4();
    participant2UserId = uuidv4();
    createdUserIds.push(
      requesterUserId,
      participant1UserId,
      participant2UserId,
    );

    const users = [
      userRepo.create({
        id: requesterUserId,
        hederaAccountId: requesterAccountId,
        displayName: "Requester",
        status: "active",
      }),
      userRepo.create({
        id: participant1UserId,
        hederaAccountId: participant1AccountId,
        displayName: "Participant 1",
        status: "active",
      }),
      userRepo.create({
        id: participant2UserId,
        hederaAccountId: participant2AccountId,
        displayName: "Participant 2",
        status: "active",
      }),
    ];
    await userRepo.save(users);

    // Create conversation
    const conversationId = uuidv4();
    createdConversationIds.push(conversationId);

    const conversation = conversationRepo.create({
      id: conversationId,
      hcsTopicId: testTopicId,
      conversationType: "group",
      createdBy: requesterAccountId,
      groupName: "Split Test Group",
      lastMessageSeq: 0,
    });
    await conversationRepo.save(conversation);

    // Add all as members
    for (const accountId of [
      requesterAccountId,
      participant1AccountId,
      participant2AccountId,
    ]) {
      const member = memberRepo.create({
        conversationId,
        hederaAccountId: accountId,
        role: "member",
        lastReadSeq: 0,
      });
      await memberRepo.save(member);
    }
  }

  async function cleanupAll(): Promise<void> {
    try {
      // Clean requests by requester user IDs
      await paymentRequestRepo
        .createQueryBuilder()
        .delete()
        .from(PaymentRequestEntity)
        .where("requesterUserId IN (:...ids)", {
          ids: [requesterUserId, participant1UserId, participant2UserId],
        })
        .execute();

      for (const convId of createdConversationIds) {
        await memberRepo.delete({ conversationId: convId });
        await conversationRepo.delete(convId);
      }

      for (const userId of createdUserIds) {
        await userRepo.delete(userId);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`Cleanup failed: ${message}`);
    }
  }

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    hederaConfigured = isHederaConfigured();

    logger.log(
      `Infrastructure — PostgreSQL: ${postgresAvailable}, Hedera: ${hederaConfigured}`,
    );

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
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    if (createdPaymentRequestIds.length > 0) {
      try {
        await paymentRequestRepo
          .createQueryBuilder()
          .delete()
          .from(PaymentRequestEntity)
          .where("id IN (:...ids)", { ids: [...createdPaymentRequestIds] })
          .execute();
      } catch {
        /* cleanup best-effort */
      }
      createdPaymentRequestIds.length = 0;
    }
  });

  afterAll(async () => {
    if (module) {
      await cleanupAll();
      await module.close();
    }
  });

  // -------------------------------------------------------------------------
  // cancelPaymentRequest — seed payment requests directly in DB
  // -------------------------------------------------------------------------

  describe("cancelPaymentRequest", () => {
    it("should cancel a pending payment request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      // Seed directly in DB (no HCS needed)
      const requestId = await insertPaymentRequestDirectly({
        requesterUserId,
        amount: 5.0,
      });

      const result = await paymentsService.cancelPaymentRequest(
        makeRequesterPayload(),
        requestId,
      );

      expect(result).toBeDefined();
      expect(result.id).toBe(requestId);
      expect(result.status).toBe("cancelled");

      // Verify in DB
      const dbRecord = await paymentRequestRepo.findOne({
        where: { id: requestId },
      });
      expect(dbRecord!.status).toBe("cancelled");
    });

    it("should throw PaymentRequestNotActionableException for non-requester", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId,
      });

      await expect(
        paymentsService.cancelPaymentRequest(
          makeParticipant1Payload(),
          requestId,
        ),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should throw PaymentRequestAlreadyCancelledException for already cancelled request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId,
        status: "cancelled",
      });

      await expect(
        paymentsService.cancelPaymentRequest(makeRequesterPayload(), requestId),
      ).rejects.toThrow(PaymentRequestAlreadyCancelledException);
    });

    it("should throw PaymentRequestNotActionableException for declined request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId,
        status: "declined",
      });

      await expect(
        paymentsService.cancelPaymentRequest(makeRequesterPayload(), requestId),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should throw PaymentRequestNotActionableException for paid request", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const requestId = await insertPaymentRequestDirectly({
        requesterUserId,
        status: "paid",
      });

      await expect(
        paymentsService.cancelPaymentRequest(makeRequesterPayload(), requestId),
      ).rejects.toThrow(PaymentRequestNotActionableException);
    });

    it("should throw for non-existent request ID", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.cancelPaymentRequest(makeRequesterPayload(), uuidv4()),
      ).rejects.toThrow(PaymentRequestNotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // createSplitPayment — validation tests (no HCS needed),
  // success tests require Hedera
  // -------------------------------------------------------------------------

  describe("createSplitPayment", () => {
    it("should create equal split payment requests for all participants", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn(
          "SKIPPED: Hedera not configured — createSplitPayment requires HCS",
        );
        pending();
        return;
      }

      const result = await paymentsService.createSplitPayment(
        makeRequesterPayload(),
        {
          totalAmount: 30.0,
          currency: "TMUSD",
          splitMethod: "equal",
          participantAccountIds: [participant1AccountId, participant2AccountId],
          topicId: testTopicId,
          note: "Dinner split",
        },
      );

      createdPaymentRequestIds.push(...result.requestIds);

      expect(result).toBeDefined();
      expect(result.requestIds).toHaveLength(2);
      expect(result.totalAmount).toBe(30.0);
      expect(result.currency).toBe("TMUSD");
      expect(result.splitMethod).toBe("equal");
      expect(result.participantCount).toBe(2);

      for (const requestId of result.requestIds) {
        const req = await paymentRequestRepo.findOne({
          where: { id: requestId },
        });
        expect(req).not.toBeNull();
        expect(req!.amount).toBe("15");
        expect(req!.currency).toBe("TMUSD");
        expect(req!.status).toBe("pending");
      }
    }, 30000);

    it("should create custom split payment requests with specified amounts", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }
      if (!hederaConfigured) {
        logger.warn(
          "SKIPPED: Hedera not configured — createSplitPayment requires HCS",
        );
        pending();
        return;
      }

      const result = await paymentsService.createSplitPayment(
        makeRequesterPayload(),
        {
          totalAmount: 100.0,
          currency: "TMUSD",
          splitMethod: "custom",
          participantAccountIds: [participant1AccountId, participant2AccountId],
          topicId: testTopicId,
          customAmounts: {
            [participant1AccountId]: 60.0,
            [participant2AccountId]: 40.0,
          },
        },
      );

      createdPaymentRequestIds.push(...result.requestIds);

      expect(result.requestIds).toHaveLength(2);
      expect(result.splitMethod).toBe("custom");

      const requests = [];
      for (const requestId of result.requestIds) {
        const req = await paymentRequestRepo.findOne({
          where: { id: requestId },
        });
        expect(req).not.toBeNull();
        requests.push(req!);
      }

      const amounts = requests.map((r) => parseFloat(r.amount)).sort();
      expect(amounts).toEqual([40, 60]);
    }, 30000);

    it("should throw InvalidPaymentAmountException for custom split without customAmounts", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createSplitPayment(makeRequesterPayload(), {
          totalAmount: 30.0,
          currency: "TMUSD",
          splitMethod: "custom",
          participantAccountIds: [participant1AccountId],
          topicId: testTopicId,
        }),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw InvalidPaymentAmountException for custom split with zero amount", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      await expect(
        paymentsService.createSplitPayment(makeRequesterPayload(), {
          totalAmount: 30.0,
          currency: "TMUSD",
          splitMethod: "custom",
          participantAccountIds: [participant1AccountId],
          topicId: testTopicId,
          customAmounts: {
            [participant1AccountId]: 0,
          },
        }),
      ).rejects.toThrow(InvalidPaymentAmountException);
    });

    it("should throw NotConversationParticipantException for non-member", async () => {
      if (!postgresAvailable) {
        pending();
        return;
      }

      const outsiderPayload: JwtPayload = {
        sub: uuidv4(),
        hederaAccountId: "0.0.999999",
        identifier: "outsider@test.local",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      await expect(
        paymentsService.createSplitPayment(outsiderPayload, {
          totalAmount: 30.0,
          currency: "TMUSD",
          splitMethod: "equal",
          participantAccountIds: [participant1AccountId],
          topicId: testTopicId,
        }),
      ).rejects.toThrow(NotConversationParticipantException);
    });
  });
});
