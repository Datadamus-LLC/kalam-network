/**
 * Real Hedera Testnet connection helper for integration tests.
 *
 * Connects to Hedera Testnet with real operator credentials.
 * All transactions are submitted to the REAL Hedera Testnet — no mocking.
 *
 * Requirements:
 * - HEDERA_OPERATOR_ID env var (e.g., 0.0.12345)
 * - HEDERA_OPERATOR_KEY env var (hex-encoded Ed25519 private key)
 *
 * If credentials are not set, Hedera-dependent tests are skipped
 * with a clear message (not mocked).
 */
import { Client, AccountId, PrivateKey } from "@hashgraph/sdk";
import { Logger } from "@nestjs/common";
import {
  TestCredentialsMissingException,
  TestNotInitializedException,
} from "./exceptions";

const logger = new Logger("TestHedera");

let hederaClient: Client | null = null;

/**
 * Check if Hedera testnet credentials are available.
 * Tests that require Hedera should call this and skip if false.
 */
export function hasHederaCredentials(): boolean {
  return !!(process.env.HEDERA_OPERATOR_ID && process.env.HEDERA_OPERATOR_KEY);
}

/**
 * Initialize real Hedera Testnet client.
 * Uses env vars: HEDERA_NETWORK, HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY
 *
 * @throws Error if credentials are not configured
 */
export function initializeTestHedera(): Client {
  if (hederaClient) {
    return hederaClient;
  }

  const network = process.env.HEDERA_NETWORK || "testnet";
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new TestCredentialsMissingException(
      "Hedera testnet",
      "Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY environment variables. " +
        "Get testnet credentials from https://portal.hedera.com/",
    );
  }

  hederaClient = Client.forName(network);
  hederaClient.setOperator(
    AccountId.fromString(operatorId),
    PrivateKey.fromString(operatorKey),
  );

  logger.log(`Connected to Hedera ${network} as ${operatorId}`);
  return hederaClient;
}

/**
 * Get active Hedera client.
 * Throws if not initialized.
 */
export function getTestHederaClient(): Client {
  if (!hederaClient) {
    throw new TestNotInitializedException(
      "Hedera client",
      "initializeTestHedera()",
    );
  }
  return hederaClient;
}

/**
 * Close Hedera client connection.
 * Call in afterAll() of your test file.
 */
export async function closeTestHedera(): Promise<void> {
  if (hederaClient) {
    hederaClient.close();
    hederaClient = null;
    logger.log("Test Hedera connection closed");
  }
}
