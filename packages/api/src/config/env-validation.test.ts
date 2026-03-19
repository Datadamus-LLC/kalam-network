/**
 * Environment Validation Tests
 *
 * Tests the Zod-based env validation schema and validateEnv function.
 *
 * These are PURE LOGIC tests — no PostgreSQL, Redis, or external services required.
 * The envSchema is validated directly with zod.safeParse().
 *
 * NO mocks, NO jest.fn(), NO jest.mock() — per project rules.
 */

import { envSchema, validateEnv } from "./env.validation";

/**
 * Minimum required environment variables that satisfy the schema.
 * Only truly required fields (no defaults) must be present.
 * DB_PASSWORD is the only field required without a default.
 */
const MINIMUM_VALID_ENV: Record<string, string> = {
  DB_PASSWORD: "test-password-for-validation",
};

/**
 * A complete valid environment with all fields populated.
 */
const COMPLETE_VALID_ENV: Record<string, string> = {
  NODE_ENV: "development",
  API_PORT: "3001",
  WS_PORT: "3001",
  LOG_LEVEL: "log",
  CORS_ORIGIN: "http://localhost:3000",
  DB_HOST: "localhost",
  DB_PORT: "5432",
  DB_USERNAME: "hedera_social",
  DB_PASSWORD: "secure-password-123",
  DB_DATABASE: "hedera_social",
  REDIS_HOST: "localhost",
  REDIS_PORT: "6379",
  HEDERA_NETWORK: "testnet",
  HEDERA_OPERATOR_ID: "0.0.12345",
  HEDERA_OPERATOR_KEY:
    "302e020100300506032b657004220420abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  HEDERA_MIRROR_NODE_URL: "https://testnet.mirrornode.hedera.com/api/v1",
  JWT_SECRET:
    "this-is-a-long-enough-jwt-secret-for-testing-purposes-at-least-32-chars",
  JWT_EXPIRY: "24h",
  JWT_REFRESH_SECRET:
    "this-is-a-long-enough-refresh-secret-for-testing-purposes-at-least-32-chars",
  JWT_REFRESH_EXPIRY: "30d",
  MIRSAD_KYC_ENABLED: "false",
  PINATA_API_BASE_URL: "https://api.pinata.cloud",
  PINATA_GATEWAY_URL: "https://gateway.pinata.cloud/ipfs",
  HASHSCAN_BASE_URL: "https://hashscan.io",
};

