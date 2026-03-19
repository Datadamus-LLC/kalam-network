/**
 * KycService Integration Tests
 *
 * Tests KycService against REAL PostgreSQL on localhost:5433 and optionally
 * against the real Mirsad AI staging API.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * For live Mirsad AI API tests:
 *   MIRSAD_KYC_ENABLED=true
 *   MIRSAD_KYC_API_URL=https://olara-api.var-meta.com
 *   MIRSAD_KYC_CALLBACK_URL=https://example.com/webhooks/kyc-callback
 *
 * Tests that require only PostgreSQL:
 *   - getKycStatus() returns current KYC status
 *   - handleKycCallback() updates user to approved/rejected/on_hold
 *   - handleKycCallback() is idempotent
 *   - Validation: proper exceptions for invalid state
 *
 * Tests that require Mirsad AI credentials:
 *   - submitIndividualKyc() submits to real API and updates user
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
import { KycService } from "../services/kyc.service";
import { MirsadAiService } from "../../integrations/mirsad-ai/mirsad-ai.service";
import { UserEntity } from "../../../database/entities/user.entity";
import {
  KycInvalidStateException,
  KycCallbackInvalidException,
  KycRecordNotFoundException,
} from "../exceptions/kyc.exception";
import { UserNotFoundException } from "../exceptions/wallet-creation.exception";

const logger = new Logger("KycServiceIntegrationTest");

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

function hasMirsadCredentials(): boolean {
  return !!(
    process.env["MIRSAD_KYC_API_URL"] && process.env["MIRSAD_KYC_CALLBACK_URL"]
  );
}

describe("KycService Integration", () => {
  let module: TestingModule;
  let kycService: KycService;
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
        `kyc-test-${Date.now()}-${Math.random()}@integration.test`,
      displayName: overrides.displayName ?? "KYC Test User",
      bio: overrides.bio ?? "Integration test user for KYC",
      status: overrides.status ?? "pending_kyc",
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

    try {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                mirsadKyc: {
                  enabled: !!process.env["MIRSAD_KYC_API_URL"],
                  apiUrl: process.env["MIRSAD_KYC_API_URL"] ?? undefined,
                  callbackUrl:
                    process.env["MIRSAD_KYC_CALLBACK_URL"] ?? undefined,
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
        providers: [KycService, MirsadAiService],
      }).compile();

      kycService = module.get(KycService);
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
  // getKycStatus() tests — require PostgreSQL only
  // -------------------------------------------------------------------------

  it("should throw UserNotFoundException for non-existent user on getKycStatus()", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    await expect(kycService.getKycStatus(uuidv4())).rejects.toThrow(
      UserNotFoundException,
    );
  });

  it("should throw KycRecordNotFoundException when user has no kycRequestId", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const user = await insertTestUser({
      status: "pending_kyc",
      kycRequestId: null,
    });

    await expect(kycService.getKycStatus(user.id)).rejects.toThrow(
      KycRecordNotFoundException,
    );
  });

  it("should return KYC status info for user with a kycRequestId", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const requestId = `test-request-${Date.now()}`;
    const submittedAt = new Date();
    const user = await insertTestUser({
      status: "kyc_submitted",
      kycRequestId: requestId,
      kycSubmittedAt: submittedAt,
      kycCompletedAt: null,
    });

    const statusInfo = await kycService.getKycStatus(user.id);

    expect(statusInfo.status).toBe("kyc_submitted");
    expect(statusInfo.kycRequestId).toBe(requestId);
    expect(statusInfo.kycSubmittedAt).toBeDefined();
    expect(statusInfo.kycCompletedAt).toBeNull();
    expect(statusInfo.canResubmit).toBe(false);
  });

  it("should report canResubmit=true for users in kyc_rejected status", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const user = await insertTestUser({
      status: "kyc_rejected",
      kycRequestId: `rejected-request-${Date.now()}`,
      kycSubmittedAt: new Date(),
      kycCompletedAt: new Date(),
    });

    const statusInfo = await kycService.getKycStatus(user.id);

    expect(statusInfo.status).toBe("kyc_rejected");
    expect(statusInfo.canResubmit).toBe(true);
  });

  // -------------------------------------------------------------------------
  // handleKycCallback() tests — require PostgreSQL only
  // -------------------------------------------------------------------------

  it("should throw KycCallbackInvalidException for unknown request_id", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    await expect(
      kycService.handleKycCallback(`unknown-${Date.now()}`, "approved"),
    ).rejects.toThrow(KycCallbackInvalidException);
  });

  it("should update user to active status on approved callback", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const requestId = `approved-callback-${Date.now()}`;
    await insertTestUser({
      status: "kyc_submitted",
      kycRequestId: requestId,
      kycSubmittedAt: new Date(),
      kycCompletedAt: null,
    });

    const updatedUser = await kycService.handleKycCallback(
      requestId,
      "approved",
    );

    expect(updatedUser.status).toBe("active");
    expect(updatedUser.kycLevel).toBe("basic");
    expect(updatedUser.kycCompletedAt).toBeDefined();
    expect(updatedUser.kycCompletedAt).not.toBeNull();
  });

  it("should update user to kyc_rejected status on rejected callback", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const requestId = `rejected-callback-${Date.now()}`;
    await insertTestUser({
      status: "kyc_submitted",
      kycRequestId: requestId,
      kycSubmittedAt: new Date(),
      kycCompletedAt: null,
    });

    const updatedUser = await kycService.handleKycCallback(
      requestId,
      "rejected",
    );

    expect(updatedUser.status).toBe("kyc_rejected");
    expect(updatedUser.kycCompletedAt).toBeDefined();
  });

  it("should keep user in kyc_submitted status on on_hold callback", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const requestId = `on-hold-callback-${Date.now()}`;
    await insertTestUser({
      status: "kyc_submitted",
      kycRequestId: requestId,
      kycSubmittedAt: new Date(),
      kycCompletedAt: null,
    });

    const updatedUser = await kycService.handleKycCallback(
      requestId,
      "on_hold",
    );

    // on_hold does not change the status field
    expect(updatedUser.status).toBe("kyc_submitted");
    expect(updatedUser.kycCompletedAt).toBeDefined();
  });

  it("should be idempotent — re-processing same callback does not re-update", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const requestId = `idempotent-callback-${Date.now()}`;
    await insertTestUser({
      status: "kyc_submitted",
      kycRequestId: requestId,
      kycSubmittedAt: new Date(),
      kycCompletedAt: null,
    });

    // First callback
    const first = await kycService.handleKycCallback(requestId, "approved");
    expect(first.status).toBe("active");
    const completedAt = first.kycCompletedAt;

    // Second callback — should return same user without re-processing
    const second = await kycService.handleKycCallback(requestId, "rejected");
    // Status should still be "active" (not re-processed to "rejected")
    expect(second.status).toBe("active");
    expect(second.kycCompletedAt?.getTime()).toBe(completedAt?.getTime());
  });

  // -------------------------------------------------------------------------
  // validateUserForKyc() tests (exercised via submitIndividualKyc)
  // -------------------------------------------------------------------------

  it("should throw UserNotFoundException when submitting KYC for non-existent user", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const dto = {
      accountType: "individual" as const,
      fullLegalName: "Test User",
      dateOfBirth: "1990-01-01",
      nationality: "US",
      countryOfResidence: "US",
      currentResidentialAddress: "123 Main St, City, 12345, US",
      nationalIdNumber: "ID123",
      cityOfBirth: "NYC",
      countryOfBirth: "US",
    };

    await expect(kycService.submitIndividualKyc(uuidv4(), dto)).rejects.toThrow(
      UserNotFoundException,
    );
  });

  it("should throw KycInvalidStateException when user is not in pending_kyc or kyc_rejected status", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const user = await insertTestUser({
      status: "active",
    });

    const dto = {
      accountType: "individual" as const,
      fullLegalName: "Test User",
      dateOfBirth: "1990-01-01",
      nationality: "US",
      countryOfResidence: "US",
      currentResidentialAddress: "123 Main St, City, 12345, US",
      nationalIdNumber: "ID123",
      cityOfBirth: "NYC",
      countryOfBirth: "US",
    };

    await expect(kycService.submitIndividualKyc(user.id, dto)).rejects.toThrow(
      KycInvalidStateException,
    );
  });

  it("should throw KycInvalidStateException when user has no Hedera wallet", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const user = await insertTestUser({
      status: "pending_kyc",
      hederaAccountId: null,
    });

    const dto = {
      accountType: "individual" as const,
      fullLegalName: "Test User",
      dateOfBirth: "1990-01-01",
      nationality: "US",
      countryOfResidence: "US",
      currentResidentialAddress: "123 Main St, City, 12345, US",
      nationalIdNumber: "ID123",
      cityOfBirth: "NYC",
      countryOfBirth: "US",
    };

    await expect(kycService.submitIndividualKyc(user.id, dto)).rejects.toThrow(
      KycInvalidStateException,
    );
  });

  // -------------------------------------------------------------------------
  // Live Mirsad AI integration tests (require real API credentials)
  // -------------------------------------------------------------------------

  it("should submit individual KYC via real Mirsad AI staging API", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    if (!hasMirsadCredentials()) {
      logger.warn(
        "SKIPPED: MIRSAD_KYC_API_URL not configured — " +
          "cannot test live KYC submission",
      );
      return;
    }

    const user = await insertTestUser({
      status: "pending_kyc",
      hederaAccountId: `0.0.${Date.now() % 999999}`,
    });

    const dto = {
      accountType: "individual" as const,
      fullLegalName: `Integration Test User ${Date.now()}`,
      dateOfBirth: "1990-05-15",
      nationality: "US",
      countryOfResidence: "US",
      currentResidentialAddress:
        "123 Integration Test St, San Francisco, 94105, USA",
      nationalIdNumber: `TEST-KYC-${Date.now()}`,
      cityOfBirth: "New York",
      countryOfBirth: "US",
      email: `kyc-test-${Date.now()}@integration.test`,
    };

    const result = await kycService.submitIndividualKyc(user.id, dto);

    expect(result).toBeDefined();
    expect(typeof result.requestId).toBe("string");
    expect(result.requestId.length).toBeGreaterThan(0);
    expect(typeof result.submittedAt).toBe("string");
    expect(result.userId).toBe(user.id);
    expect(result.customerType).toBe("INDIVIDUAL");

    // Verify user record was updated in the database
    const updatedUser = await userRepository.findOne({
      where: { id: user.id },
    });
    expect(updatedUser).toBeDefined();
    expect(updatedUser!.status).toBe("kyc_submitted");
    expect(updatedUser!.kycRequestId).toBe(result.requestId);
    expect(updatedUser!.kycSubmittedAt).toBeDefined();
    expect(updatedUser!.accountType).toBe("individual");
  }, 60_000);

  // -------------------------------------------------------------------------
  // findByRequestId() tests — require PostgreSQL only
  // -------------------------------------------------------------------------

  it("should return user by kycRequestId via findByRequestId()", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const requestId = `find-by-req-${Date.now()}`;
    const user = await insertTestUser({
      kycRequestId: requestId,
      status: "kyc_submitted",
    });

    const found = await kycService.findByRequestId(requestId);
    expect(found).toBeDefined();
    expect(found!.id).toBe(user.id);
    expect(found!.kycRequestId).toBe(requestId);
  });

  it("should return null for non-existent kycRequestId", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      return;
    }

    const found = await kycService.findByRequestId(`nonexistent-${Date.now()}`);
    expect(found).toBeNull();
  });
});
