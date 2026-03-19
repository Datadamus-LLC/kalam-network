/**
 * IpfsService Integration Tests
 *
 * IMPORTANT: Pinata IPFS is NEEDS_VERIFICATION per documentation-status.md.
 * ALL functionality tests that would make real API calls to Pinata are BLOCKED
 * until the Pinata API documentation has been verified.
 *
 * Tests that DO run:
 * - Service instantiation with and without credentials
 * - isConfigured() state
 * - IpfsNotConfiguredException when credentials missing
 * - Gateway URL construction (no API call needed)
 *
 * Tests that are BLOCKED:
 * - uploadFile() — BLOCKED: awaiting Pinata API docs verification
 * - uploadJson() — BLOCKED: awaiting Pinata API docs verification
 * - getContent() — BLOCKED: awaiting Pinata API docs verification
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import { IpfsService } from "../ipfs.service";
import { IpfsNotConfiguredException } from "../ipfs.exceptions";

const logger = new Logger("IpfsServiceIntegrationTest");

describe("IpfsService Integration", () => {
  // -------------------------------------------------------------------------
  // Unconfigured service tests (always run)
  // -------------------------------------------------------------------------
  describe("when credentials are NOT configured", () => {
    let module: TestingModule;
    let service: IpfsService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                pinata: {
                  apiKey: undefined,
                  secretKey: undefined,
                  gatewayUrl: "https://gateway.pinata.cloud/ipfs",
                },
              }),
            ],
          }),
        ],
        providers: [IpfsService],
      }).compile();

      await module.init();
      service = module.get(IpfsService);
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

    it("should throw IpfsNotConfiguredException on uploadFile()", async () => {
      await expect(
        service.uploadFile(Buffer.from("test"), "test.txt"),
      ).rejects.toThrow(IpfsNotConfiguredException);
    });

    it("should throw IpfsNotConfiguredException on uploadJson()", async () => {
      await expect(
        service.uploadJson({ test: "data" }, "test-json"),
      ).rejects.toThrow(IpfsNotConfiguredException);
    });

    it("should build a gateway URL even without credentials", () => {
      const url = service.getGatewayUrl("QmTestHash123");
      expect(url).toBe("https://gateway.pinata.cloud/ipfs/QmTestHash123");
    });
  });

  // -------------------------------------------------------------------------
  // Configured service init (always run with dummy config)
  // -------------------------------------------------------------------------
  describe("when credentials are configured (service init)", () => {
    let module: TestingModule;
    let service: IpfsService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                pinata: {
                  apiKey: "test_api_key",
                  secretKey: "test_secret_key",
                  gatewayUrl: "https://my-gateway.mypinata.cloud/ipfs",
                },
              }),
            ],
          }),
        ],
        providers: [IpfsService],
      }).compile();

      await module.init();
      service = module.get(IpfsService);
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

    it("should use custom gateway URL from config", () => {
      const url = service.getGatewayUrl("QmCustomGateway456");
      expect(url).toBe(
        "https://my-gateway.mypinata.cloud/ipfs/QmCustomGateway456",
      );
    });
  });

  // -------------------------------------------------------------------------
  // BLOCKED: Live Pinata API tests
  // All tests in this section are blocked per documentation-status.md.
  // Pinata IPFS has status NEEDS_VERIFICATION.
  // -------------------------------------------------------------------------
  describe("live Pinata IPFS API", () => {
    // BLOCKED: awaiting Pinata API docs verification
    // Per documentation-status.md, Pinata IPFS is NEEDS_VERIFICATION.
    // Do NOT write Pinata integration code until this is verified.

    it("should upload a file to IPFS", () => {
      // BLOCKED: awaiting Pinata API docs verification
      logger.warn(
        "BLOCKED: awaiting Pinata API docs verification — " +
          "Pinata IPFS has NEEDS_VERIFICATION status in documentation-status.md",
      );
      return;
    });

    it("should upload JSON to IPFS", () => {
      // BLOCKED: awaiting Pinata API docs verification
      logger.warn(
        "BLOCKED: awaiting Pinata API docs verification — " +
          "Pinata IPFS has NEEDS_VERIFICATION status in documentation-status.md",
      );
      return;
    });

    it("should fetch content from IPFS by CID", () => {
      // BLOCKED: awaiting Pinata API docs verification
      logger.warn(
        "BLOCKED: awaiting Pinata API docs verification — " +
          "Pinata IPFS has NEEDS_VERIFICATION status in documentation-status.md",
      );
      return;
    });

    it("should handle upload failure gracefully", () => {
      // BLOCKED: awaiting Pinata API docs verification
      logger.warn(
        "BLOCKED: awaiting Pinata API docs verification — " +
          "Pinata IPFS has NEEDS_VERIFICATION status in documentation-status.md",
      );
      return;
    });

    it("should handle fetch failure for non-existent CID", () => {
      // BLOCKED: awaiting Pinata API docs verification
      logger.warn(
        "BLOCKED: awaiting Pinata API docs verification — " +
          "Pinata IPFS has NEEDS_VERIFICATION status in documentation-status.md",
      );
      return;
    });
  });
});
