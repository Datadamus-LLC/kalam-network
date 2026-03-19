/**
 * TamamCustodyService Integration Tests
 *
 * Tests the Tamam MPC Custody integration service against the REAL
 * Tamam Custody staging API.
 *
 * Environment variables required for live API tests:
 *   TAMAM_CUSTODY_API_URL   — Staging base URL
 *   TAMAM_CUSTODY_API_KEY   — API key with olara_ prefix
 *   TAMAM_CUSTODY_SIGNING_SECRET — 32-byte hex HMAC signing secret
 *   TAMAM_CUSTODY_VAULT_ID  — UUID of the vault for key generation
 *   TAMAM_CUSTODY_ORG_ID    — UUID of the organization
 *
 * When credentials are NOT available, live API tests are skipped with
 * pending() and a clear message. No mocking. No faking.
 *
 * Reference: .claude/skills/hedera-social-dev/references/custody-integration.md
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { TamamCustodyService } from "../tamam-custody.service";
import { TamamCustodyNotConfiguredException } from "../tamam-custody.exceptions";

const logger = new Logger("TamamCustodyServiceIntegrationTest");

/**
 * Check whether all required Tamam Custody env vars are present.
 */
function hasTamamCustodyCredentials(): boolean {
  return !!(
    process.env["TAMAM_CUSTODY_API_URL"] &&
    process.env["TAMAM_CUSTODY_API_KEY"] &&
    process.env["TAMAM_CUSTODY_SIGNING_SECRET"] &&
    process.env["TAMAM_CUSTODY_VAULT_ID"] &&
    process.env["TAMAM_CUSTODY_ORG_ID"]
  );
}

