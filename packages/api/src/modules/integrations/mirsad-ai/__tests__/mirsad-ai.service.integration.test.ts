/**
 * MirsadAiService Integration Tests
 *
 * Tests the Mirsad AI KYC/AML service against the REAL staging API.
 *
 * Environment variables required for live API tests:
 *   MIRSAD_KYC_ENABLED=true
 *   MIRSAD_KYC_API_URL      — Staging: https://olara-api.var-meta.com
 *   MIRSAD_KYC_CALLBACK_URL — Callback URL (can be any HTTPS URL for test)
 *
 * When credentials are NOT available, live API tests are skipped with
 * a clear warning message and early return. No mocking. No faking.
 *
 * Reference: .claude/skills/hedera-social-dev/references/mirsad-ai-integration.md
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { MirsadAiService } from "../mirsad-ai.service";
import {
  MirsadNotConfiguredException,
  MirsadDisabledException,
  MirsadValidationException,
  MirsadNotImplementedException,
} from "../mirsad-ai.exceptions";

const logger = new Logger("MirsadAiServiceIntegrationTest");

/**
 * Check whether all required Mirsad AI env vars are present.
 */
function hasMirsadCredentials(): boolean {
  return !!(
    process.env["MIRSAD_KYC_API_URL"] && process.env["MIRSAD_KYC_CALLBACK_URL"]
  );
}

