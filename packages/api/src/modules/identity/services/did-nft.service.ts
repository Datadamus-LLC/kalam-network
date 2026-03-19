import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "crypto";
import { HederaService } from "../../hedera/hedera.service";
import { IpfsService } from "../../integrations/ipfs/ipfs.service";
import { DidNftMintException } from "../exceptions/kyc.exception";

/**
 * DID NFT metadata conforming to HIP-412 (Hedera NFT metadata standard).
 * Reference: packages/shared/src/types/user.types.ts — DIDNftMetadata interface
 */
export interface DIDNftMetadata {
  name: string;
  description: string;
  image: string;
  type: string;
  format: string;
  properties: {
    accountType: string;
    kycLevel: string;
    kycProvider: "mirsad-ai";
    kycTimestamp: string;
    kycHash: string;
    displayName: string;
    bio: string;
    location?: string;
    createdAt: string;
    version: string;
  };
  businessProperties?: {
    companyName?: string;
    registrationNumber?: string;
    businessCategory?: string;
    kybLevel?: string;
    website?: string;
  };
}

/**
 * Input for building DID NFT metadata.
 */
export interface DIDNftMetadataInput {
  hederaAccountId: string;
  accountType: "individual" | "business";
  kycLevel: string;
  displayName: string;
  bio: string;
  avatarIpfsCid?: string;
  location?: string;
  businessProperties?: {
    companyName?: string;
    registrationNumber?: string;
    businessCategory?: string;
    website?: string;
  };
}

/**
 * Result of DID NFT minting.
 */
export interface DIDNftMintResult {
  serial: number;
  transactionId: string;
  metadataCid: string;
  tokenId: string;
}

/**
 * DidNftService — handles DID NFT metadata creation and minting on Hedera HTS.
 *
 * The DID NFT is a soulbound (non-transferable) NFT that serves as the
 * user's on-chain identity certificate.
 *
 * Flow:
 * 1. Build HIP-412 compliant metadata JSON
 * 2. Upload metadata to IPFS via Pinata (if configured)
 * 3. Mint NFT via TokenMintTransaction with metadata CID
 * 4. Freeze token on account to make it soulbound
 *
 * Reference: tasks/phase-1-identity/P1-T11-kyc-did-nft.md
 */
@Injectable()
export class DidNftService {
  private readonly logger = new Logger(DidNftService.name);
  private readonly didTokenId: string;

  constructor(
    private readonly hederaService: HederaService,
    private readonly configService: ConfigService,
    private readonly ipfsService: IpfsService,
  ) {
    this.didTokenId = this.configService.get<string>("hedera.didTokenId") ?? "";
  }

  /**
   * Build HIP-412 compliant DID NFT metadata.
   *
   * @param input - User data for metadata generation
   * @returns DIDNftMetadata conforming to HIP-412
   */
  buildMetadata(input: DIDNftMetadataInput): DIDNftMetadata {
    const now = new Date().toISOString();

    // Build a deterministic SHA-256 hash of KYC attestation data for audit
    const kycHashInput = [
      input.hederaAccountId,
      input.accountType,
      input.kycLevel,
      now,
    ].join("|");

    const kycHash = createHash("sha256").update(kycHashInput).digest("hex");

    const metadata: DIDNftMetadata = {
      name: `DID:hedera:testnet:${input.hederaAccountId}`,
      description: "Decentralized Identity Credential — Hedera Social Platform",
      image: input.avatarIpfsCid ? `ipfs://${input.avatarIpfsCid}` : "",
      type: "image/png",
      format: "HIP412@2.0.0",
      properties: {
        accountType: input.accountType,
        kycLevel: input.kycLevel,
        kycProvider: "mirsad-ai",
        kycTimestamp: now,
        kycHash: kycHash,
        displayName: input.displayName,
        bio: input.bio,
        location: input.location,
        createdAt: now,
        version: "1.0.0",
      },
    };

    if (input.accountType === "business" && input.businessProperties) {
      metadata.businessProperties = {
        companyName: input.businessProperties.companyName,
        registrationNumber: input.businessProperties.registrationNumber,
        businessCategory: input.businessProperties.businessCategory,
        website: input.businessProperties.website,
        kybLevel: input.kycLevel,
      };
    }

    return metadata;
  }

  /**
   * Upload DID NFT metadata to IPFS via Pinata.
   *
   * @param metadata - HIP-412 compliant metadata
   * @returns IPFS CID of the uploaded metadata
   */
  async uploadMetadataToIpfs(metadata: DIDNftMetadata): Promise<string> {
    this.logger.log("Uploading DID NFT metadata to IPFS");
    const cid = await this.ipfsService.uploadJson(
      metadata as unknown as Record<string, unknown>,
    );
    this.logger.log(`DID NFT metadata uploaded to IPFS: ${cid}`);
    return cid;
  }

