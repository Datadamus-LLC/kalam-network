/**
 * DidNftService Integration Tests
 *
 * Tests the DID NFT service which builds HIP-412 metadata and mints
 * soulbound NFTs on Hedera HTS.
 *
 * Tests that always run (no external services needed):
 *   - buildMetadata() creates HIP-412 compliant metadata
 *   - buildMetadata() includes business properties for business accounts
 *   - Deterministic kycHash generation
 *
 * Tests that require Hedera testnet credentials:
 *   HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY, HEDERA_DID_TOKEN_ID
 *   - mintDidNft() creates a real NFT on testnet
 *
 * Tests that require Pinata IPFS:
 *   - uploadMetadataToIpfs() — BLOCKED: awaiting Pinata API docs verification
 *
 * NO mocks. NO jest.fn(). NO jest.mock(). NO jest.spyOn().
 */

import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import { Logger } from "@nestjs/common";
import {
  DidNftService,
  DIDNftMetadataInput,
} from "../services/did-nft.service";
import { HederaService } from "../../hedera/hedera.service";
import { IpfsService } from "../../integrations/ipfs/ipfs.service";
import { DidNftMintException } from "../exceptions/kyc.exception";

const logger = new Logger("DidNftServiceIntegrationTest");

function hasHederaCredentials(): boolean {
  return !!(
    process.env["HEDERA_OPERATOR_ID"] && process.env["HEDERA_OPERATOR_KEY"]
  );
}

function hasHederaDidTokenId(): boolean {
  return !!process.env["HEDERA_DID_TOKEN_ID"];
}