describe("MirsadAiService Integration", () => {
  // -------------------------------------------------------------------------
  // Disabled service tests (always run)
  // -------------------------------------------------------------------------
  describe("when service is disabled (MIRSAD_KYC_ENABLED=false)", () => {
    let module: TestingModule;
    let service: MirsadAiService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                mirsadKyc: {
                  enabled: false,
                  apiUrl: undefined,
                  callbackUrl: undefined,
                },
              }),
            ],
          }),
        ],
        providers: [MirsadAiService],
      }).compile();

      await module.init();
      service = module.get(MirsadAiService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should instantiate the service", () => {
      expect(service).toBeDefined();
    });

    it("should report isConfigured() as false when disabled", () => {
      expect(service.isConfigured()).toBe(false);
    });

    it("should throw MirsadDisabledException on submitIndividualOnboarding()", async () => {
      const dummyData = {
        identity_info: {
          full_legal_name: "Test User",
          date_of_birth: "1990-01-01",
          nationality: "US",
          country_of_residence: "US",
          current_residential_address: "123 Main St, City, 12345, US",
          national_id_number: "ID123456",
        },
      };

      await expect(
        service.submitIndividualOnboarding("test-user-id", dummyData),
      ).rejects.toThrow(MirsadDisabledException);
    });

    it("should throw MirsadDisabledException on submitCorporateOnboarding()", async () => {
      const dummyData = {
        entity_info: {
          legal_entity_name: "Test Corp",
          country_of_incorporation: "US",
          business_registration_number: "BRN123",
          business_address: "456 Corp Ave, City, 67890, US",
        },
      };

      await expect(
        service.submitCorporateOnboarding("test-user-id", dummyData),
      ).rejects.toThrow(MirsadDisabledException);
    });

    it("should throw MirsadDisabledException on submitTransactionScoring()", async () => {
      const dummyTx = {
        transaction_type: "p2p" as const,
        amount: 100,
        currency_input: "HBAR",
        source_address: "0.0.123456",
        destination_address: "0.0.789012",
        beneficiary: {
          full_legal_name: "John Smith",
        },
      };

      await expect(
        service.submitTransactionScoring("test-user-id", "INDIVIDUAL", dummyTx),
      ).rejects.toThrow(MirsadDisabledException);
    });
  });

  // -------------------------------------------------------------------------
  // Enabled but not configured (missing URLs)
  // -------------------------------------------------------------------------
  describe("when enabled but URLs not configured", () => {
    let module: TestingModule;
    let service: MirsadAiService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                mirsadKyc: {
                  enabled: true,
                  apiUrl: undefined,
                  callbackUrl: undefined,
                },
              }),
            ],
          }),
        ],
        providers: [MirsadAiService],
      }).compile();

      await module.init();
      service = module.get(MirsadAiService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should report isConfigured() as false", () => {
      expect(service.isConfigured()).toBe(false);
    });

    it("should throw MirsadNotConfiguredException on submitIndividualOnboarding()", async () => {
      const dummyData = {
        identity_info: {
          full_legal_name: "Test User",
          date_of_birth: "1990-01-01",
          nationality: "US",
          country_of_residence: "US",
          current_residential_address: "123 Main St, City, 12345, US",
          national_id_number: "ID123456",
        },
      };

      await expect(
        service.submitIndividualOnboarding("test-user-id", dummyData),
      ).rejects.toThrow(MirsadNotConfiguredException);
    });
  });

  // -------------------------------------------------------------------------
  // Fully configured service init (always run with dummy config)
  // -------------------------------------------------------------------------
  describe("when fully configured (service init)", () => {
    let module: TestingModule;
    let service: MirsadAiService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                mirsadKyc: {
                  enabled: true,
                  apiUrl: "https://olara-api.var-meta.com",
                  callbackUrl: "https://example.com/webhooks/kyc-callback",
                },
              }),
            ],
          }),
        ],
        providers: [MirsadAiService],
      }).compile();

      await module.init();
      service = module.get(MirsadAiService);
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

    it("should throw MirsadNotImplementedException on checkKycStatus()", async () => {
      await expect(service.checkKycStatus("any-request-id")).rejects.toThrow(
        MirsadNotImplementedException,
      );
    });
  });

  // -------------------------------------------------------------------------
  // Validation tests (always run — no API calls needed)
  // -------------------------------------------------------------------------
  describe("input validation", () => {
    let module: TestingModule;
    let service: MirsadAiService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                mirsadKyc: {
                  enabled: true,
                  apiUrl: "https://olara-api.var-meta.com",
                  callbackUrl: "https://example.com/webhooks/kyc-callback",
                },
              }),
            ],
          }),
        ],
        providers: [MirsadAiService],
      }).compile();

      await module.init();
      service = module.get(MirsadAiService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should throw MirsadValidationException when individual data missing full_legal_name", async () => {
      const invalidData = {
        identity_info: {
          full_legal_name: "",
          date_of_birth: "1990-01-01",
          nationality: "US",
          country_of_residence: "US",
          current_residential_address: "123 Main St, City, 12345, US",
          national_id_number: "ID123456",
        },
      };

      await expect(
        service.submitIndividualOnboarding("test-user", invalidData),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw MirsadValidationException when individual data missing date_of_birth", async () => {
      const invalidData = {
        identity_info: {
          full_legal_name: "Test User",
          date_of_birth: "",
          nationality: "US",
          country_of_residence: "US",
          current_residential_address: "123 Main St, City, 12345, US",
          national_id_number: "ID123456",
        },
      };

      await expect(
        service.submitIndividualOnboarding("test-user", invalidData),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw MirsadValidationException when individual data missing nationality", async () => {
      const invalidData = {
        identity_info: {
          full_legal_name: "Test User",
          date_of_birth: "1990-01-01",
          nationality: "",
          country_of_residence: "US",
          current_residential_address: "123 Main St, City, 12345, US",
          national_id_number: "ID123456",
        },
      };

      await expect(
        service.submitIndividualOnboarding("test-user", invalidData),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw MirsadValidationException when corporate data missing legal_entity_name", async () => {
      const invalidData = {
        entity_info: {
          legal_entity_name: "",
          country_of_incorporation: "US",
          business_registration_number: "BRN123",
          business_address: "456 Corp Ave, City, 67890, US",
        },
      };

      await expect(
        service.submitCorporateOnboarding("test-user", invalidData),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw MirsadValidationException when transaction data missing amount", async () => {
      const invalidTx = {
        transaction_type: "p2p" as const,
        amount: undefined as unknown as number,
        currency_input: "HBAR",
        source_address: "0.0.123456",
        destination_address: "0.0.789012",
        beneficiary: {
          full_legal_name: "John Smith",
        },
      };

      await expect(
        service.submitTransactionScoring("test-user", "INDIVIDUAL", invalidTx),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw MirsadValidationException via submitKyc() when individual data is missing", async () => {
      await expect(
        service.submitKyc({
          customer_type: "INDIVIDUAL",
          userId: "test-user",
          individual: undefined,
        }),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw MirsadValidationException via submitKyc() when corporate data is missing", async () => {
      await expect(
        service.submitKyc({
          customer_type: "CORPORATE",
          userId: "test-user",
          corporate: undefined,
        }),
      ).rejects.toThrow(MirsadValidationException);
    });

    // -----------------------------------------------------------------------
    // Individual validation — remaining required fields
    // -----------------------------------------------------------------------

    it("should throw when individual data missing country_of_residence", async () => {
      const data = {
        identity_info: {
          full_legal_name: "Test User",
          date_of_birth: "1990-01-01",
          nationality: "US",
          country_of_residence: "",
          current_residential_address: "123 Main St, City, 12345, US",
          national_id_number: "ID123456",
        },
      };
      await expect(
        service.submitIndividualOnboarding("test-user", data),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when individual data missing current_residential_address", async () => {
      const data = {
        identity_info: {
          full_legal_name: "Test User",
          date_of_birth: "1990-01-01",
          nationality: "US",
          country_of_residence: "US",
          current_residential_address: "",
          national_id_number: "ID123456",
        },
      };
      await expect(
        service.submitIndividualOnboarding("test-user", data),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when individual data missing national_id_number", async () => {
      const data = {
        identity_info: {
          full_legal_name: "Test User",
          date_of_birth: "1990-01-01",
          nationality: "US",
          country_of_residence: "US",
          current_residential_address: "123 Main St, City, 12345, US",
          national_id_number: "",
        },
      };
      await expect(
        service.submitIndividualOnboarding("test-user", data),
      ).rejects.toThrow(MirsadValidationException);
    });

    // -----------------------------------------------------------------------
    // Corporate validation — remaining required fields
    // -----------------------------------------------------------------------

    it("should throw when corporate data missing country_of_incorporation", async () => {
      const data = {
        entity_info: {
          legal_entity_name: "Test Corp",
          country_of_incorporation: "",
          business_registration_number: "BRN123",
          business_address: "456 Corp Ave, City, 67890, US",
        },
      };
      await expect(
        service.submitCorporateOnboarding("test-user", data),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when corporate data missing business_registration_number", async () => {
      const data = {
        entity_info: {
          legal_entity_name: "Test Corp",
          country_of_incorporation: "US",
          business_registration_number: "",
          business_address: "456 Corp Ave, City, 67890, US",
        },
      };
      await expect(
        service.submitCorporateOnboarding("test-user", data),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when corporate data missing business_address", async () => {
      const data = {
        entity_info: {
          legal_entity_name: "Test Corp",
          country_of_incorporation: "US",
          business_registration_number: "BRN123",
          business_address: "",
        },
      };
      await expect(
        service.submitCorporateOnboarding("test-user", data),
      ).rejects.toThrow(MirsadValidationException);
    });

    // -----------------------------------------------------------------------
    // Transaction validation — remaining required fields
    // -----------------------------------------------------------------------

    it("should throw when transaction data missing transaction_type", async () => {
      const tx = {
        transaction_type: "" as "p2p",
        amount: 100,
        currency_input: "HBAR",
        source_address: "0.0.123456",
        destination_address: "0.0.789012",
        beneficiary: { full_legal_name: "John Smith" },
      };
      await expect(
        service.submitTransactionScoring("test-user", "INDIVIDUAL", tx),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when transaction data missing currency_input", async () => {
      const tx = {
        transaction_type: "p2p" as const,
        amount: 100,
        currency_input: "",
        source_address: "0.0.123456",
        destination_address: "0.0.789012",
        beneficiary: { full_legal_name: "John Smith" },
      };
      await expect(
        service.submitTransactionScoring("test-user", "INDIVIDUAL", tx),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when transaction data missing source_address", async () => {
      const tx = {
        transaction_type: "p2p" as const,
        amount: 100,
        currency_input: "HBAR",
        source_address: "",
        destination_address: "0.0.789012",
        beneficiary: { full_legal_name: "John Smith" },
      };
      await expect(
        service.submitTransactionScoring("test-user", "INDIVIDUAL", tx),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when transaction data missing destination_address", async () => {
      const tx = {
        transaction_type: "p2p" as const,
        amount: 100,
        currency_input: "HBAR",
        source_address: "0.0.123456",
        destination_address: "",
        beneficiary: { full_legal_name: "John Smith" },
      };
      await expect(
        service.submitTransactionScoring("test-user", "INDIVIDUAL", tx),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when transaction data missing beneficiary", async () => {
      const tx = {
        transaction_type: "p2p" as const,
        amount: 100,
        currency_input: "HBAR",
        source_address: "0.0.123456",
        destination_address: "0.0.789012",
        beneficiary: undefined as unknown as { full_legal_name: string },
      };
      await expect(
        service.submitTransactionScoring("test-user", "INDIVIDUAL", tx),
      ).rejects.toThrow(MirsadValidationException);
    });

    it("should throw when transaction data amount is null", async () => {
      const tx = {
        transaction_type: "p2p" as const,
        amount: null as unknown as number,
        currency_input: "HBAR",
        source_address: "0.0.123456",
        destination_address: "0.0.789012",
        beneficiary: { full_legal_name: "John Smith" },
      };
      await expect(
        service.submitTransactionScoring("test-user", "INDIVIDUAL", tx),
      ).rejects.toThrow(MirsadValidationException);
    });
  });

  // -------------------------------------------------------------------------
  // Config: enabled with apiUrl but missing callbackUrl
  // -------------------------------------------------------------------------
  describe("when enabled with apiUrl but missing callbackUrl", () => {
    let module: TestingModule;
    let service: MirsadAiService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                mirsadKyc: {
                  enabled: true,
                  apiUrl: "https://olara-api.var-meta.com",
                  callbackUrl: undefined,
                },
              }),
            ],
          }),
        ],
        providers: [MirsadAiService],
      }).compile();

      await module.init();
      service = module.get(MirsadAiService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should report isConfigured() as false when callbackUrl is missing", () => {
      expect(service.isConfigured()).toBe(false);
    });

    it("should throw MirsadNotConfiguredException when callbackUrl is missing", async () => {
      const dummyData = {
        identity_info: {
          full_legal_name: "Test User",
          date_of_birth: "1990-01-01",
          nationality: "US",
          country_of_residence: "US",
          current_residential_address: "123 Main St, City, 12345, US",
          national_id_number: "ID123456",
        },
      };
      await expect(
        service.submitIndividualOnboarding("test-user", dummyData),
      ).rejects.toThrow(MirsadNotConfiguredException);
    });
  });

  // -------------------------------------------------------------------------
  // Live API tests (require real staging credentials)
  // -------------------------------------------------------------------------
  describe("live Mirsad AI staging API", () => {
    let module: TestingModule;
    let service: MirsadAiService;
    const credentialsAvailable = hasMirsadCredentials();

    beforeAll(async () => {
      if (!credentialsAvailable) {
        logger.warn(
          "Mirsad AI staging credentials not configured. " +
            "Live API tests will be skipped. " +
            "Set MIRSAD_KYC_API_URL and MIRSAD_KYC_CALLBACK_URL to enable.",
        );
        return;
      }

      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                mirsadKyc: {
                  enabled: true,
                  apiUrl: process.env["MIRSAD_KYC_API_URL"],
                  callbackUrl: process.env["MIRSAD_KYC_CALLBACK_URL"],
                },
              }),
            ],
          }),
        ],
        providers: [MirsadAiService],
      }).compile();

      await module.init();
      service = module.get(MirsadAiService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should submit individual KYC onboarding to staging API", async () => {
      if (!credentialsAvailable) {
        logger.warn("SKIPPED: MIRSAD_KYC_API_URL not configured");
        return;
      }

      const testData = {
        identity_info: {
          full_legal_name: "Integration Test User",
          date_of_birth: "1990-05-15",
          nationality: "US",
          country_of_residence: "US",
          current_residential_address:
            "123 Integration Test St, San Francisco, 94105, USA",
          national_id_number: `TEST-${Date.now()}`,
          city_of_birth: "New York",
          country_of_birth: "US",
          email: `test-${Date.now()}@integration.test`,
          phone_number: "+14155559999",
          occupation: "Software Engineer",
        },
      };

      const result = await service.submitIndividualOnboarding(
        `test-user-${Date.now()}`,
        testData,
      );

      expect(result).toBeDefined();
      expect(typeof result.request_id).toBe("string");
      expect(result.request_id.length).toBeGreaterThan(0);
      expect(typeof result.submitted_at).toBe("string");
      expect(result.submitted_at.length).toBeGreaterThan(0);
    }, 60_000); // Allow time for staging API response

    it("should submit corporate KYC onboarding to staging API", async () => {
      if (!credentialsAvailable) {
        logger.warn("SKIPPED: MIRSAD_KYC_API_URL not configured");
        return;
      }

      const testData = {
        entity_info: {
          legal_entity_name: `Integration Test Corp ${Date.now()}`,
          country_of_incorporation: "US",
          business_registration_number: `BRN-TEST-${Date.now()}`,
          business_address: "456 Corp Test Ave, San Francisco, 94105, USA",
          primary_activity_description: "Integration testing",
          email: `corp-test-${Date.now()}@integration.test`,
        },
      };

      const result = await service.submitCorporateOnboarding(
        `test-corp-user-${Date.now()}`,
        testData,
      );

      expect(result).toBeDefined();
      expect(typeof result.request_id).toBe("string");
      expect(result.request_id.length).toBeGreaterThan(0);
      expect(typeof result.submitted_at).toBe("string");
    }, 60_000);

    it("should submit transaction scoring to staging API", async () => {
      if (!credentialsAvailable) {
        logger.warn("SKIPPED: MIRSAD_KYC_API_URL not configured");
        return;
      }

      const testTx = {
        transaction_type: "p2p" as const,
        amount: 100,
        currency_input: "HBAR",
        source_address: "0.0.123456",
        destination_address: "0.0.789012",
        blockchain_type: "HEDERA" as const,
        purpose_of_transaction: "Integration test payment",
        is_on_chain: true,
        beneficiary: {
          full_legal_name: "Integration Test Beneficiary",
          relationship: "test",
        },
      };

      const result = await service.submitTransactionScoring(
        `test-tx-user-${Date.now()}`,
        "INDIVIDUAL",
        testTx,
      );

      expect(result).toBeDefined();
      expect(typeof result.request_id).toBe("string");
      expect(result.request_id.length).toBeGreaterThan(0);
      expect(typeof result.submitted_at).toBe("string");
    }, 60_000);
  });
});
