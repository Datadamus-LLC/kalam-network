import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import configuration from "../../config/configuration";
import { HederaService } from "./hedera.service";
import { MirrorNodeService } from "./mirror-node.service";

/**
 * Integration test for HederaService and MirrorNodeService.
 *
 * These tests submit REAL transactions to the Hedera testnet and query
 * the REAL Mirror Node REST API. They require valid operator credentials
 * in the environment (HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY).
 *
 * When credentials are not available, every test is gracefully skipped.
 *
 * Run with:  pnpm test:integration
 * Skip with: pnpm test  (unit tests only)
 */
describe("HederaService Integration Test", () => {
  let hederaService: HederaService;
  let mirrorNodeService: MirrorNodeService;
  let module: TestingModule;

  // Allow up to 60 s per test — real network calls can be slow
  jest.setTimeout(60_000);

  const credentialsAvailable =
    !!process.env.HEDERA_OPERATOR_ID && !!process.env.HEDERA_OPERATOR_KEY;

  beforeAll(async () => {
    if (!credentialsAvailable) {
      // Operator credentials not configured — all tests will be skipped.
      return;
    }

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          envFilePath: "../../.env",
          isGlobal: true,
        }),
      ],
      providers: [HederaService, MirrorNodeService],
    }).compile();

    // Initialise services (triggers OnModuleInit)
    await module.init();

    hederaService = module.get<HederaService>(HederaService);
    mirrorNodeService = module.get<MirrorNodeService>(MirrorNodeService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  // ---------------------------------------------------------------------------
  // Test 1 — Create an HCS topic
  // ---------------------------------------------------------------------------
  it("should create an HCS topic", async () => {
    if (!credentialsAvailable) {
      pending();
      return;
    }

    const topicId = await hederaService.createTopic({
      memo: "Hedera Social Platform Integration Test Topic",
    });

    expect(topicId).toBeDefined();
    expect(topicId).toMatch(/^\d+\.\d+\.\d+$/);
  });

  // ---------------------------------------------------------------------------
  // Test 2 — Submit a message and retrieve it via Mirror Node
  // ---------------------------------------------------------------------------
  it("should submit and retrieve a message", async () => {
    if (!credentialsAvailable) {
      pending();
      return;
    }

    // Create a test topic
    const topicId = await hederaService.createTopic({
      memo: "Test Topic for Message Submission",
    });

    // Submit a test message
    const testMessage = Buffer.from(
      JSON.stringify({
        text: "Test message",
        timestamp: new Date().toISOString(),
      }),
    );

    const sequenceNumber = await hederaService.submitMessage(
      topicId,
      testMessage,
    );

    expect(sequenceNumber).toBeDefined();

    // LEGITIMATE: Mirror Node indexing delay — wait for eventual
    // consistency of HCS message before querying the Mirror Node.
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 5000);
    });

    // Retrieve the message from Mirror Node
    const messages = await mirrorNodeService.getTopicMessages(topicId, {
      limit: 10,
    });

    expect(messages.length).toBeGreaterThan(0);
    const retrievedMessage = messages.find(
      (m) => m.sequence_number === parseInt(sequenceNumber, 10),
    );
    expect(retrievedMessage).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Test 3 — Get account info
  // ---------------------------------------------------------------------------
  it("should retrieve account info from Mirror Node", async () => {
    if (!credentialsAvailable) {
      pending();
      return;
    }

    const operatorId = hederaService.getOperatorId();
    const accountInfo = await mirrorNodeService.getAccountInfo(operatorId);

    expect(accountInfo).toBeDefined();
    expect(accountInfo.account).toBe(operatorId);
  });

  // ---------------------------------------------------------------------------
  // Test 4 — Verify operator public key
  // ---------------------------------------------------------------------------
  it("should retrieve correct operator public key", async () => {
    if (!credentialsAvailable) {
      pending();
      return;
    }

    const publicKey = hederaService.getOperatorPublicKey();
    expect(publicKey).toBeDefined();
    expect(publicKey.length).toBeGreaterThan(0);
  });
});