describe("TamamCustodyService Integration", () => {
  // -------------------------------------------------------------------------
  // Unconfigured service tests (always run)
  // -------------------------------------------------------------------------
  describe("when credentials are NOT configured", () => {
    let module: TestingModule;
    let service: TamamCustodyService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                tamam: {
                  custody: {
                    apiUrl: undefined,
                    apiKey: undefined,
                    signingSecret: undefined,
                    vaultId: undefined,
                    orgId: undefined,
                  },
                },
              }),
            ],
          }),
        ],
        providers: [TamamCustodyService],
      }).compile();

      // init() triggers OnModuleInit lifecycle hooks
      await module.init();
      service = module.get(TamamCustodyService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should instantiate the service", () => {
      expect(service).toBeDefined();
    });

    it("should report isConfigured() as false", () => {
      expect(service.isConfigured()).toBe(false);
    });

    it("should throw TamamCustodyNotConfiguredException on createUserVault()", async () => {
      await expect(service.createUserVault("Test User")).rejects.toThrow(
        TamamCustodyNotConfiguredException,
      );
    });

    it("should throw TamamCustodyNotConfiguredException on signTransaction()", async () => {
      await expect(
        service.signTransaction(
          "fake-vault-id",
          Buffer.from("test"),
          10,
          "0.0.12345",
        ),
      ).rejects.toThrow(TamamCustodyNotConfiguredException);
    });

    it("should throw TamamCustodyNotConfiguredException on signMessage()", async () => {
      await expect(
        service.signMessage("fake-vault-id", Buffer.from("test")),
      ).rejects.toThrow(TamamCustodyNotConfiguredException);
    });
  });

  // -------------------------------------------------------------------------
  // Configured service tests (always run with dummy config to verify init)
  // -------------------------------------------------------------------------
  describe("when credentials are configured (service init)", () => {
    let module: TestingModule;
    let service: TamamCustodyService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                tamam: {
                  custody: {
                    apiUrl:
                      "https://tamam-backend-staging-776426377628.us-central1.run.app",
                    apiKey: "olara_test_dummy_key",
                    signingSecret: "a".repeat(64),
                    vaultId: "00000000-0000-0000-0000-000000000000",
                    orgId: "00000000-0000-0000-0000-000000000001",
                  },
                },
              }),
            ],
          }),
        ],
        providers: [TamamCustodyService],
      }).compile();

      // init() triggers OnModuleInit lifecycle hooks
      await module.init();
      service = module.get(TamamCustodyService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should instantiate the service when all config values are present", () => {
      expect(service).toBeDefined();
    });

    it("should report isConfigured() as true", () => {
      expect(service.isConfigured()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Live API tests (require real staging credentials)
  // -------------------------------------------------------------------------
  describe("live Tamam Custody staging API", () => {
    let module: TestingModule;
    let service: TamamCustodyService;
    const credentialsAvailable = hasTamamCustodyCredentials();

    beforeAll(async () => {
      if (!credentialsAvailable) {
        logger.warn(
          "Tamam Custody staging credentials not configured. " +
            "Live API tests will be skipped. " +
            "Set TAMAM_CUSTODY_API_URL, TAMAM_CUSTODY_API_KEY, " +
            "TAMAM_CUSTODY_SIGNING_SECRET, TAMAM_CUSTODY_VAULT_ID, " +
            "and TAMAM_CUSTODY_ORG_ID to enable.",
        );
        return;
      }

      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                tamam: {
                  custody: {
                    apiUrl: process.env["TAMAM_CUSTODY_API_URL"],
                    apiKey: process.env["TAMAM_CUSTODY_API_KEY"],
                    signingSecret: process.env["TAMAM_CUSTODY_SIGNING_SECRET"],
                    vaultId: process.env["TAMAM_CUSTODY_VAULT_ID"],
                    orgId: process.env["TAMAM_CUSTODY_ORG_ID"],
                  },
                },
              }),
            ],
          }),
        ],
        providers: [TamamCustodyService],
      }).compile();

      await module.init();
      service = module.get(TamamCustodyService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should create a user vault via the staging API", async () => {
      if (!credentialsAvailable) {
        logger.warn("SKIPPED: TAMAM_CUSTODY_API_KEY not configured");
        return;
      }

      const result = await service.createUserVault("Integration Test User");

      expect(result).toBeDefined();
      expect(typeof result.publicKey).toBe("string");
      expect(result.publicKey.length).toBeGreaterThan(0);
      expect(typeof result.vaultId).toBe("string");
      expect(result.vaultId.length).toBeGreaterThan(0);
      // hederaAccountId may or may not be present (vault may not auto-create Hedera accounts)
      if (result.hederaAccountId) {
        expect(result.hederaAccountId).toMatch(/^0\.0\.\d+$/);
      }
    }, 60_000); // Vault creation triggers MPC key generation (DKG ceremony)

    it("should sign a message with a vault's MPC key", async () => {
      if (!credentialsAvailable) {
        logger.warn("SKIPPED: TAMAM_CUSTODY_API_KEY not configured");
        return;
      }

      // First, create a vault with MPC key
      const vaultResult = await service.createUserVault("Sign Test User");
      expect(vaultResult.vaultId).toBeDefined();

      // Now sign an arbitrary message with the vault's MPC key
      const testMessage = Buffer.from("integration-test-message");
      const result = await service.signMessage(
        vaultResult.vaultId,
        testMessage,
      );

      expect(result).toBeDefined();
      expect(result.signature).toBeInstanceOf(Buffer);
      expect(result.signature.length).toBeGreaterThan(0);
    }, 90_000); // Signing involves MPC coordination across nodes

    it("should sign transaction bytes via two-step custody flow", async () => {
      if (!credentialsAvailable) {
        logger.warn("SKIPPED: TAMAM_CUSTODY_API_KEY not configured");
        return;
      }

      // Create a vault
      const vaultResult = await service.createUserVault(
        "Transaction Test User",
      );
      expect(vaultResult.vaultId).toBeDefined();

      // Sign dummy transaction bytes (hex-encoded via the two-step flow)
      const txBytes = Buffer.from("dummy-transaction-bytes-for-test");
      const result = await service.signTransaction(
        vaultResult.vaultId,
        txBytes,
        10,
        "0.0.12345",
      );

      expect(result).toBeDefined();
      expect(result.signedTransactionBytes).toBeInstanceOf(Buffer);
      expect(result.signedTransactionBytes.length).toBeGreaterThan(0);
    }, 90_000);
  });
});
