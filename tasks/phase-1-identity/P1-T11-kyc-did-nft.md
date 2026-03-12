# P1-T11: KYC via Mirsad AI + DID NFT Minting

| Field | Value |
|-------|-------|
| Task ID | P1-T11 |
| Priority | 🔴 P0 — Critical Path (MOST COMPLEX) |
| Estimated Time | 6 hours |
| Depends On | P1-T10 (Wallet Creation), P0-T08 (Hedera Setup) |
| Phase | 1 — Identity & Onboarding |
| Assignee | Backend Developer (Hedera + IPFS expert) |
| Module | Identity & Onboarding (Spec Section 2.1, FR-ID-003/004/005) |
| Hedera Transactions | 1x TokenMint (~$0.05), 1x TokenFreeze (~$0.001), 1x HCS Submit (~$0.0008), 2x HCS CreateTopic ($0.02) |
| Total Hedera Cost | ~$0.07 per user onboarding |

---

## Objective

Complete the identity verification and onboarding flow by submitting KYC/KYB to Mirsad AI, minting a soulbound DID (Decentralized Identifier) NFT to the user's Hedera account, creating HCS topics for feeds and notifications, and marking the user as "active" and fully onboarded. This is the most complex task in Phase 1 — it orchestrates KYC, IPFS, HTS token minting, HCS topic creation, and database updates.

---

## Background

**KYC/KYB (Know Your Customer / Know Your Business):**
- Mirsad AI is a third-party KYC/KYB screening provider
- In production: Submit documents, Mirsad AI screens for compliance, returns approved/rejected
- For hackathon: Mock auto-approval after 3 seconds

**DID NFT (Decentralized Identifier NFT):**
- Soulbound NFT on Hedera (cannot be transferred, only owned account can hold it)
- Metadata stored on IPFS (CID embedded in NFT)
- Metadata includes: name, avatar, KYC level, creation date, account type
- Acts as the user's on-chain identity certificate

**IPFS via Pinata:**
- Upload metadata JSON and avatar image to IPFS
- Pinata is a managed IPFS provider (easier than running own node)
- Receive CID (content hash) — immutable reference to data

**HCS Topics (Hedera Consensus Service):**
- Public feed topic: User posts here (visible to followers)
- Notification topic: System sends notifications here
- Broadcast topic: Business accounts can broadcast to followers

**Spec References:**
- FR-ID-003: KYC Submission (docs/SPECIFICATION.md Section 2.1)
- FR-ID-004: KYB Submission (docs/SPECIFICATION.md Section 2.1)
- FR-ID-005: DID NFT Minting (docs/SPECIFICATION.md Section 2.1)
- DID NFT metadata format: DM-ID-001 (docs/SPECIFICATION.md Section 4)

---

## Pre-requisites

Before you start, make sure:

1. **P1-T10 Complete** — Users have wallets and Hedera Account IDs
2. **P0-T08 Complete** — Hedera DID token created, stored in `HEDERA_DID_TOKEN_ID` env var
3. **Environment Variables**:
   ```env
   HEDERA_DID_TOKEN_ID=0.0.XXXXX              # DID token ID (from P0-T08)
   HEDERA_NETWORK=testnet
   MIRSAD_KYC_API_URL=https://dashboard-api.mirsad.io
   MIRSAD_KYC_CALLBACK_URL=                            # Leave empty for hackathon
   MIRSAD_KYC_MOCK=true                           # Enable mock auto-approval
   PINATA_API_KEY=pk_xxx
   PINATA_SECRET_KEY=sk_xxx
   PINATA_GATEWAY_URL=https://gateway.pinata.cloud/ipfs
   ```
4. **Pinata Account** — Sign up at https://www.pinata.cloud (free tier OK for hackathon)
5. **Dependencies Installed**:
   - `@pinata/sdk` in `packages/api`
   - `@hashgraph/sdk` (already installed from P1-T10)
6. **Docker Running** — Postgres and Redis active

---

## Step-by-Step Instructions

### Step 1: Create Mirsad AI Service (KYC Screening)

Create file `packages/api/src/kyc/services/mirsad-ai.service.ts`:

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Mirsad AI Service — KYC/KYB screening
 *
 * In production:
 * - POST documents to Mirsad AI API
 * - Mirsad AI screens against AML/CFT/OFAC lists
 * - Returns approved/rejected/pending_review
 *
 * For hackathon (MIRSAD_KYC_MOCK=true):
 * - Auto-approve after 3 seconds
 * - Used for demo flow
 */
@Injectable()
export class MirsadAiService {
  private readonly logger = new Logger(MirsadAiService.name);
  private readonly mockMode: boolean;

  constructor(private configService: ConfigService) {
    this.mockMode = this.configService.get('MIRSAD_KYC_MOCK') === 'true';

    if (this.mockMode) {
      this.logger.warn('[MIRSAD_KYC] Mock mode enabled — auto-approving all KYC/KYB');
    }
  }

