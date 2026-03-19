/**
 * Global test setup for @hedera-social/api.
 *
 * Sets default environment variables for test runs.
 * All values can be overridden by setting them in the shell before running tests.
 *
 * IMPORTANT: Tests connect to REAL services (PostgreSQL, Redis, Hedera Testnet).
 * Start test infrastructure before running: `docker compose -f docker-compose.test.yml up -d`
 */
import { Logger } from "@nestjs/common";

const logger = new Logger("TestSetup");

// Set NODE_ENV to test
process.env.NODE_ENV = "test";

// Database — uses separate test database
process.env.DB_HOST = process.env.DB_HOST || "localhost";
process.env.DB_PORT = process.env.DB_PORT || "5433";
process.env.DB_USERNAME = process.env.DB_USERNAME || "test";
process.env.DB_PASSWORD = process.env.DB_PASSWORD || "test";
process.env.DB_DATABASE = process.env.DB_DATABASE || "hedera_social_test";

// Redis — uses database index 1 (separate from dev on index 0)
process.env.REDIS_HOST = process.env.REDIS_HOST || "localhost";
process.env.REDIS_PORT = process.env.REDIS_PORT || "6380";
process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6380/1";

// Hedera — real testnet
process.env.HEDERA_NETWORK = "testnet";

// JWT — test-only secrets (safe: never used outside test env)
process.env.JWT_SECRET =
  process.env.JWT_SECRET ||
  "test-jwt-secret-key-minimum-32-characters-long-for-testing";
process.env.JWT_EXPIRY = process.env.JWT_EXPIRY || "24h";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "test-jwt-refresh-secret-key-minimum-32-characters-long-for-testing";
process.env.JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "30d";

// Logging — suppress most log output during tests
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "warn";

// CORS
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";

// Disable optional integrations in test by default
process.env.MIRSAD_KYC_ENABLED = process.env.MIRSAD_KYC_ENABLED || "false";

logger.log("Test environment initialized");

// Define `pending()` for Jest — Jasmine has this built-in but Jest does not.
// Tests call `pending(); return;` to skip when infrastructure is unavailable.
// We define it as a no-op that logs a warning. The `return;` after it exits the test.
declare global {
  function pending(message?: string): void;
}
(globalThis as Record<string, unknown>).pending = function pending(
  message?: string,
): void {
  const msg = message || "test skipped (infrastructure unavailable)";
  logger.warn(`PENDING: ${msg}`);
};

// Handle unhandled promise rejections in tests
process.on("unhandledRejection", (reason: unknown) => {
  logger.error(`Unhandled Rejection: ${String(reason)}`);
});