describe("envSchema — Zod environment variable validation", () => {
  // =====================================================================
  // 1. Accepts valid complete config (all required fields present)
  // =====================================================================

  it("should accept a complete valid configuration", () => {
    const result = envSchema.safeParse(COMPLETE_VALID_ENV);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.NODE_ENV).toBe("development");
      expect(result.data.API_PORT).toBe(3001);
      expect(result.data.DB_HOST).toBe("localhost");
      expect(result.data.DB_PORT).toBe(5432);
      expect(result.data.DB_PASSWORD).toBe("secure-password-123");
      expect(result.data.HEDERA_NETWORK).toBe("testnet");
      expect(result.data.JWT_SECRET).toBe(COMPLETE_VALID_ENV.JWT_SECRET);
      expect(result.data.MIRSAD_KYC_ENABLED).toBe(false);
    }
  });

  // =====================================================================
  // 2. Requires DB_PASSWORD (missing -> error)
  // =====================================================================

  it("should reject config missing DB_PASSWORD", () => {
    const envWithoutDbPassword: Record<string, string> = {};
    // Provide no DB_PASSWORD — the only truly required field without a default

    const result = envSchema.safeParse(envWithoutDbPassword);

    expect(result.success).toBe(false);

    if (!result.success) {
      const dbPasswordIssue = result.error.issues.find(
        (issue) =>
          issue.path.includes("DB_PASSWORD") || issue.path[0] === "DB_PASSWORD",
      );
      expect(dbPasswordIssue).toBeDefined();
    }
  });

  // =====================================================================
  // 3. Validates HEDERA_NETWORK enum (invalid -> error)
  // =====================================================================

  it("should reject invalid HEDERA_NETWORK value", () => {
    const envWithBadNetwork: Record<string, string> = {
      ...MINIMUM_VALID_ENV,
      HEDERA_NETWORK: "localnet", // not a valid enum value
    };

    const result = envSchema.safeParse(envWithBadNetwork);

    expect(result.success).toBe(false);

    if (!result.success) {
      const networkIssue = result.error.issues.find(
        (issue) => issue.path[0] === "HEDERA_NETWORK",
      );
      expect(networkIssue).toBeDefined();
    }
  });

  // =====================================================================
  // 4. Validates NODE_ENV enum
  // =====================================================================

  it("should reject invalid NODE_ENV value", () => {
    const envWithBadNodeEnv: Record<string, string> = {
      ...MINIMUM_VALID_ENV,
      NODE_ENV: "staging", // not a valid enum value
    };

    const result = envSchema.safeParse(envWithBadNodeEnv);

    expect(result.success).toBe(false);

    if (!result.success) {
      const nodeEnvIssue = result.error.issues.find(
        (issue) => issue.path[0] === "NODE_ENV",
      );
      expect(nodeEnvIssue).toBeDefined();
    }
  });

  it("should accept all valid NODE_ENV values", () => {
    const validNodeEnvs = ["development", "production", "test"];

    for (const nodeEnv of validNodeEnvs) {
      const result = envSchema.safeParse({
        ...MINIMUM_VALID_ENV,
        NODE_ENV: nodeEnv,
      });
      expect(result.success).toBe(true);
    }
  });

  // =====================================================================
  // 5. Applies default values for optional fields
  // =====================================================================

  it("should apply default values when optional fields are omitted", () => {
    const result = envSchema.safeParse(MINIMUM_VALID_ENV);

    expect(result.success).toBe(true);

    if (result.success) {
      // Server defaults
      expect(result.data.NODE_ENV).toBe("development");
      expect(result.data.API_PORT).toBe(3001);
      expect(result.data.WS_PORT).toBe(3001);
      expect(result.data.LOG_LEVEL).toBe("log");
      expect(result.data.CORS_ORIGIN).toBe("http://localhost:3000");

      // Database defaults
      expect(result.data.DB_HOST).toBe("localhost");
      expect(result.data.DB_PORT).toBe(5432);
      expect(result.data.DB_USERNAME).toBe("hedera_social");
      expect(result.data.DB_DATABASE).toBe("hedera_social");

      // Redis defaults
      expect(result.data.REDIS_HOST).toBe("localhost");
      expect(result.data.REDIS_PORT).toBe(6379);

      // Hedera defaults
      expect(result.data.HEDERA_NETWORK).toBe("testnet");
      expect(result.data.HEDERA_MIRROR_NODE_URL).toBe(
        "https://testnet.mirrornode.hedera.com/api/v1",
      );

      // JWT defaults
      expect(result.data.JWT_EXPIRY).toBe("24h");
      expect(result.data.JWT_REFRESH_EXPIRY).toBe("30d");

      // Pinata defaults
      expect(result.data.PINATA_API_BASE_URL).toBe("https://api.pinata.cloud");
      expect(result.data.PINATA_GATEWAY_URL).toBe(
        "https://gateway.pinata.cloud/ipfs",
      );

      // HashScan default
      expect(result.data.HASHSCAN_BASE_URL).toBe("https://hashscan.io");

      // KYC default
      expect(result.data.MIRSAD_KYC_ENABLED).toBe(false);
    }
  });

  // =====================================================================
  // 6. Validates DB_PORT is a number
  // =====================================================================

  it("should reject non-numeric DB_PORT", () => {
    const envWithBadPort: Record<string, string> = {
      ...MINIMUM_VALID_ENV,
      DB_PORT: "not-a-number",
    };

    const result = envSchema.safeParse(envWithBadPort);

    expect(result.success).toBe(false);

    if (!result.success) {
      const portIssue = result.error.issues.find(
        (issue) => issue.path[0] === "DB_PORT",
      );
      expect(portIssue).toBeDefined();
    }
  });

  it("should coerce string DB_PORT to number", () => {
    const result = envSchema.safeParse({
      ...MINIMUM_VALID_ENV,
      DB_PORT: "5433",
    });

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.DB_PORT).toBe(5433);
      expect(typeof result.data.DB_PORT).toBe("number");
    }
  });

  it("should reject DB_PORT outside valid range (>65535)", () => {
    const result = envSchema.safeParse({
      ...MINIMUM_VALID_ENV,
      DB_PORT: "70000",
    });

    expect(result.success).toBe(false);

    if (!result.success) {
      const portIssue = result.error.issues.find(
        (issue) => issue.path[0] === "DB_PORT",
      );
      expect(portIssue).toBeDefined();
    }
  });

  // =====================================================================
  // 7. Accepts minimum required fields only
  // =====================================================================

  it("should accept config with only the minimum required fields", () => {
    // DB_PASSWORD is the only field that has no default and is required
    const result = envSchema.safeParse(MINIMUM_VALID_ENV);

    expect(result.success).toBe(true);

    if (result.success) {
      expect(result.data.DB_PASSWORD).toBe("test-password-for-validation");
      // All other fields should have their defaults applied
      expect(result.data.NODE_ENV).toBe("development");
      expect(result.data.HEDERA_NETWORK).toBe("testnet");
    }
  });

  // =====================================================================
  // 8. Rejects unknown NODE_ENV values
  // =====================================================================

  it("should reject unknown NODE_ENV values like 'staging' or 'qa'", () => {
    const invalidNodeEnvs = ["staging", "qa", "uat", "preprod", "local"];

    for (const nodeEnv of invalidNodeEnvs) {
      const result = envSchema.safeParse({
        ...MINIMUM_VALID_ENV,
        NODE_ENV: nodeEnv,
      });

      expect(result.success).toBe(false);

      if (!result.success) {
        const nodeEnvIssue = result.error.issues.find(
          (issue) => issue.path[0] === "NODE_ENV",
        );
        expect(nodeEnvIssue).toBeDefined();
      }
    }
  });
});