  /**
   * Submit KYC (individual identity verification) to Mirsad AI
   *
   * In production:
   * - POST to Mirsad AI API with user name, DOB, nationality, ID document
   * - Returns screening results and screening ID
   *
   * For hackathon:
   * - Mock implementation auto-approves after delay
   *
   * @param userId - User's database ID
   * @param kycData - KYC form data
   * @returns screeningId and initial status
   */
  async submitKyc(userId: string, kycData: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    documentType: string;
    documentNumber: string;
    documentImage?: Buffer; // Upload to Mirsad AI
  }): Promise<{
    screeningId: string;
    status: 'approved' | 'rejected' | 'pending_review';
  }> {
    if (this.mockMode) {
      return this.submitKycMock(userId, kycData);
    } else {
      return this.submitKycProduction(userId, kycData);
    }
  }

  /**
   * MOCK implementation — Auto-approve after 3 seconds
   */
  private async submitKycMock(userId: string, kycData: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    documentType: string;
    documentNumber: string;
    documentImage?: Buffer;
  }): Promise<{
    screeningId: string;
    status: 'approved' | 'rejected' | 'pending_review';
  }> {
    const screeningId = `mock_kyc_${userId}_${Date.now()}`;

    this.logger.log(
      `[MOCK MIRSAD_KYC] KYC submitted for ${kycData.firstName} ${kycData.lastName}\n` +
      `  Screening ID: ${screeningId}\n` +
      `  Auto-approving in 3 seconds...`,
    );

    // VIOLATION: Mock delay — replace with pollWithBackoff when real Mirsad AI API is integrated
    // For now: await Mirsad AI callback notification instead of setTimeout
    await new Promise((resolve) => setTimeout(resolve, 3000));

    this.logger.log(`[MOCK MIRSAD_KYC] KYC approved for user ${userId}`);

    return {
      screeningId,
      status: 'approved',
    };
  }

  /**
   * PRODUCTION implementation — Call Mirsad AI API
   */
  private async submitKycProduction(userId: string, kycData: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    documentType: string;
    documentNumber: string;
    documentImage?: Buffer;
  }): Promise<{
    screeningId: string;
    status: 'approved' | 'rejected' | 'pending_review';
  }> {
    const apiUrl = this.configService.get('MIRSAD_KYC_API_URL');
    const apiKey = this.configService.get('MIRSAD_KYC_CALLBACK_URL');

    if (!apiUrl || !apiKey) {
      throw new BadRequestException(
        'Mirsad AI API not configured. Set MIRSAD_KYC_API_URL and MIRSAD_KYC_CALLBACK_URL in .env',
      );
    }

    // TODO: Implement actual Mirsad AI API integration
    // const formData = new FormData();
    // formData.append('firstName', kycData.firstName);
    // formData.append('lastName', kycData.lastName);
    // formData.append('dateOfBirth', kycData.dateOfBirth);
    // formData.append('documentImage', kycData.documentImage);
    //
    // const response = await fetch(`${apiUrl}/kyc/submit`, {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${apiKey}` },
    //   body: formData,
    // });
    // const { screeningId, status } = await response.json();

    throw new BadRequestException('Production Mirsad AI API not yet implemented');
  }

  /**
   * Submit KYB (business identity verification) to Mirsad AI
   *
   * Similar to KYC but for business entities
   * Requires: company name, registration number, business category
   *
   * @param userId - User's database ID
   * @param kybData - KYB form data
   * @returns screeningId and status
   */
  async submitKyb(userId: string, kybData: {
    companyName: string;
    registrationNumber: string;
    businessCategory: string;
    authorizedRepName: string;
    businessDocumentImage?: Buffer;
  }): Promise<{
    screeningId: string;
    status: 'approved' | 'rejected' | 'pending_review';
  }> {
    if (this.mockMode) {
      return this.submitKybMock(userId, kybData);
    } else {
      return this.submitKybProduction(userId, kybData);
    }
  }

  /**
   * MOCK KYB implementation
   */
  private async submitKybMock(userId: string, kybData: {
    companyName: string;
    registrationNumber: string;
    businessCategory: string;
    authorizedRepName: string;
    businessDocumentImage?: Buffer;
  }): Promise<{
    screeningId: string;
    status: 'approved' | 'rejected' | 'pending_review';
  }> {
    const screeningId = `mock_kyb_${userId}_${Date.now()}`;

    this.logger.log(
      `[MOCK MIRSAD_KYC] KYB submitted for ${kybData.companyName}\n` +
      `  Screening ID: ${screeningId}\n` +
      `  Auto-approving in 3 seconds...`,
    );

    // VIOLATION: Mock delay — replace with pollWithBackoff when real Mirsad AI API is integrated
    // For now: await Mirsad AI callback notification instead of setTimeout
    await new Promise((resolve) => setTimeout(resolve, 3000));

    this.logger.log(`[MOCK MIRSAD_KYC] KYB approved for user ${userId}`);

    return {
      screeningId,
      status: 'approved',
    };
  }

  /**
   * PRODUCTION KYB implementation
   */
  private async submitKybProduction(userId: string, kybData: {
    companyName: string;
    registrationNumber: string;
    businessCategory: string;
    authorizedRepName: string;
    businessDocumentImage?: Buffer;
  }): Promise<{
    screeningId: string;
    status: 'approved' | 'rejected' | 'pending_review';
  }> {
    throw new BadRequestException('Production Mirsad AI KYB API not yet implemented');
  }

  /**
   * Get screening status from Mirsad AI
   * Poll this until status changes from pending_review to approved/rejected
   *
   * @param screeningId - Screening ID from submit response
   * @returns Current screening status
   */
  async getScreeningStatus(screeningId: string): Promise<{
    status: 'approved' | 'rejected' | 'pending_review';
    result?: Record<string, unknown>;
  }> {
    if (this.mockMode) {
      // Mock always returns approved
      return { status: 'approved' };
    }

    // TODO: Call Mirsad AI API to get status
    throw new BadRequestException('Production screening status check not yet implemented');
  }
}
```

### Step 2: Create IPFS Service (Pinata Integration)

Create file `packages/api/src/ipfs/services/ipfs.service.ts`:

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import PinataSDK from '@pinata/sdk';
import * as fs from 'fs';
import * as path from 'path';

/**
 * IPFS Service — Upload files to IPFS via Pinata
 *
 * Used for:
 * - DID NFT metadata JSON
 * - Profile avatar images
 * - Message attachments
 * - Document storage
 */
@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private pinata: PinataSDK;

  constructor(private configService: ConfigService) {
    this.initializePinata();
  }

  /**
   * Initialize Pinata SDK with API credentials
   */
  private initializePinata(): void {
    const apiKey = this.configService.get('PINATA_API_KEY');
    const secretKey = this.configService.get('PINATA_SECRET_KEY');

    if (!apiKey || !secretKey) {
      this.logger.warn(
        'Pinata credentials not configured — IPFS uploads will fail. ' +
        'Set PINATA_API_KEY and PINATA_SECRET_KEY in .env',
      );
      return;
    }

    this.pinata = new PinataSDK(apiKey, secretKey);
    this.logger.log('Pinata SDK initialized');
  }

  /**
   * Upload JSON object to IPFS (used for NFT metadata)
   *
   * @param data - JSON object to upload
   * @param filename - Optional filename for reference
   * @returns CID (content identifier / hash)
   */
  async uploadJson(
    data: Record<string, unknown>,
    filename: string = 'metadata.json',
  ): Promise<string> {
    try {
      if (!this.pinata) {
        throw new BadRequestException(
          'Pinata not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY in .env',
        );
      }

      this.logger.log(`Uploading JSON to IPFS: ${filename}`);

      const result = await this.pinata.pinJSONToIPFS(data, {
        pinataMetadata: {
          name: filename,
        },
        pinataOptions: {
          cidVersion: 1, // Use CIDv1 (more future-proof)
        },
      });

      const cid = result.IpfsHash;
      this.logger.log(
        `JSON uploaded to IPFS: ${filename}\n` +
        `  CID: ${cid}\n` +
        `  URL: https://gateway.pinata.cloud/ipfs/${cid}`,
      );

      return cid;
    } catch (error) {
      this.logger.error(`Failed to upload JSON to IPFS: ${error.message}`);
      throw new BadRequestException('Failed to upload to IPFS');
    }
  }

  /**
   * Upload file buffer to IPFS (used for images, documents)
   *
   * @param buffer - File content as Buffer
   * @param filename - File name (used for reference)
   * @param mimeType - MIME type (optional, for metadata)
   * @returns CID
   */
  async uploadFile(
    buffer: Buffer,
    filename: string,
    mimeType?: string,
  ): Promise<string> {
    try {
      if (!this.pinata) {
        throw new BadRequestException(
          'Pinata not configured. Set PINATA_API_KEY and PINATA_SECRET_KEY in .env',
        );
      }

      this.logger.log(`Uploading file to IPFS: ${filename}`);

      // Create a readable stream from buffer
      const readable = require('stream').Readable.from([buffer]);

      const result = await this.pinata.pinFileToIPFS(readable, {
        pinataMetadata: {
          name: filename,
        },
        pinataOptions: {
          cidVersion: 1,
        },
      });

      const cid = result.IpfsHash;
      this.logger.log(
        `File uploaded to IPFS: ${filename}\n` +
        `  CID: ${cid}\n` +
        `  MIME: ${mimeType}\n` +
        `  URL: https://gateway.pinata.cloud/ipfs/${cid}`,
      );

      return cid;
    } catch (error) {
      this.logger.error(`Failed to upload file to IPFS: ${error.message}`);
      throw new BadRequestException('Failed to upload to IPFS');
    }
  }

  /**
   * Construct DID NFT metadata JSON
   * Based on DM-ID-001 from docs/SPECIFICATION.md Section 4
   *
   * @param user - User object from database
   * @param avatarIpfsCid - IPFS CID of user's avatar
   * @returns Metadata object (JSON-serializable)
   */
  constructDidNftMetadata(user: User, avatarIpfsCid?: string): Record<string, unknown> {
    const baseMetadata = {
      // NFT Metadata Standard (ERC721 / Hedera HTS)
      name: `DID #${user.id.substring(0, 8)}`,
      description: `Decentralized Identity NFT for ${user.displayName || 'User'}`,
      image: avatarIpfsCid ? `ipfs://${avatarIpfsCid}` : undefined,

      // Extended DID Metadata (DM-ID-001)
      type: 'DID-NFT',
      version: '1.0',
      issuer: 'hedera-social-platform',
      issuanceDate: new Date().toISOString(),
      subject: {
        id: `did:hedera:testnet:${user.hederaAccountId}`,
        accountType: user.accountType, // 'individual' | 'business'
      },

      // Individual Metadata
      ...(user.accountType === 'individual' && {
        individual: {
          displayName: user.displayName,
          bio: user.bio,
          email: user.email,
          phone: user.phone,
          kycLevel: user.kycLevel || 'basic',
        },
      }),

      // Business Metadata
      ...(user.accountType === 'business' && {
        business: {
          companyName: user.businessProfile?.companyName,
          registrationNumber: user.businessProfile?.registrationNumber,
          category: user.businessProfile?.businessCategory,
          website: user.businessProfile?.website,
          businessHours: user.businessProfile?.businessHours,
          kybLevel: user.businessProfile?.kybLevel || 'basic',
        },
      }),

      // Verification
      verification: {
        kyc_approved: user.status === 'active',
        kyc_timestamp: user.updatedAt?.toISOString(),
      },

      // Soulbound enforcement
      properties: {
        soulbound: true,
        transferable: false,
        burnable: false,
      },
    };

    // Filter out undefined values
    return JSON.parse(JSON.stringify(baseMetadata));
  }

  /**
   * Get gateway URL for a CID
   * Users can access uploaded files via this URL
   *
   * @param cid - IPFS CID
   * @returns Full HTTPS gateway URL
   */
  getGatewayUrl(cid: string): string {
    const gatewayUrl = this.configService.get('PINATA_GATEWAY_URL') ||
      'https://gateway.pinata.cloud/ipfs';
    return `${gatewayUrl}/${cid}`;
  }
}
```

### Step 3: Create KYC Controller and Service Layer

Create file `packages/api/src/kyc/controllers/kyc.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  FileInterceptor,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { KycService } from '../services/kyc.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('api/v1/kyc')
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(private kycService: KycService) {}

  /**
   * POST /api/v1/kyc/individual
   *
   * Submit KYC (individual identity verification)
   * Multipart form with: firstName, lastName, dateOfBirth, nationality, documentType, documentNumber, documentImage (file)
   *
   * REQUIRES: Valid JWT, user status = pending_kyc
   *
   * Response (202 Accepted):
   * ```json
   * {
   *   "screeningId": "mock_kyc_xxx",
   *   "status": "approved",
   *   "message": "KYC submitted successfully. Processing verification...",
   *   "estimatedTime": "3-5 business days"
   * }
   * ```
   */
  @Post('individual')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('documentImage'))
  @HttpCode(HttpStatus.ACCEPTED)
  async submitKycIndividual(
    @CurrentUser() user: { id: string; hederaAccountId: string; email?: string },
    @Body() body: { firstName: string; lastName: string; dateOfBirth: string; nationality: string; documentType: string; documentNumber: string },
    @UploadedFile() documentImage?: Express.Multer.File,
  ) {
    this.logger.log(`KYC submission (individual) by user ${user.id}`);

    try {
      return await this.kycService.submitKycIndividual(user.id, {
        firstName: body.firstName,
        lastName: body.lastName,
        dateOfBirth: body.dateOfBirth,
        nationality: body.nationality,
        documentType: body.documentType,
        documentNumber: body.documentNumber,
        documentImage: documentImage?.buffer,
      });
    } catch (error: unknown) {
      this.logger.error(`KYC submission failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * POST /api/v1/kyc/business
   *
   * Submit KYB (business identity verification)
   * Multipart form with: companyName, registrationNumber, businessCategory, authorizedRepName, businessDocument
   *
   * Response (202 Accepted): Same as individual
   */
  @Post('business')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('businessDocument'))
  @HttpCode(HttpStatus.ACCEPTED)
  async submitKybBusiness(
    @CurrentUser() user: { id: string; hederaAccountId: string; email?: string },
    @Body() body: { companyName: string; registrationNumber: string; businessCategory: string; authorizedRepName: string },
    @UploadedFile() businessDocument?: Express.Multer.File,
  ) {
    this.logger.log(`KYB submission (business) by user ${user.id}`);

    try {
      return await this.kycService.submitKybBusiness(user.id, {
        companyName: body.companyName,
        registrationNumber: body.registrationNumber,
        businessCategory: body.businessCategory,
        authorizedRepName: body.authorizedRepName,
        businessDocumentImage: businessDocument?.buffer,
      });
    } catch (error: unknown) {
      this.logger.error(`KYB submission failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * GET /api/v1/kyc/status/:userId
   *
   * Check KYC/KYB status
   * Public endpoint — returns basic status info
   *
   * Response (200 OK):
   * ```json
   * {
   *   "screeningId": "mock_kyc_xxx",
   *   "status": "approved",
   *   "kycLevel": "basic",
   *   "didNftSerial": 1,
   *   "lastUpdated": "2026-03-11T10:00:00Z"
   * }
   * ```
   */
  @Post('status/:screeningId')
  @HttpCode(HttpStatus.OK)
  async getKycStatus(@Body() { screeningId }: { screeningId: string }) {
    this.logger.log(`KYC status check for screening ${screeningId}`);

    try {
      return await this.kycService.getKycStatus(screeningId);
    } catch (error: unknown) {
      this.logger.error(`KYC status check failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
```

Create file `packages/api/src/kyc/services/kyc.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { MirsadAiService } from './mirsad-ai.service';
import { IpfsService } from '../../ipfs/services/ipfs.service';
import { IdentityService } from '../../hedera/services/identity.service';
import { UsersService } from '../../users/services/users.service';
import { HederaService } from '../../hedera/services/hedera.service';

/**
 * KYC Service — Orchestrates entire identity verification and DID NFT minting flow
 *
 * This is the most complex service in Phase 1:
 * 1. Submit KYC/KYB to Mirsad AI
 * 2. If approved, mint DID NFT:
 *    a. Upload metadata to IPFS
 *    b. Mint HTS token
 *    c. Freeze token (soulbound)
 *    d. Submit attestation to HCS topic
 *    e. Create feed + notification topics
 * 3. Update user status to 'active'
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private mirsadAiService: MirsadAiService,
    private ipfsService: IpfsService,
    private identityService: IdentityService,
    private hederaService: HederaService,
    private usersService: UsersService,
  ) {}

  /**
   * Submit KYC and handle DID NFT minting
   * Flow:
   * 1. Validate user state (must be pending_kyc)
   * 2. Submit to Mirsad AI
   * 3. If approved, mint DID NFT
   * 4. Create HCS topics
   * 5. Update user status to active
   *
   * @param userId - User's database ID
   * @param kycData - KYC form data
   * @returns Screening result and next steps
   */
  async submitKycIndividual(userId: string, kycData: {
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    nationality: string;
    documentType: string;
    documentNumber: string;
    documentImage?: Buffer;
  }): Promise<Record<string, unknown>> {
    // Fetch user
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException(`User ${userId} not found`);
    }

    // Validate user is in correct state
    if (user.status !== 'pending_kyc') {
      throw new ConflictException(
        `User status is ${user.status}, expected pending_kyc. ` +
        `Complete wallet creation first.`,
      );
    }

    if (!user.hederaAccountId) {
      throw new BadRequestException(
        `User does not have Hedera account. Create wallet first.`,
      );
    }

    // Update user display name from KYC data
    user.displayName = `${kycData.firstName} ${kycData.lastName}`;
    await this.usersService.update(userId, {
      displayName: user.displayName,
      accountType: 'individual',
    });

    this.logger.log(`KYC submission for user ${userId} (${user.displayName})`);

    try {
      // Step 1: Submit to Mirsad AI
      const mirsadResult = await this.mirsadAiService.submitKyc(userId, {
        firstName: kycData.firstName,
        lastName: kycData.lastName,
        dateOfBirth: kycData.dateOfBirth,
        nationality: kycData.nationality,
        documentType: kycData.documentType,
        documentNumber: kycData.documentNumber,
        documentImage: kycData.documentImage,
      });

      this.logger.log(
        `Mirsad AI screening result: ${mirsadResult.status} (ID: ${mirsadResult.screeningId})`,
      );

      // Step 2: If approved, mint DID NFT
      if (mirsadResult.status === 'approved') {
        await this.mintDidNftAndActivate(user, mirsadResult.screeningId);
      } else if (mirsadResult.status === 'rejected') {
        // Mark user as rejected
        await this.usersService.update(userId, {
          status: 'kyc_rejected',
        });
        throw new BadRequestException(
          'KYC was rejected. Please contact support or resubmit with different documents.',
        );
      } else {
        // pending_review — user must wait
        await this.usersService.update(userId, {
          status: 'kyc_submitted',
        });
      }

      return {
        screeningId: mirsadResult.screeningId,
        status: mirsadResult.status,
        message:
          mirsadResult.status === 'approved'
            ? 'KYC approved! Minting DID NFT and activating account...'
            : 'KYC submitted for review. We will notify you when verification is complete.',
        estimatedTime:
          mirsadResult.status === 'approved'
            ? 'Instant (mock mode)'
            : '3-5 business days',
      };
    } catch (error: unknown) {
      this.logger.error(`KYC submission failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Submit KYB and handle DID NFT minting for business
   * Similar to submitKycIndividual but for business accounts
   */
  async submitKybBusiness(userId: string, kybData: {
    companyName: string;
    registrationNumber: string;
    businessCategory: string;
    authorizedRepName: string;
    businessDocumentImage?: Buffer;
  }): Promise<Record<string, unknown>> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException(`User ${userId} not found`);
    }

    if (user.status !== 'pending_kyc') {
      throw new ConflictException(`User status is ${user.status}, expected pending_kyc`);
    }

    // Update business profile
    user.displayName = kybData.companyName;
    await this.usersService.update(userId, {
      displayName: user.displayName,
      accountType: 'business',
    });

    this.logger.log(`KYB submission for user ${userId} (${kybData.companyName})`);

    try {
      // Submit to Mirsad AI
      const mirsadResult = await this.mirsadAiService.submitKyb(userId, {
        companyName: kybData.companyName,
        registrationNumber: kybData.registrationNumber,
        businessCategory: kybData.businessCategory,
        authorizedRepName: kybData.authorizedRepName,
        businessDocumentImage: kybData.businessDocumentImage,
      });

      if (mirsadResult.status === 'approved') {
        await this.mintDidNftAndActivate(user, mirsadResult.screeningId);
      } else if (mirsadResult.status === 'rejected') {
        await this.usersService.update(userId, { status: 'kyc_rejected' });
        throw new BadRequestException('KYB was rejected.');
      } else {
        await this.usersService.update(userId, { status: 'kyc_submitted' });
      }

      return {
        screeningId: mirsadResult.screeningId,
        status: mirsadResult.status,
        message:
          mirsadResult.status === 'approved'
            ? 'KYB approved! Minting DID NFT...'
            : 'KYB submitted for review.',
        estimatedTime:
          mirsadResult.status === 'approved' ? 'Instant (mock mode)' : '3-5 business days',
      };
    } catch (error: unknown) {
      this.logger.error(`KYB submission failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * MAIN ORCHESTRATION: Mint DID NFT and activate user
   *
   * This is the most complex flow in the entire Phase 1:
   * 1. Build DID NFT metadata
   * 2. Upload metadata to IPFS
   * 3. Mint DID NFT token to user's Hedera account
   * 4. Freeze DID NFT (soulbound enforcement)
   * 5. Submit KYC attestation to HCS topic
   * 6. Create user's public feed HCS topic
   * 7. Create user's notification HCS topic
   * 8. If business: create broadcast HCS topic
   * 9. Update user status to 'active'
   *
   * @param user - User object from database
   * @param screeningId - Mirsad AI screening ID for audit trail
   */
  private async mintDidNftAndActivate(user: User, screeningId: string): Promise<void> {
    this.logger.log(
      `\n${'='.repeat(60)}\n` +
      `MINTING DID NFT FOR USER ${user.id}\n` +
      `${'='.repeat(60)}`,
    );

    try {
      // STEP 1: Build DID NFT metadata JSON
      this.logger.log('Step 1: Building DID NFT metadata...');
      const metadata = this.ipfsService.constructDidNftMetadata(user);
      this.logger.log(`Metadata keys: ${Object.keys(metadata).join(', ')}`);

      // STEP 2: Upload metadata to IPFS
      this.logger.log('Step 2: Uploading metadata to IPFS...');
      const metadataCid = await this.ipfsService.uploadJson(
        metadata,
        `did-nft-${user.id}.json`,
      );
      this.logger.log(`Metadata CID: ${metadataCid}`);

      // STEP 3: Mint DID NFT to user's account
      this.logger.log('Step 3: Minting DID NFT to Hedera account...');
      const mintResult = await this.hederaService.mintDidNft(
        user.hederaAccountId,
        metadataCid,
      );
      this.logger.log(`NFT minted: serial ${mintResult.serial}, txId: ${mintResult.transactionId}`);

      // STEP 4: Freeze DID NFT (soulbound)
      this.logger.log('Step 4: Freezing DID NFT (soulbound enforcement)...');
      await this.hederaService.freezeToken(user.hederaAccountId);
      this.logger.log('NFT frozen successfully');

      // STEP 5: Submit KYC attestation to HCS topic
      this.logger.log('Step 5: Submitting KYC attestation to HCS...');
      await this.hederaService.submitKycAttestation({
        hederaAccountId: user.hederaAccountId,
        screeningId,
        didNftSerial: mintResult.serial,
        kycLevel: 'basic',
        timestamp: new Date().toISOString(),
      });
      this.logger.log('KYC attestation submitted to HCS');

      // STEP 6: Create public feed HCS topic
      this.logger.log('Step 6: Creating public feed HCS topic...');
      const feedTopic = await this.hederaService.createPublicFeedTopic(
        user.hederaAccountId,
      );
      this.logger.log(`Public feed topic: ${feedTopic}`);

      // STEP 7: Create notification HCS topic
      this.logger.log('Step 7: Creating notification HCS topic...');
      const notificationTopic = await this.hederaService.createNotificationTopic(
        user.hederaAccountId,
      );
      this.logger.log(`Notification topic: ${notificationTopic}`);

      // STEP 8: Create broadcast topic if business account
      let broadcastTopic: string | null = null;
      if (user.accountType === 'business') {
        this.logger.log('Step 8: Creating broadcast HCS topic (business account)...');
        broadcastTopic = await this.hederaService.createBroadcastTopic(
          user.hederaAccountId,
        );
        this.logger.log(`Broadcast topic: ${broadcastTopic}`);
      }

      // STEP 9: Update user status to ACTIVE
      this.logger.log('Step 9: Updating user status to active...');
      await this.usersService.update(user.id, {
        status: 'active',
        didNftSerial: mintResult.serial,
        didNftMetadataCid: metadataCid,
        kycLevel: 'basic',
        publicFeedTopic: feedTopic,
        notificationTopic: notificationTopic,
        broadcastTopic: broadcastTopic || undefined,
      });

      this.logger.log(
        `\n${'='.repeat(60)}\n` +
        `USER ${user.id} FULLY ONBOARDED!\n` +
        `Status: ACTIVE\n` +
        `DID NFT: ${mintResult.serial} (CID: ${metadataCid})\n` +
        `Feed Topic: ${feedTopic}\n` +
        `Notification Topic: ${notificationTopic}\n` +
        `${broadcastTopic ? `Broadcast Topic: ${broadcastTopic}\n` : ''}` +
        `${'='.repeat(60)}\n`,
      );
    } catch (error) {
      this.logger.error(`DID NFT minting failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Check KYC/KYB status
   * User can poll this to check if screening is complete
   *
   * @param screeningId - Mirsad AI screening ID
   * @returns Status and result
   */
  async getKycStatus(screeningId: string): Promise<Record<string, unknown>> {
    try {
      return await this.mirsadAiService.getScreeningStatus(screeningId);
    } catch (error) {
      this.logger.error(`Failed to get KYC status: ${error.message}`);
      throw error;
    }
  }
}
```

### Step 4: Create Hedera Extended Service

Create file `packages/api/src/hedera/services/hedera.service.ts`:

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  TokenMintTransaction,
  TokenFreezeTransaction,
  TopicCreateTransaction,
  TopicSubmitMessageTransaction,
  SubmitMessageParams,
  TokenId,
  AccountId,
} from '@hashgraph/sdk';

/**
 * Extended Hedera Service — Token minting, HCS topics, attestations
 * Orchestrates all Hedera transactions for DID NFT and topic creation
 */
@Injectable()
export class HederaService {
  private readonly logger = new Logger(HederaService.name);
  private client: Client;

  constructor(private configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient(): void {
    const network = this.configService.get('HEDERA_NETWORK') || 'testnet';
    const operatorId = this.configService.get('HEDERA_OPERATOR_ID');
    const operatorKey = this.configService.get('HEDERA_OPERATOR_KEY');

    if (network === 'testnet') {
      this.client = Client.forTestnet();
    } else {
      this.client = Client.forMainnet();
    }

    this.client.setOperator(operatorId, operatorKey);
  }

  /**
   * Mint DID NFT (Decentralized Identifier NFT)
   * Mints a single unique NFT from the DID token to the user's account
   * Metadata URI points to IPFS CID
   *
   * @param hederaAccountId - User's Hedera Account ID (0.0.XXXXX)
   * @param metadataCid - IPFS CID of NFT metadata
   * @returns Serial number and transaction ID
   */
  async mintDidNft(hederaAccountId: string, metadataCid: string): Promise<{
    serial: number;
    transactionId: string;
  }> {
    try {
      const didTokenId = this.configService.get('HEDERA_DID_TOKEN_ID');
      if (!didTokenId) {
        throw new BadRequestException(
          'HEDERA_DID_TOKEN_ID not configured. Run P0-T08 setup first.',
        );
      }

      this.logger.log(
        `Minting DID NFT to ${hederaAccountId}\n` +
        `  Token: ${didTokenId}\n` +
        `  Metadata CID: ${metadataCid}`,
      );

      // Construct metadata URL pointing to IPFS
      const metadataUrl = `ipfs://${metadataCid}`;

      // Mint transaction
      const transaction = new TokenMintTransaction()
        .setTokenId(didTokenId)
        .setMetadata([Buffer.from(metadataUrl)])
        .freezeWith(this.client);

      // Submit
      const transactionResponse = await transaction.execute(this.client);
      const receipt = await transactionResponse.getReceipt(this.client);

      // Get serial number from receipt
      const serial = receipt.serials?.[0] || 1;
      const transactionId = transactionResponse.transactionId.toString();

      this.logger.log(`DID NFT minted: serial #${serial}, txId: ${transactionId}`);

      return { serial, transactionId };
    } catch (error) {
      this.logger.error(`Failed to mint DID NFT: ${error.message}`);
      throw error;
    }
  }

  /**
   * Freeze token on user's account (soulbound enforcement)
   * After freezing, user cannot transfer the NFT
   *
   * @param hederaAccountId - User's Hedera Account ID
   */
  async freezeToken(hederaAccountId: string): Promise<void> {
    try {
      const didTokenId = this.configService.get('HEDERA_DID_TOKEN_ID');

      this.logger.log(`Freezing DID token on ${hederaAccountId}`);

      const transaction = new TokenFreezeTransaction()
        .setTokenId(didTokenId)
        .setAccount(hederaAccountId)
        .freezeWith(this.client);

      const transactionResponse = await transaction.execute(this.client);
      await transactionResponse.getReceipt(this.client);

      this.logger.log(`Token frozen on ${hederaAccountId}`);
    } catch (error) {
      this.logger.error(`Failed to freeze token: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create public feed HCS topic for user's posts
   * Topic is public (anyone can read), only user can post (submitKey = user's key)
   *
   * @param hederaAccountId - User's Hedera Account ID
   * @returns Topic ID (0.0.XXXXX)
   */
  async createPublicFeedTopic(hederaAccountId: string): Promise<string> {
    try {
      this.logger.log(`Creating public feed topic for ${hederaAccountId}`);

      // For simplicity, create without submitKey (fully public)
      // In production, set submitKey to user's account key
      const transaction = new TopicCreateTransaction()
        .freezeWith(this.client);

      const transactionResponse = await transaction.execute(this.client);
      const receipt = await transactionResponse.getReceipt(this.client);
      const topicId = receipt.topicId?.toString();

      this.logger.log(`Public feed topic created: ${topicId}`);

      return topicId;
    } catch (error) {
      this.logger.error(`Failed to create feed topic: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create notification HCS topic for user's notifications
   * System posts notifications here
   *
   * @param hederaAccountId - User's Hedera Account ID
   * @returns Topic ID
   */
  async createNotificationTopic(hederaAccountId: string): Promise<string> {
    try {
      this.logger.log(`Creating notification topic for ${hederaAccountId}`);

      const transaction = new TopicCreateTransaction()
        .freezeWith(this.client);

      const transactionResponse = await transaction.execute(this.client);
      const receipt = await transactionResponse.getReceipt(this.client);
      const topicId = receipt.topicId?.toString();

      this.logger.log(`Notification topic created: ${topicId}`);

      return topicId;
    } catch (error) {
      this.logger.error(`Failed to create notification topic: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create broadcast HCS topic (business accounts only)
   * Business can post to followers' feeds
   *
   * @param hederaAccountId - Business account Hedera ID
   * @returns Topic ID
   */
  async createBroadcastTopic(hederaAccountId: string): Promise<string> {
    try {
      this.logger.log(`Creating broadcast topic for business ${hederaAccountId}`);

      const transaction = new TopicCreateTransaction()
        .freezeWith(this.client);

      const transactionResponse = await transaction.execute(this.client);
      const receipt = await transactionResponse.getReceipt(this.client);
      const topicId = receipt.topicId?.toString();

      this.logger.log(`Broadcast topic created: ${topicId}`);

      return topicId;
    } catch (error) {
      this.logger.error(`Failed to create broadcast topic: ${error.message}`);
      throw error;
    }
  }

  /**
   * Submit KYC attestation to HCS topic
   * Records that user's KYC was approved on-chain
   * Includes: Account ID, serial number, KYC level, screening ID
   *
   * @param attestation - Attestation data
   */
  async submitKycAttestation(attestation: {
    hederaAccountId: string;
    screeningId: string;
    didNftSerial: number;
    kycLevel: string;
    timestamp: string;
  }): Promise<void> {
    try {
      const kycTopicId = this.configService.get('HEDERA_KYC_ATTESTATION_TOPIC');
      if (!kycTopicId) {
        this.logger.warn(
          'HEDERA_KYC_ATTESTATION_TOPIC not configured, skipping attestation submission',
        );
        return;
      }

      this.logger.log(`Submitting KYC attestation to topic ${kycTopicId}`);

      const attestationMessage = {
        type: 'kyc_attestation',
        account: attestation.hederaAccountId,
        screeningId: attestation.screeningId,
        nftSerial: attestation.didNftSerial,
        kycLevel: attestation.kycLevel,
        timestamp: attestation.timestamp,
      };

      const transaction = new TopicSubmitMessageTransaction()
        .setTopicId(kycTopicId)
        .setMessage(JSON.stringify(attestationMessage))
        .freezeWith(this.client);

      const transactionResponse = await transaction.execute(this.client);
      await transactionResponse.getReceipt(this.client);

      this.logger.log('KYC attestation submitted');
    } catch (error) {
      this.logger.error(`Failed to submit attestation: ${error.message}`);
      // Don't throw — attestation submission is non-blocking
    }
  }

  /**
   * Close client on shutdown
   */
  async close(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.logger.log('Hedera client closed');
    }
  }
}
```

### Step 5: Create KYC Module

Create file `packages/api/src/kyc/kyc.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { KycService } from './services/kyc.service';
import { MirsadAiService } from './services/mirsad-ai.service';
import { KycController } from './controllers/kyc.controller';
import { IpfsModule } from '../ipfs/ipfs.module';
import { HederaModule } from '../hedera/hedera.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [IpfsModule, HederaModule, UsersModule],
  providers: [KycService, MirsadAiService],
  controllers: [KycController],
  exports: [KycService, MirsadAiService],
})
export class KycModule {}
```

Create file `packages/api/src/ipfs/ipfs.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { IpfsService } from './services/ipfs.service';

@Module({
  imports: [ConfigModule],
  providers: [IpfsService],
  exports: [IpfsService],
})
export class IpfsModule {}
```

### Step 6: Update AppModule

Edit `packages/api/src/app.module.ts` to add KycModule and IpfsModule:

```typescript
import { Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RedisModule } from './redis/redis.module';
import { HederaModule } from './hedera/hedera.module';
import { KycModule } from './kyc/kyc.module';
import { IpfsModule } from './ipfs/ipfs.module';
import { HederaService } from './hedera/services/hedera.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRoot({...}),
    AuthModule,
    UsersModule,
    RedisModule,
    HederaModule,
    KycModule,
    IpfsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleDestroy {
  constructor(private hederaService: HederaService) {}

  async onModuleDestroy() {
    await this.hederaService.close();
  }
}
```

---

## Verification Steps

| # | Command | Expected Output |
|---|---------|-----------------|
| 1 | `pnpm --filter @hedera-social/api start:dev` | Server starts, all modules initialize |
| 2 | **Complete auth flow first** (from P1-T09 and P1-T10) | User has JWT and Hedera Account ID |
| 3 | **CURL TEST 1 - Submit KYC:** `curl -X POST http://localhost:3001/api/v1/kyc/individual -H "Authorization: Bearer {token}" -F "firstName=John" -F "lastName=Doe" -F "dateOfBirth=1990-01-01" -F "nationality=US" -F "documentType=passport" -F "documentNumber=ABC123" -F "documentImage=@passport.jpg"` | Returns 202 Accepted with screeningId |
| 4 | **Check logs** for KYC submission | Shows message: `KYC approved! Minting DID NFT...` |
| 5 | **Check logs** for DID NFT minting steps | Shows all 9 steps of minting process |
| 6 | **DATABASE CHECK:** `docker exec hedera-social-postgres psql -U hedera_social -d hedera_social -c "SELECT status, kyc_level, did_nft_serial, public_feed_topic FROM users WHERE id='...';"` | Shows: status='active', kycLevel='basic', didNftSerial=1, publicFeedTopic populated |
| 7 | **IPFS CHECK:** Metadata uploaded | Logs show: `Metadata uploaded to IPFS: CID: Qm...` |
| 8 | **HEDERA CHECK:** Mint transaction | Logs show: `DID NFT minted: serial #1, txId: 0.0.X@Y.Z` |

---

## Definition of Done

- [ ] MirsadAiService created with KYC/KYB submission (mock auto-approval)
- [ ] IpfsService created with metadata upload and gateway URL construction
- [ ] KycService created with full DID NFT minting orchestration
- [ ] HederaService extended with:
  - [ ] mintDidNft() for token minting
  - [ ] freezeToken() for soulbound enforcement
  - [ ] createPublicFeedTopic(), createNotificationTopic(), createBroadcastTopic()
  - [ ] submitKycAttestation() for HCS attestation
- [ ] KycController endpoints working:
  - [ ] POST /api/v1/kyc/individual (requires JWT, multipart form)
  - [ ] POST /api/v1/kyc/business (requires JWT, multipart form)
  - [ ] GET /api/v1/kyc/status/:screeningId (public)
- [ ] Complete DID NFT minting flow:
  - [ ] Metadata JSON constructed with user data
  - [ ] Metadata uploaded to IPFS (CID received)
  - [ ] NFT minted to user's Hedera account
  - [ ] NFT frozen (soulbound)
  - [ ] KYC attestation submitted to HCS
  - [ ] Feed + notification topics created
  - [ ] User status updated to 'active'
- [ ] All tests pass:
  - [ ] User can submit KYC after wallet creation
  - [ ] Mirsad AI mock returns approved status
  - [ ] DID NFT is minted successfully
  - [ ] User can be marked as fully onboarded (status='active')
  - [ ] Public feed and notification topics are created
- [ ] Database schema updated:
  - [ ] didNftSerial, didNftMetadataCid, publicFeedTopic, notificationTopic, broadcastTopic columns added
- [ ] Logs show all 9 steps of DID NFT minting
- [ ] Warning displayed about private key storage (HACKATHON MODE)
- [ ] Git commit: `"feat(P1-T11): implement KYC/KYB and DID NFT minting flow"`

---

## Troubleshooting

**Problem:** Pinata upload fails with "credentials not found"
**Fix:** Sign up at https://www.pinata.cloud, generate API key, add to .env:
```env
PINATA_API_KEY=pk_xxx
PINATA_SECRET_KEY=sk_xxx
```

**Problem:** Token minting fails with "HEDERA_DID_TOKEN_ID not configured"
**Fix:** Run P0-T08 (Hedera setup) first to create the DID token, add to .env:
```env
HEDERA_DID_TOKEN_ID=0.0.XXXXX
```

**Problem:** HCS topic creation fails
**Fix:** Make sure HEDERA_OPERATOR_ID account has enough HBAR (min 1 HBAR per topic creation)

**Problem:** DID NFT serial number not appearing in database
**Fix:** Check database migration — ensure didNftSerial column exists with integer type

---

## Files Created in This Task

```
packages/api/src/
├── kyc/
│   ├── services/
│   │   ├── mirsad-ai.service.ts
│   │   └── kyc.service.ts
│   ├── controllers/
│   │   └── kyc.controller.ts
│   └── kyc.module.ts
├── ipfs/
│   ├── services/
│   │   └── ipfs.service.ts
│   └── ipfs.module.ts
├── hedera/services/hedera.service.ts (NEW - extended version)
└── app.module.ts (UPDATED)
```

---

## What Happens Next

After this task is complete:
- **User is fully onboarded** — status='active', has DID NFT, can use platform
- **P1-T12** — Profile CRUD (read/update user profiles)
- **P1-T13** — Frontend Onboarding UI (can call all auth/kyc endpoints)
- **P2-T14** — Payments (can send HBAR using wallet)
- **P2-T15** — Messaging (can create conversations, post messages)
