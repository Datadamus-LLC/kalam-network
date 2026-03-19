/**
 * Hedera Testnet — Integration Tests
 *
 * Verifies connection to the REAL Hedera Testnet.
 * Requires valid HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY env vars.
 *
 * If credentials are not set, tests are skipped (not mocked).
 * Set credentials from https://portal.hedera.com/ before running.
 */
import { TopicCreateTransaction, TopicInfoQuery } from "@hashgraph/sdk";
import {
  hasHederaCredentials,
  initializeTestHedera,
  closeTestHedera,
  getTestHederaClient,
} from "./hedera";

const describeIfHedera = hasHederaCredentials() ? describe : describe.skip;

describeIfHedera("Test Hedera Helpers (Integration — Real Testnet)", () => {
  beforeAll(() => {
    initializeTestHedera();
  });

  afterAll(async () => {
    await closeTestHedera();
  });

  it("should connect to Hedera testnet client", () => {
    const client = getTestHederaClient();
    expect(client).toBeDefined();
  });

  it("should create a real HCS topic on testnet", async () => {
    const client = getTestHederaClient();

    // Create a real topic on Hedera testnet
    const transaction = new TopicCreateTransaction()
      .setTopicMemo("Integration test topic")
      .setMaxTransactionFee(5); // 5 HBAR max fee

    const txResponse = await transaction.execute(client);
    const receipt = await txResponse.getReceipt(client);

    expect(receipt.topicId).toBeDefined();
    expect(receipt.topicId?.toString()).toMatch(/^0\.0\.\d+$/);
  }, 30000); // 30s timeout for real Hedera transaction

  it("should query topic info from real testnet", async () => {
    const client = getTestHederaClient();

    // Create topic first
    const createTx = new TopicCreateTransaction()
      .setTopicMemo("Query test topic")
      .setMaxTransactionFee(5);

    const createResponse = await createTx.execute(client);
    const createReceipt = await createResponse.getReceipt(client);
    const topicId = createReceipt.topicId;

    expect(topicId).toBeDefined();

    if (topicId) {
      // Query the real topic info
      const topicInfo = await new TopicInfoQuery()
        .setTopicId(topicId)
        .execute(client);

      expect(topicInfo.topicMemo).toBe("Query test topic");
    }
  }, 30000);
});

describe("Hedera Credential Detection", () => {
  it("should detect whether Hedera credentials are available", () => {
    const result = hasHederaCredentials();
    expect(typeof result).toBe("boolean");
  });
});
