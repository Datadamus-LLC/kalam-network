/**
 * OnboardingService Integration Tests
 *
 * Tests the full post-KYC onboarding orchestration against real PostgreSQL
 * and optionally against real Hedera testnet.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * The onboarding flow:
 *   1. Mint DID NFT (requires Hedera + DID token)
 *   2. Create public feed HCS topic (requires Hedera)
 *   3. Create notification inbox HCS topic (requires Hedera)
 *   4. Submit KYC attestation to HCS (non-critical, requires Hedera + topic config)
 *   5. Update user record to 'active'
 *
 * Tests that require only PostgreSQL:
 *   - Validation: throws for non-existent user
 *   - Validation: throws for user without Hedera account
 *
 * Tests that require Hedera testnet + PostgreSQL:
 *   - completeOnboarding() runs the full flow
 *   - User status updated to 'active'
 *   - Topics and DID NFT serial stored in DB
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import net from "net";
import { OnboardingService } from "../services/onboarding.service";
import { DidNftService } from "../services/did-nft.service";
import { HederaService } from "../../hedera/hedera.service";
import { IpfsService } from "../../integrations/ipfs/ipfs.service";
import { UserEntity } from "../../../database/entities/user.entity";
import { OnboardingException } from "../exceptions/kyc.exception";
import { UserNotFoundException } from "../exceptions/wallet-creation.exception";

const logger = new Logger("OnboardingServiceIntegrationTest");

async function isPostgresAvailable(): Promise<boolean> {
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
    socket.connect(5433, "localhost");
  });
}

function hasHederaCredentials(): boolean {
  return !!(
    process.env["HEDERA_OPERATOR_ID"] && process.env["HEDERA_OPERATOR_KEY"]
  );
}

function hasHederaDidTokenId(): boolean {
  return !!process.env["HEDERA_DID_TOKEN_ID"];
}

describe("OnboardingService Integration", () => {
  let module: TestingModule;
  let onboardingService: OnboardingService;
  let dataSource: DataSource;
  let userRepository: Repository<UserEntity>;
  let postgresAvailable: boolean;

  const createdUserIds: string[] = [];

  /**
   * Helper to insert a test user directly into the database.
   */
  async function insertTestUser(
    overrides: Partial<UserEntity> = {},
  ): Promise<UserEntity> {
    const id = overrides.id ?? uuidv4();
    const user = userRepository.create({
      id,
      email:
        overrides.email ??
        `onboarding-test-${Date.now()}-${Math.random()}@integration.test`,
      displayName: overrides.displayName ?? "Onboarding Test User",
      bio: overrides.bio ?? "Integration test user for onboarding",
      status: overrides.status ?? "kyc_submitted",
      accountType: overrides.accountType ?? "individual",
      hederaAccountId:
        overrides.hederaAccountId ?? `0.0.${Date.now() % 999999}`,
      ...overrides,
    });
    const saved = await userRepository.save(user);
    createdUserIds.push(saved.id);
    return saved;
  }

  beforeAll(async () => {
    postgresAvailable = await isPostgresAvailable();
    if (!postgresAvailable) {
      logger.warn(
        "PostgreSQL not available on port 5433 — tests will be skipped",
      );
      return;
    }

    const hederaAvailable = hasHederaCredentials();
    const didTokenAvailable = hasHederaDidTokenId();

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                hedera: {
                  network: "testnet",
                  operatorId: hederaAvailable
                    ? process.env["HEDERA_OPERATOR_ID"]
                    : "",
                  operatorKey: hederaAvailable
                    ? process.env["HEDERA_OPERATOR_KEY"]
                    : "",
                  didTokenId: didTokenAvailable
                    ? process.env["HEDERA_DID_TOKEN_ID"]
                    : "",
                  kycAttestationTopic:
                    process.env["HEDERA_KYC_ATTESTATION_TOPIC"] ?? "",
                },
                pinata: {
                  apiKey: process.env["PINATA_API_KEY"] ?? "",
                  secretKey: process.env["PINATA_SECRET_KEY"] ?? "",
                  gatewayUrl:
                    process.env["PINATA_GATEWAY_URL"] ??
                    "https://gateway.pinata.cloud/ipfs",
                },
              }),
            ],
          }),
          TypeOrmModule.forRoot({
            type: "postgres",
            host: "localhost",
            port: 5433,
            username: "test",
            password: "test",
            database: "hedera_social_test",
            entities: [UserEntity],
            synchronize: true,
            logging: false,
          }),
          TypeOrmModule.forFeature([UserEntity]),
        ],
        providers: [
          OnboardingService,
          DidNftService,
          HederaService,
          IpfsService,
        ],
      }).compile();

      onboardingService = module.get(OnboardingService);
      dataSource = module.get(DataSource);
      userRepository = dataSource.getRepository(UserEntity);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(
        `PostgreSQL connection failed (port open but auth/db error): ${msg} — tests will be skipped`,
      );
      postgresAvailable = false;
    }
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    for (const id of createdUserIds) {
      try {
        await userRepository.delete(id);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn(`Cleanup failed for user ${id}: ${msg}`);
      }
    }
    createdUserIds.length = 0;
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
    if (module) await module.close();
  });

  // -------------------------------------------------------------------------
  // Validation tests — require PostgreSQL only
  // -------------------------------------------------------------------------

  it("should throw UserNotFoundException for non-existent user", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    await expect(
      onboardingService.completeOnboarding(uuidv4()),
    ).rejects.toThrow(UserNotFoundException);
  });

  it("should throw OnboardingException when user has no Hedera account", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const user = await insertTestUser({
      status: "kyc_submitted",
      hederaAccountId: null,
    });

    await expect(onboardingService.completeOnboarding(user.id)).rejects.toThrow(
      OnboardingException,
    );
  });

  // -------------------------------------------------------------------------
  // Full onboarding flow — requires PostgreSQL + Hedera testnet + DID token
  // -------------------------------------------------------------------------

  it("should complete full onboarding flow on Hedera testnet", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    if (!hasHederaCredentials()) {
      logger.warn(
        "SKIPPED: HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY not configured — " +
          "cannot test full onboarding flow",
      );
      return;
    }

    if (!hasHederaDidTokenId()) {
      logger.warn(
        "SKIPPED: HEDERA_DID_TOKEN_ID not configured — " +
          "cannot mint DID NFT during onboarding",
      );
      return;
    }

    // Use the operator account ID as the user's Hedera account
    // (since the operator has the necessary token associations)
    const operatorId = process.env["HEDERA_OPERATOR_ID"]!;

    const user = await insertTestUser({
      status: "kyc_submitted",
      hederaAccountId: operatorId,
      displayName: "Onboarding Flow Test User",
      bio: "Full onboarding integration test",
      accountType: "individual",
    });

    const result = await onboardingService.completeOnboarding(user.id);

    // Verify the result structure
    expect(result).toBeDefined();
    expect(result.userId).toBe(user.id);
    expect(result.hederaAccountId).toBe(operatorId);
    expect(result.status).toBe("active");

    // DID NFT minted
    expect(result.didNft).toBeDefined();
    expect(typeof result.didNft.serial).toBe("number");
    expect(result.didNft.serial).toBeGreaterThan(0);
    expect(typeof result.didNft.transactionId).toBe("string");
    expect(result.didNft.transactionId.length).toBeGreaterThan(0);
    expect(typeof result.didNft.metadataCid).toBe("string");
    expect(result.didNft.tokenId).toBe(process.env["HEDERA_DID_TOKEN_ID"]);

    // HCS topics created
    expect(result.topics).toBeDefined();
    expect(result.topics.publicFeedTopic).toMatch(/^0\.0\.\d+$/);
    expect(result.topics.notificationTopic).toMatch(/^0\.0\.\d+$/);
    expect(result.topics.publicFeedTopic).not.toBe(
      result.topics.notificationTopic,
    );

    // Verify user record updated in database
    const updatedUser = await userRepository.findOne({
      where: { id: user.id },
    });
    expect(updatedUser).toBeDefined();
    expect(updatedUser!.status).toBe("active");
    expect(updatedUser!.kycLevel).toBe("basic");
    expect(updatedUser!.didNftSerial).toBeDefined();
    expect(Number(updatedUser!.didNftSerial)).toBe(result.didNft.serial);
    expect(updatedUser!.didNftMetadataCid).toBe(result.didNft.metadataCid);
    expect(updatedUser!.publicFeedTopic).toBe(result.topics.publicFeedTopic);
    expect(updatedUser!.notificationTopic).toBe(
      result.topics.notificationTopic,
    );

    logger.log(
      `Onboarding complete: user=${user.id}, ` +
        `DID serial=${result.didNft.serial}, ` +
        `feed topic=${result.topics.publicFeedTopic}, ` +
        `notification topic=${result.topics.notificationTopic}`,
    );
  }, 180_000); // Full flow with multiple Hedera transactions

  // -------------------------------------------------------------------------
  // Partial flow tests — Hedera available but DID token NOT configured
  // -------------------------------------------------------------------------

  it("should fail onboarding when DID token is not configured (no DID_TOKEN_ID)", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    if (!hasHederaCredentials()) {
      logger.warn(
        "SKIPPED: HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY not configured",
      );
      return;
    }

    // Create a module without DID token ID to test the failure path
    const tempModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              hedera: {
                network: "testnet",
                operatorId: process.env["HEDERA_OPERATOR_ID"],
                operatorKey: process.env["HEDERA_OPERATOR_KEY"],
                didTokenId: "", // Intentionally empty
                kycAttestationTopic: "",
              },
              pinata: {
                apiKey: "",
                secretKey: "",
                gatewayUrl: "https://gateway.pinata.cloud/ipfs",
              },
            }),
          ],
        }),
        TypeOrmModule.forRoot({
          type: "postgres",
          host: "localhost",
          port: 5433,
          username: "test",
          password: "test",
          database: "hedera_social_test",
          entities: [UserEntity],
          synchronize: true,
          logging: false,
          name: `temp-${Date.now()}`,
        }),
        TypeOrmModule.forFeature([UserEntity]),
      ],
      providers: [OnboardingService, DidNftService, HederaService, IpfsService],
    }).compile();

    const tempOnboardingService = tempModule.get(OnboardingService);
    const tempUserRepo = tempModule.get(DataSource).getRepository(UserEntity);

    const user = tempUserRepo.create({
      id: uuidv4(),
      email: `onb-no-token-${Date.now()}@integration.test`,
      displayName: "No Token Test User",
      bio: "Should fail without DID token",
      status: "kyc_submitted",
      accountType: "individual",
      hederaAccountId: process.env["HEDERA_OPERATOR_ID"],
    });
    const saved = await tempUserRepo.save(user);

    try {
      await expect(
        tempOnboardingService.completeOnboarding(saved.id),
      ).rejects.toThrow(OnboardingException);
    } finally {
      // Cleanup
      await tempUserRepo.delete(saved.id);
      const tempDS = tempModule.get(DataSource);
      if (tempDS.isInitialized) await tempDS.destroy();
      await tempModule.close();
    }
  }, 60_000);
});
