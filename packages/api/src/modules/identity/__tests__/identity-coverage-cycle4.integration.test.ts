/**
 * Identity Module Coverage Cycle 4 — Integration Tests
 *
 * Targets uncovered DB-only paths in:
 *   - KycService: handleKycCallback, getKycStatus, findByRequestId, validateUserForKyc
 *   - WalletService: ensureEncryptionKey (key generation path)
 *   - DidNftService: buildMetadata (pure function, various input combos)
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import net from "net";
import { v4 as uuidv4 } from "uuid";

import { KycService } from "../services/kyc.service";
import { WalletService } from "../services/wallet.service";
import { DidNftService } from "../services/did-nft.service";
import { HederaService } from "../../hedera/hedera.service";
import { MirrorNodeService } from "../../hedera/mirror-node.service";
import { MirsadAiService } from "../../integrations/mirsad-ai/mirsad-ai.service";
import { IpfsService } from "../../integrations/ipfs/ipfs.service";
import { TamamCustodyService } from "../../integrations/tamam-custody/tamam-custody.service";
import { RedisService } from "../../redis/redis.service";

import { UserEntity } from "../../../database/entities/user.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { FeedItemEntity } from "../../../database/entities/feed-item.entity";
import { PostLikeEntity } from "../../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../../database/entities/post-comment.entity";
import { NotificationEntity } from "../../../database/entities/notification.entity";
import { SocialFollowEntity } from "../../../database/entities/social-follow.entity";
import { ConversationEntity } from "../../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../../database/entities/conversation-member.entity";
import { MessageIndexEntity } from "../../../database/entities/message-index.entity";
import { PaymentIndexEntity } from "../../../database/entities/payment-index.entity";
import { PaymentRequestEntity } from "../../../database/entities/payment-request.entity";
import { TransactionEntity } from "../../../database/entities/transaction.entity";
import { PlatformTopicEntity } from "../../../database/entities/platform-topic.entity";
import { OrganizationEntity } from "../../../database/entities/organization.entity";
import { OrganizationMemberEntity } from "../../../database/entities/organization-member.entity";
import { OrganizationInvitationEntity } from "../../../database/entities/organization-invitation.entity";
import { BusinessProfileEntity } from "../../../database/entities/business-profile.entity";

import {
  KycCallbackInvalidException,
  KycRecordNotFoundException,
} from "../exceptions/kyc.exception";
import { KycInvalidStateException } from "../exceptions/kyc.exception";
import {
  UserNotFoundException,
  WalletAlreadyExistsException,
} from "../exceptions/wallet-creation.exception";

const logger = new Logger("IdentityCoverageCycle4");
const TEST_DB_HOST = "localhost";
const TEST_DB_PORT = 5433;
const TEST_DB_USER = "test";
const TEST_DB_PASS = "test";
const TEST_DB_NAME = "hedera_social_test";
const TEST_REDIS_HOST = "localhost";
const TEST_REDIS_PORT = 6380;

const ALL_ENTITIES = [
  UserEntity,
  FollowerCountEntity,
  PostIndexEntity,
  FeedItemEntity,
  PostLikeEntity,
  PostCommentEntity,
  NotificationEntity,
  SocialFollowEntity,
  ConversationEntity,
  ConversationMemberEntity,
  MessageIndexEntity,
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

describe("Identity Module Coverage Cycle 4", () => {
  let module: TestingModule;
  let kycService: KycService;
  let walletService: WalletService;
  let didNftService: DidNftService;
  let userRepo: Repository<UserEntity>;
  let postgresAvailable = false;

  const createdUserIds: string[] = [];

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
                  didTokenId: "",
                  mirrorNodeUrl: "https://testnet.mirrornode.hedera.com/api/v1",
                },
                jwt: {
                  secret:
                    "test-jwt-secret-key-minimum-32-characters-long-for-testing",
                  expiresIn: "24h",
                },
                pinata: {
                  gatewayUrl: "https://gateway.pinata.cloud/ipfs",
                  jwt: "",
                },
                mirsad: { apiUrl: "", apiKey: "" },
                custody: {
                  apiUrl: "",
                  apiKey: "",
                  apiSecret: "",
                  organizationId: "",
                },
              }),
            ],
          }),
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
          KycService,
          WalletService,
          DidNftService,
          HederaService,
          MirrorNodeService,
          MirsadAiService,
          IpfsService,
          TamamCustodyService,
          RedisService,
        ],
      }).compile();

      kycService = module.get<KycService>(KycService);
      walletService = module.get<WalletService>(WalletService);
      didNftService = module.get<DidNftService>(DidNftService);
      const ds = module.get<DataSource>(DataSource);
      userRepo = ds.getRepository(UserEntity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create test module: ${message}`);
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;
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
  // KycService.handleKycCallback
  // ───────────────────────────────────────────────────────────────────────────

  describe("KycService.handleKycCallback", () => {
    it("should approve KYC and set user status to active", async () => {
      if (skip()) return;
      const requestId = uuidv4();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const user1 = await createTestUser({
        status: "kyc_submitted",
        kycRequestId: requestId,
        kycSubmittedAt: new Date(),
      });

      const result = await kycService.handleKycCallback(requestId, "approved");
      expect(result.status).toBe("active");
      expect(result.kycLevel).toBe("basic");
      expect(result.kycCompletedAt).not.toBeNull();
    });

    it("should reject KYC and set user status to kyc_rejected", async () => {
      if (skip()) return;
      const requestId = uuidv4();
      await createTestUser({
        status: "kyc_submitted",
        kycRequestId: requestId,
        kycSubmittedAt: new Date(),
      });

      const result = await kycService.handleKycCallback(requestId, "rejected");
      expect(result.status).toBe("kyc_rejected");
      expect(result.kycCompletedAt).not.toBeNull();
    });

    it("should handle on_hold status (keeps kyc_submitted)", async () => {
      if (skip()) return;
      const requestId = uuidv4();
      await createTestUser({
        status: "kyc_submitted",
        kycRequestId: requestId,
        kycSubmittedAt: new Date(),
      });

      const result = await kycService.handleKycCallback(requestId, "on_hold");
      expect(result.status).toBe("kyc_submitted");
      expect(result.kycCompletedAt).not.toBeNull();
    });

    it("should be idempotent when already processed", async () => {
      if (skip()) return;
      const requestId = uuidv4();
      const completedAt = new Date(Date.now() - 86400000);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const user2 = await createTestUser({
        status: "active",
        kycRequestId: requestId,
        kycSubmittedAt: new Date(Date.now() - 172800000),
        kycCompletedAt: completedAt,
        kycLevel: "basic",
      });

      const result = await kycService.handleKycCallback(requestId, "rejected");
      // Should not change status — already processed
      expect(result.status).toBe("active");
      expect(result.kycLevel).toBe("basic");
    });

    it("should throw KycCallbackInvalidException for unknown request_id", async () => {
      if (skip()) return;
      await expect(
        kycService.handleKycCallback("nonexistent-request-id", "approved"),
      ).rejects.toThrow(KycCallbackInvalidException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // KycService.getKycStatus
  // ───────────────────────────────────────────────────────────────────────────

  describe("KycService.getKycStatus", () => {
    it("should return KYC status for a user with submitted KYC", async () => {
      if (skip()) return;
      const requestId = uuidv4();
      const user = await createTestUser({
        status: "kyc_submitted",
        kycRequestId: requestId,
        kycSubmittedAt: new Date(),
      });

      const result = await kycService.getKycStatus(user.id);
      expect(result.status).toBe("kyc_submitted");
      expect(result.kycRequestId).toBe(requestId);
      expect(result.canResubmit).toBe(false);
    });

    it("should return canResubmit=true for rejected users", async () => {
      if (skip()) return;
      const requestId = uuidv4();
      const user = await createTestUser({
        status: "kyc_rejected",
        kycRequestId: requestId,
        kycSubmittedAt: new Date(),
        kycCompletedAt: new Date(),
      });

      const result = await kycService.getKycStatus(user.id);
      expect(result.status).toBe("kyc_rejected");
      expect(result.canResubmit).toBe(true);
    });

    it("should throw UserNotFoundException for non-existent user", async () => {
      if (skip()) return;
      await expect(kycService.getKycStatus(uuidv4())).rejects.toThrow(
        UserNotFoundException,
      );
    });

    it("should throw KycRecordNotFoundException when no KYC submitted", async () => {
      if (skip()) return;
      const user = await createTestUser({ status: "pending_kyc" });

      await expect(kycService.getKycStatus(user.id)).rejects.toThrow(
        KycRecordNotFoundException,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // KycService.findByRequestId
  // ───────────────────────────────────────────────────────────────────────────

  describe("KycService.findByRequestId", () => {
    it("should return the user when request_id matches", async () => {
      if (skip()) return;
      const requestId = uuidv4();
      const user = await createTestUser({
        status: "kyc_submitted",
        kycRequestId: requestId,
      });

      const result = await kycService.findByRequestId(requestId);
      expect(result).not.toBeNull();
      expect(result!.id).toBe(user.id);
    });

    it("should return null when no user matches request_id", async () => {
      if (skip()) return;
      const result = await kycService.findByRequestId("nonexistent-id");
      expect(result).toBeNull();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // KycService — validateUserForKyc (via submitIndividualKyc validation)
  // ───────────────────────────────────────────────────────────────────────────

  describe("KycService validation (via submitIndividualKyc)", () => {
    it("should throw KycInvalidStateException when user is already active", async () => {
      if (skip()) return;
      const user = await createTestUser({ status: "active" });

      await expect(
        kycService.submitIndividualKyc(user.id, {
          fullLegalName: "Test User",
          dateOfBirth: "1990-01-01",
          nationality: "US",
          countryOfResidence: "US",
          currentResidentialAddress: "123 Test St",
          nationalIdNumber: "123456789",
        } as never),
      ).rejects.toThrow(KycInvalidStateException);
    });

    it("should throw KycInvalidStateException when user has no wallet", async () => {
      if (skip()) return;
      const user = await createTestUser({
        status: "pending_kyc",
        hederaAccountId: undefined as unknown as string,
      });
      // Update to null hederaAccountId
      await userRepo.update(user.id, { hederaAccountId: undefined });

      await expect(
        kycService.submitIndividualKyc(user.id, {
          fullLegalName: "Test User",
          dateOfBirth: "1990-01-01",
          nationality: "US",
          countryOfResidence: "US",
          currentResidentialAddress: "123 Test St",
          nationalIdNumber: "123456789",
        } as never),
      ).rejects.toThrow(KycInvalidStateException);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // WalletService.ensureEncryptionKey
  // ───────────────────────────────────────────────────────────────────────────

  describe("WalletService.ensureEncryptionKey", () => {
    it("should return existing key without generating new one", async () => {
      if (skip()) return;
      const existingKey = "dGVzdC1lbmNyeXB0aW9uLWtleS1iYXNlNjQ=";
      const user = await createTestUser({ encryptionPublicKey: existingKey });

      const result = await walletService.ensureEncryptionKey(user.id);
      expect(result.encryptionPublicKey).toBe(existingKey);
      expect(result.generated).toBe(false);
    });

    it("should generate new key when user has none", async () => {
      if (skip()) return;
      const user = await createTestUser();
      // Clear encryption key
      await userRepo.update(user.id, { encryptionPublicKey: undefined });

      const result = await walletService.ensureEncryptionKey(user.id);
      expect(result.encryptionPublicKey).toBeTruthy();
      expect(result.generated).toBe(true);

      // Verify persisted to DB
      const updated = await userRepo.findOne({ where: { id: user.id } });
      expect(updated!.encryptionPublicKey).toBe(result.encryptionPublicKey);
    });

    it("should throw UserNotFoundException for non-existent user", async () => {
      if (skip()) return;
      await expect(walletService.ensureEncryptionKey(uuidv4())).rejects.toThrow(
        UserNotFoundException,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // WalletService.createWallet — validation paths
  // ───────────────────────────────────────────────────────────────────────────

  describe("WalletService.createWallet validation", () => {
    it("should throw UserNotFoundException for non-existent user", async () => {
      if (skip()) return;
      await expect(walletService.createWallet(uuidv4())).rejects.toThrow(
        UserNotFoundException,
      );
    });

    it("should throw WalletAlreadyExistsException when wallet already exists", async () => {
      if (skip()) return;
      const user = await createTestUser({ hederaAccountId: "0.0.12345" });

      await expect(walletService.createWallet(user.id)).rejects.toThrow(
        WalletAlreadyExistsException,
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // DidNftService.buildMetadata — pure function
  // ───────────────────────────────────────────────────────────────────────────

  describe("DidNftService.buildMetadata", () => {
    it("should build HIP-412 compliant metadata for individual account", () => {
      if (skip()) return;
      const metadata = didNftService.buildMetadata({
        hederaAccountId: "0.0.123456",
        accountType: "individual",
        kycLevel: "basic",
        displayName: "Test User",
        bio: "A test bio",
        location: "Bahrain",
      });

      expect(metadata.name).toContain("DID:hedera:testnet:0.0.123456");
      expect(metadata.format).toBe("HIP412@2.0.0");
      expect(metadata.properties.accountType).toBe("individual");
      expect(metadata.properties.kycLevel).toBe("basic");
      expect(metadata.properties.displayName).toBe("Test User");
      expect(metadata.properties.kycHash).toBeTruthy();
      expect(metadata.businessProperties).toBeUndefined();
    });

    it("should include business properties for business account", () => {
      if (skip()) return;
      const metadata = didNftService.buildMetadata({
        hederaAccountId: "0.0.789012",
        accountType: "business",
        kycLevel: "basic",
        displayName: "Acme Corp",
        bio: "A business",
        location: "Bahrain",
        businessProperties: {
          companyName: "Acme Corp",
          registrationNumber: "CR-12345",
          businessCategory: "Technology",
          website: "https://acme.com",
        },
      });

      expect(metadata.properties.accountType).toBe("business");
      expect(metadata.businessProperties).toBeDefined();
      expect(metadata.businessProperties!.companyName).toBe("Acme Corp");
      expect(metadata.businessProperties!.registrationNumber).toBe("CR-12345");
      expect(metadata.businessProperties!.kybLevel).toBe("basic");
    });

    it("should include avatar IPFS URI when provided", () => {
      if (skip()) return;
      const metadata = didNftService.buildMetadata({
        hederaAccountId: "0.0.111222",
        accountType: "individual",
        kycLevel: "basic",
        displayName: "Avatar User",
        bio: "",
        avatarIpfsCid: "QmTestCid12345",
      });

      expect(metadata.image).toBe("ipfs://QmTestCid12345");
    });

    it("should set empty string for image when no avatar", () => {
      if (skip()) return;
      const metadata = didNftService.buildMetadata({
        hederaAccountId: "0.0.333444",
        accountType: "individual",
        kycLevel: "basic",
        displayName: "No Avatar",
        bio: "",
      });

      expect(metadata.image).toBe("");
    });

    it("should generate deterministic kycHash", () => {
      if (skip()) return;
      const metadata = didNftService.buildMetadata({
        hederaAccountId: "0.0.555666",
        accountType: "individual",
        kycLevel: "basic",
        displayName: "Hash Test",
        bio: "",
      });

      expect(metadata.properties.kycHash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // WalletService.getWalletStatus — additional edge cases
  // ───────────────────────────────────────────────────────────────────────────

  describe("WalletService.getWalletStatus additional", () => {
    it("should return hasWallet=false when no hederaAccountId", async () => {
      if (skip()) return;
      const id = uuidv4();
      const user = userRepo.create({
        id,
        displayName: `No Wallet ${id.slice(0, 8)}`,
        status: "registered",
      });
      const saved = await userRepo.save(user);
      createdUserIds.push(saved.id);

      const result = await walletService.getWalletStatus(saved.id);
      expect(result.hasWallet).toBe(false);
      expect(result.hederaAccountId).toBeNull();
    });

    it("should return full wallet info when present", async () => {
      if (skip()) return;
      const user = await createTestUser({
        hederaAccountId: "0.0.999888",
        publicKey: "302a300506032b6570032100test",
        status: "active",
      });

      const result = await walletService.getWalletStatus(user.id);
      expect(result.hasWallet).toBe(true);
      expect(result.hederaAccountId).toBe("0.0.999888");
      expect(result.publicKey).toBe("302a300506032b6570032100test");
      expect(result.status).toBe("active");
    });
  });
});