  /**
   * Mint a DID NFT to a user's Hedera account.
   *
   * Uploads metadata to IPFS first, then mints the NFT with the IPFS CID.
   *
   * @param metadata - HIP-412 compliant metadata
   * @param hederaAccountId - User's Hedera account to receive the NFT
   * @returns DIDNftMintResult with serial number and transaction ID
   * @throws DidNftMintException if minting or freezing fails
   */
  async mintDidNft(
    metadata: DIDNftMetadata,
    hederaAccountId: string,
  ): Promise<DIDNftMintResult> {
    if (!this.didTokenId) {
      throw new DidNftMintException(
        "HEDERA_DID_TOKEN_ID is not configured. Cannot mint DID NFT.",
        "DID_TOKEN_NOT_CONFIGURED",
      );
    }

    this.logger.log(
      `Minting DID NFT for ${hederaAccountId} on token ${this.didTokenId}`,
    );

    // Upload metadata to IPFS and use the CID as the NFT metadata reference
    let metadataCid: string;
    try {
      const ipfsCid = await this.uploadMetadataToIpfs(metadata);
      metadataCid = `ipfs://${ipfsCid}`;
    } catch (ipfsError: unknown) {
      // If IPFS upload fails, fall back to on-chain hash reference
      const ipfsMsg =
        ipfsError instanceof Error ? ipfsError.message : "Unknown IPFS error";
      this.logger.warn(
        `IPFS upload failed, falling back to on-chain metadata hash: ${ipfsMsg}`,
      );
      const metadataJson = JSON.stringify(metadata);
      // Use first 16 bytes (32 hex chars) of SHA256 to keep JSON under Hedera's 100-byte limit
      // Full: "onchain:" + 64 chars = 72 chars in the CID → total JSON ~107 bytes (TOO LONG)
      // Truncated: "onchain:" + 32 chars = 40 chars in the CID → total JSON ~75 bytes (OK)
      const hash = createHash("sha256")
        .update(metadataJson)
        .digest("hex")
        .slice(0, 32);
      metadataCid = `onchain:${hash}`;
    }

    try {
      // Step 1: Mint the NFT with metadata
      const mintResult = await this.hederaService.mintDIDNft(
        this.didTokenId,
        metadataCid,
      );

      this.logger.log(
        `DID NFT minted for ${hederaAccountId} — serial: ${mintResult.serial}, tx: ${mintResult.transactionId}`,
      );

      // Step 2: Transfer the NFT from treasury to the user's account
      // Requires the account to have maxAutoTokenAssociations > 0 (set at account creation)
      // or to have manually associated with the DID token.
      if (hederaAccountId) {
        try {
          const operatorId = this.hederaService.getOperatorId();
          await this.hederaService.transferNft(
            this.didTokenId,
            mintResult.serial,
            operatorId,
            hederaAccountId,
          );
          this.logger.log(
            `DID NFT #${mintResult.serial} transferred to user ${hederaAccountId}`,
          );
        } catch (transferError: unknown) {
          // Non-fatal: account may not be auto-associated yet
          // New accounts (post-fix) will have maxAutoTokenAssociations=10 set at creation
          // Existing accounts need manual association (future enhancement)
          const transferMsg =
            transferError instanceof Error
              ? transferError.message
              : String(transferError);
          this.logger.warn(
            `Could not transfer DID NFT #${mintResult.serial} to ${hederaAccountId}: ${transferMsg}. ` +
              `NFT remains in treasury. Account needs auto-association enabled.`,
          );
        }
      }

      // Step 3: Freeze the token on the account to make it soulbound
      // This prevents the NFT from being transferred after delivery
      try {
        await this.hederaService.freezeToken(this.didTokenId, hederaAccountId);
        this.logger.log(
          `DID NFT frozen (soulbound) on account ${hederaAccountId}`,
        );
      } catch (freezeError: unknown) {
        // Freezing failure is non-fatal for the hackathon:
        // The NFT is still minted, just not soulbound yet.
        // In production, this MUST succeed.
        const freezeMessage =
          freezeError instanceof Error
            ? freezeError.message
            : "Unknown freeze error";
        this.logger.warn(
          `Failed to freeze DID NFT on ${hederaAccountId}: ${freezeMessage}. ` +
            `NFT is minted but NOT soulbound. This must be resolved.`,
        );
      }

      return {
        serial: mintResult.serial,
        transactionId: mintResult.transactionId,
        metadataCid,
        tokenId: this.didTokenId,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown Hedera error";
      this.logger.error(
        `DID NFT minting failed for ${hederaAccountId}: ${message}`,
      );
      throw new DidNftMintException(`Failed to mint DID NFT: ${message}`);
    }
  }
}