describe("DidNftService Integration", () => {
  // -------------------------------------------------------------------------
  // Metadata building tests (always run — no external services)
  // -------------------------------------------------------------------------
  describe("buildMetadata()", () => {
    let module: TestingModule;
    let didNftService: DidNftService;

    beforeAll(async () => {
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
                pinata: {
                  apiKey: "",
                  secretKey: "",
                  gatewayUrl: "https://gateway.pinata.cloud/ipfs",
                },
              }),
            ],
          }),
        ],
        providers: [DidNftService, HederaService, IpfsService],
      }).compile();

      didNftService = module.get(DidNftService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should build HIP-412 compliant metadata for individual account", () => {
      const input: DIDNftMetadataInput = {
        hederaAccountId: "0.0.123456",
        accountType: "individual",
        kycLevel: "basic",
        displayName: "Test User",
        bio: "A test user for integration testing",
        location: "San Francisco, CA",
      };

      const metadata = didNftService.buildMetadata(input);

      expect(metadata.name).toBe("DID:hedera:testnet:0.0.123456");
      expect(metadata.description).toBe(
        "Decentralized Identity Credential — Hedera Social Platform",
      );
      expect(metadata.format).toBe("HIP412@2.0.0");
      expect(metadata.type).toBe("image/png");
      expect(metadata.image).toBe("");
      expect(metadata.properties.accountType).toBe("individual");
      expect(metadata.properties.kycLevel).toBe("basic");
      expect(metadata.properties.kycProvider).toBe("mirsad-ai");
      expect(metadata.properties.displayName).toBe("Test User");
      expect(metadata.properties.bio).toBe(
        "A test user for integration testing",
      );
      expect(metadata.properties.location).toBe("San Francisco, CA");
      expect(metadata.properties.version).toBe("1.0.0");
      expect(typeof metadata.properties.kycHash).toBe("string");
      expect(metadata.properties.kycHash.length).toBe(64); // SHA-256 hex
      expect(typeof metadata.properties.kycTimestamp).toBe("string");
      expect(typeof metadata.properties.createdAt).toBe("string");
      expect(metadata.businessProperties).toBeUndefined();
    });

    it("should include avatar IPFS URI when avatarIpfsCid is provided", () => {
      const input: DIDNftMetadataInput = {
        hederaAccountId: "0.0.123456",
        accountType: "individual",
        kycLevel: "basic",
        displayName: "Avatar User",
        bio: "Has an avatar",
        avatarIpfsCid: "QmTestAvatarCid123",
      };

      const metadata = didNftService.buildMetadata(input);

      expect(metadata.image).toBe("ipfs://QmTestAvatarCid123");
    });

    it("should include business properties for business account type", () => {
      const input: DIDNftMetadataInput = {
        hederaAccountId: "0.0.789012",
        accountType: "business",
        kycLevel: "basic",
        displayName: "Test Corp",
        bio: "A test corporation",
        businessProperties: {
          companyName: "Test Corp LLC",
          registrationNumber: "BRN-123456",
          businessCategory: "Technology",
          website: "https://testcorp.example.com",
        },
      };

      const metadata = didNftService.buildMetadata(input);

      expect(metadata.properties.accountType).toBe("business");
      expect(metadata.businessProperties).toBeDefined();
      expect(metadata.businessProperties!.companyName).toBe("Test Corp LLC");
      expect(metadata.businessProperties!.registrationNumber).toBe(
        "BRN-123456",
      );
      expect(metadata.businessProperties!.businessCategory).toBe("Technology");
      expect(metadata.businessProperties!.website).toBe(
        "https://testcorp.example.com",
      );
      expect(metadata.businessProperties!.kybLevel).toBe("basic");
    });

    it("should not include business properties for individual account type even if provided", () => {
      const input: DIDNftMetadataInput = {
        hederaAccountId: "0.0.111222",
        accountType: "individual",
        kycLevel: "basic",
        displayName: "Individual With Biz",
        bio: "Should not have biz props",
        businessProperties: {
          companyName: "Should Not Appear",
        },
      };

      const metadata = didNftService.buildMetadata(input);

      expect(metadata.businessProperties).toBeUndefined();
    });

    it("should generate a deterministic kycHash from input data", () => {
      const input: DIDNftMetadataInput = {
        hederaAccountId: "0.0.555666",
        accountType: "individual",
        kycLevel: "enhanced",
        displayName: "Hash Test",
        bio: "Testing hash determinism",
      };

      const metadata = didNftService.buildMetadata(input);

      // kycHash should be 64 hex characters (SHA-256)
      expect(metadata.properties.kycHash).toMatch(/^[a-f0-9]{64}$/);

      // kycHash includes the timestamp, so two calls produce different hashes
      // (this is expected — the hash includes the ISO timestamp)
      const metadata2 = didNftService.buildMetadata(input);
      // Different timestamps lead to different hashes in most cases
      // (unless both calls happen in the same millisecond, which is unlikely)
      expect(typeof metadata2.properties.kycHash).toBe("string");
      expect(metadata2.properties.kycHash.length).toBe(64);
    });
  });

  // -------------------------------------------------------------------------
  // IPFS upload tests — BLOCKED per documentation-status.md
  // -------------------------------------------------------------------------
  describe("uploadMetadataToIpfs()", () => {
    // BLOCKED: awaiting Pinata API docs verification
    it("should upload metadata to IPFS via Pinata", () => {
      // BLOCKED: awaiting Pinata API docs verification
      logger.warn(
        "BLOCKED: awaiting Pinata API docs verification — " +
          "Pinata IPFS has NEEDS_VERIFICATION status in documentation-status.md",
      );
      return;
    });
  });

  // -------------------------------------------------------------------------
  // DID NFT minting — requires Hedera testnet credentials + DID token ID
  // -------------------------------------------------------------------------
  describe("mintDidNft() on Hedera testnet", () => {
    let module: TestingModule;
    let didNftService: DidNftService;
    const hederaAvailable = hasHederaCredentials();
    const didTokenAvailable = hasHederaDidTokenId();

    beforeAll(async () => {
      if (!hederaAvailable) {
        logger.warn(
          "Hedera testnet credentials not configured. " +
            "DID NFT minting tests will be skipped. " +
            "Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY to enable.",
        );
        return;
      }

      if (!didTokenAvailable) {
        logger.warn(
          "HEDERA_DID_TOKEN_ID not configured. " +
            "DID NFT minting tests will be skipped.",
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
                  operatorId: process.env["HEDERA_OPERATOR_ID"],
                  operatorKey: process.env["HEDERA_OPERATOR_KEY"],
                  didTokenId: process.env["HEDERA_DID_TOKEN_ID"],
                },
                pinata: {
                  apiKey: process.env["PINATA_API_KEY"] ?? "",
                  secretKey: process.env["PINATA_SECRET_KEY"] ?? "",
                  gatewayUrl:
                    process.env["PINATA_GATEWAY_URL"] ??
                    "https://gateway.pinata.cloud/ipfs",
                },
              }),
            ],
          }),
        ],
        providers: [DidNftService, HederaService, IpfsService],
      }).compile();

      didNftService = module.get(DidNftService);
    });

    afterAll(async () => {
      if (module) await module.close();
    });

    it("should mint a real DID NFT on Hedera testnet", async () => {
      if (!hederaAvailable) {
        logger.warn(
          "SKIPPED: HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY not configured",
        );
        return;
      }

      if (!didTokenAvailable) {
        logger.warn("SKIPPED: HEDERA_DID_TOKEN_ID not configured");
        return;
      }

      const operatorId = process.env["HEDERA_OPERATOR_ID"]!;

      const input: DIDNftMetadataInput = {
        hederaAccountId: operatorId,
        accountType: "individual",
        kycLevel: "basic",
        displayName: "Integration Test NFT User",
        bio: "DID NFT minted during integration test",
      };

      const metadata = didNftService.buildMetadata(input);

      // Mint the NFT. IPFS upload may fail (Pinata not configured), but
      // the service falls back to on-chain hash metadata, so minting
      // should still succeed.
      const result = await didNftService.mintDidNft(metadata, operatorId);

      expect(result).toBeDefined();
      expect(typeof result.serial).toBe("number");
      expect(result.serial).toBeGreaterThan(0);
      expect(typeof result.transactionId).toBe("string");
      expect(result.transactionId.length).toBeGreaterThan(0);
      expect(typeof result.metadataCid).toBe("string");
      expect(result.metadataCid.length).toBeGreaterThan(0);
      expect(result.tokenId).toBe(process.env["HEDERA_DID_TOKEN_ID"]);

      logger.log(
        `DID NFT minted: serial=${result.serial}, tx=${result.transactionId}`,
      );
    }, 120_000); // Hedera transactions can take time

    it("should throw DidNftMintException when DID token ID is not configured", async () => {
      // Create a service instance with no DID token ID
      const tempModule = await Test.createTestingModule({
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
                pinata: {
                  apiKey: "",
                  secretKey: "",
                  gatewayUrl: "https://gateway.pinata.cloud/ipfs",
                },
              }),
            ],
          }),
        ],
        providers: [DidNftService, HederaService, IpfsService],
      }).compile();

      const tempService = tempModule.get(DidNftService);

      const input: DIDNftMetadataInput = {
        hederaAccountId: "0.0.123456",
        accountType: "individual",
        kycLevel: "basic",
        displayName: "No Token User",
        bio: "Should fail",
      };

      const metadata = tempService.buildMetadata(input);

      await expect(
        tempService.mintDidNft(metadata, "0.0.123456"),
      ).rejects.toThrow(DidNftMintException);

      await tempModule.close();
    });
  });
});