describe("validateEnv — function behavior", () => {
  // =====================================================================
  // validateEnv calls process.exit(1) on failure, so we intercept that.
  // We cannot use jest.spyOn() per project rules.
  // Instead, we test the schema directly for failure cases
  // and only call validateEnv with valid configs.
  // =====================================================================

  it("should return validated config when given valid environment", () => {
    const result = validateEnv(COMPLETE_VALID_ENV);

    expect(result).toBeDefined();
    expect(result.NODE_ENV).toBe("development");
    expect(result.DB_PASSWORD).toBe("secure-password-123");
    expect(result.API_PORT).toBe(3001);
    expect(result.HEDERA_NETWORK).toBe("testnet");
    expect(result.MIRSAD_KYC_ENABLED).toBe(false);
  });

  it("should transform MIRSAD_KYC_ENABLED string 'true' to boolean true", () => {
    const result = validateEnv({
      ...COMPLETE_VALID_ENV,
      MIRSAD_KYC_ENABLED: "true",
    });

    expect(result.MIRSAD_KYC_ENABLED).toBe(true);
  });

  it("should treat empty string as undefined for optional Hedera IDs", () => {
    const result = validateEnv({
      ...COMPLETE_VALID_ENV,
      HEDERA_OPERATOR_ID: "",
      HEDERA_DID_TOKEN_ID: "",
      HEDERA_SOCIAL_GRAPH_TOPIC: "",
    });

    expect(result.HEDERA_OPERATOR_ID).toBeUndefined();
    expect(result.HEDERA_DID_TOKEN_ID).toBeUndefined();
    expect(result.HEDERA_SOCIAL_GRAPH_TOPIC).toBeUndefined();
  });

  it("should treat empty string as undefined for optional JWT secrets", () => {
    const result = validateEnv({
      ...COMPLETE_VALID_ENV,
      JWT_SECRET: "",
      JWT_REFRESH_SECRET: "",
    });

    expect(result.JWT_SECRET).toBeUndefined();
    expect(result.JWT_REFRESH_SECRET).toBeUndefined();
  });

  it("should validate Hedera ID format (0.0.X pattern)", () => {
    // Valid Hedera ID
    const validResult = envSchema.safeParse({
      ...MINIMUM_VALID_ENV,
      HEDERA_OPERATOR_ID: "0.0.12345",
    });
    expect(validResult.success).toBe(true);

    // Invalid Hedera ID format
    const invalidResult = envSchema.safeParse({
      ...MINIMUM_VALID_ENV,
      HEDERA_OPERATOR_ID: "invalid-hedera-id",
    });
    expect(invalidResult.success).toBe(false);

    // Another invalid format
    const badFormatResult = envSchema.safeParse({
      ...MINIMUM_VALID_ENV,
      HEDERA_OPERATOR_ID: "1.2.3",
    });
    expect(badFormatResult.success).toBe(false);
  });

  it("should validate valid HEDERA_NETWORK enum values", () => {
    const validNetworks = ["testnet", "mainnet", "previewnet"];

    for (const network of validNetworks) {
      const result = envSchema.safeParse({
        ...MINIMUM_VALID_ENV,
        HEDERA_NETWORK: network,
      });
      expect(result.success).toBe(true);
    }
  });
});
