/**
 * WalletService Extended Integration Tests
 *
 * Tests WalletService against REAL PostgreSQL on localhost:5433.
 *
 * Prerequisites:
 *   docker compose -f docker-compose.test.yml up -d
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 * All operations run against a real PostgreSQL instance.
 *
 * Note: WalletService depends on HederaService and TamamCustodyService.
 * Tests that only exercise database-level logic (createWallet validation,
 * getWalletStatus) configure the module with the real services but skip
 * test scenarios that would invoke Hedera testnet or Tamam Custody API.
 * HederaService gracefully handles missing credentials (warns, does not
 * throw on construction). TamamCustodyService.isConfigured() returns false
 * when env vars are absent, which we exercise in the custody-not-configured test.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { DataSource, Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";
import net from "net";
import { WalletService } from "../services/wallet.service";
import { HederaService } from "../../hedera/hedera.service";
import { TamamCustodyService } from "../../integrations/tamam-custody/tamam-custody.service";
import { UserEntity } from "../../../database/entities/user.entity";
import {
  UserNotFoundException,
  WalletAlreadyExistsException,
} from "../exceptions/wallet-creation.exception";
import { CustodyNotConfiguredException } from "../exceptions/custody-api.exception";

const logger = new Logger("WalletServiceExtendedIntegrationTest");

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

describe("WalletService Extended Integration", () => {
  let module: TestingModule;
  let walletService: WalletService;
  let dataSource: DataSource;
  let userRepository: Repository<UserEntity>;
  let postgresAvailable: boolean;

  // Track created entities for cleanup
  const createdUserIds: string[] = [];

  /**
   * Helper to insert a test user directly into the database.
   * Bypasses other services to avoid coupling test setup.
   */
  async function insertTestUser(
    overrides: Partial<UserEntity> = {},
  ): Promise<UserEntity> {
    const id = overrides.id ?? uuidv4();
    const user = userRepository.create({
      id,
      email:
        overrides.email ??
        `wallet-ext-test-${Date.now()}-${Math.random()}@integration.test`,
      phone: overrides.phone ?? null,
      displayName: overrides.displayName ?? "Wallet Test User",
      bio: overrides.bio ?? "Integration test user for wallet service",
      status: overrides.status ?? "registered",
      accountType: overrides.accountType ?? "individual",
      hederaAccountId: overrides.hederaAccountId ?? null,
      publicKey: overrides.publicKey ?? null,
      keyId: overrides.keyId ?? null,
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

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              hedera: {
                network: "testnet",
                operatorId: "",
                operatorKey: "",
                didTokenId: "",
              },
              tamam: {
                custody: {
                  apiUrl: "",
                  apiKey: "",
                  signingSecret: "",
                  vaultId: "",
                  orgId: "",
                },
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
      providers: [WalletService, HederaService, TamamCustodyService],
    }).compile();

    walletService = module.get(WalletService);
    dataSource = module.get(DataSource);
    userRepository = dataSource.getRepository(UserEntity);
  });

  afterEach(async () => {
    if (!postgresAvailable) return;

    // Clean up users created during test
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

  // ---------------------------------------------------------------------------
  // createWallet — validation paths (DB-only, no external service calls)
  // ---------------------------------------------------------------------------

  it("should throw UserNotFoundException when user does not exist", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const nonExistentId = uuidv4();
    await expect(walletService.createWallet(nonExistentId)).rejects.toThrow(
      UserNotFoundException,
    );
  });

  it("should throw WalletAlreadyExistsException when user already has hederaAccountId", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const existingAccountId = `0.0.${Date.now() % 999999}`;
    const user = await insertTestUser({
      hederaAccountId: existingAccountId,
      publicKey: "302a300506032b6570032100abcdef1234567890",
      status: "pending_kyc",
    });

    await expect(walletService.createWallet(user.id)).rejects.toThrow(
      WalletAlreadyExistsException,
    );
  });

  it("should throw CustodyNotConfiguredException when TAMAM_CUSTODY vars are empty", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    // User exists and has no wallet, but custody is not configured
    // (all tamam.custody.* config values are empty strings in test config)
    const user = await insertTestUser({
      hederaAccountId: null,
      status: "registered",
    });

    await expect(walletService.createWallet(user.id)).rejects.toThrow(
      CustodyNotConfiguredException,
    );
  });

  // ---------------------------------------------------------------------------
  // getWalletStatus — DB-level queries
  // ---------------------------------------------------------------------------

  it("should return wallet status for a user with a wallet (hederaAccountId set)", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const hederaAccountId = `0.0.${Date.now() % 999999}`;
    const publicKey = "302a300506032b6570032100aabbccdd11223344";
    const user = await insertTestUser({
      hederaAccountId,
      publicKey,
      status: "pending_kyc",
    });

    const status = await walletService.getWalletStatus(user.id);

    expect(status.userId).toBe(user.id);
    expect(status.hederaAccountId).toBe(hederaAccountId);
    expect(status.publicKey).toBe(publicKey);
    expect(status.hasWallet).toBe(true);
    expect(status.status).toBe("pending_kyc");
  });

  it("should return wallet status for a user without a wallet (hederaAccountId null)", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const user = await insertTestUser({
      hederaAccountId: null,
      publicKey: null,
      status: "registered",
    });

    const status = await walletService.getWalletStatus(user.id);

    expect(status.userId).toBe(user.id);
    expect(status.hederaAccountId).toBeNull();
    expect(status.publicKey).toBeNull();
    expect(status.hasWallet).toBe(false);
    expect(status.status).toBe("registered");
  });

  it("should throw UserNotFoundException on getWalletStatus for non-existent user", async () => {
    if (!postgresAvailable) {
      logger.warn("SKIPPED: PostgreSQL not available");
      pending();
      return;
    }

    const nonExistentId = uuidv4();
    await expect(walletService.getWalletStatus(nonExistentId)).rejects.toThrow(
      UserNotFoundException,
    );
  });
});
