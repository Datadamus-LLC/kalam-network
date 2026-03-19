import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { Repository } from "typeorm";
import { UserEntity } from "../../../database/entities/user.entity";
import { HederaService } from "../../hedera/hedera.service";
import { DidNftService } from "./did-nft.service";
import {
  OnboardingException,
  TopicCreationException,
} from "../exceptions/kyc.exception";
import { UserNotFoundException } from "../exceptions/wallet-creation.exception";

/**
 * Result of the full onboarding flow after KYC approval.
 */
export interface OnboardingResult {
  userId: string;
  hederaAccountId: string;
  didNft: {
    serial: number;
    transactionId: string;
    metadataCid: string;
    tokenId: string;
  };
  topics: {
    publicFeedTopic: string;
    notificationTopic: string;
  };
  status: string;
}

/**
 * OnboardingService — orchestrates the complete post-KYC onboarding flow.
 *
 * This service is triggered when Mirsad AI approves a user's KYC.
 * It performs the following steps in order:
 *
 * 1. Mint a soulbound DID NFT to the user's Hedera account
 * 2. Create an HCS topic for the user's public feed
 * 3. Create an HCS topic for the user's notification inbox
 * 4. Submit KYC attestation to the platform's KYC attestation topic (if configured)
 * 5. Update the user record with all generated IDs
 * 6. Mark user status as 'active'
 *
 * If any step fails, the service logs the error but does NOT roll back
 * previous steps (Hedera transactions are irreversible). Instead, it stores
 * partial state so the flow can be retried/completed later.
 *
 * Reference: tasks/phase-1-identity/P1-T11-kyc-did-nft.md
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly didNftService: DidNftService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Execute the full post-KYC onboarding flow for a user.
   *
   * Called after Mirsad AI approves KYC via the callback handler.
   *
   * @param userId - Platform user ID whose KYC was approved
   * @returns OnboardingResult with all generated Hedera resources
   * @throws UserNotFoundException if user does not exist
   * @throws OnboardingException if critical onboarding steps fail
   */
  async completeOnboarding(userId: string): Promise<OnboardingResult> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    if (!user.hederaAccountId) {
      throw new OnboardingException(
        `User ${userId} has no Hedera account. Wallet must be created before onboarding.`,
        "NO_HEDERA_ACCOUNT",
      );
    }

    this.logger.log(
      `Starting post-KYC onboarding for user ${userId} (${user.hederaAccountId})`,
    );

    // Step 1: Mint DID NFT
    const didNftResult = await this.mintDidNft(user);

    // Step 2: Create HCS topics for feed and notifications (skip if already set by wallet service)
    let topics: { publicFeedTopic: string; notificationTopic: string };
    if (user.publicFeedTopic && user.notificationTopic) {
      this.logger.log(
        `[Step 2/4] User ${user.id} already has HCS topics — skipping creation`,
      );
      topics = {
        publicFeedTopic: user.publicFeedTopic,
        notificationTopic: user.notificationTopic,
      };
    } else {
      topics = await this.createUserTopics(user);
    }

    // Step 3: Submit KYC attestation to platform topic (non-critical)
    await this.submitKycAttestation(user, didNftResult.serial);

    // Step 4: Update user record with all onboarding data
    await this.userRepository.update(userId, {
      status: "active",
      didNftSerial: didNftResult.serial,
      didNftMetadataCid: didNftResult.metadataCid,
      publicFeedTopic: topics.publicFeedTopic,
      notificationTopic: topics.notificationTopic,
      kycLevel: "basic",
    });

    this.logger.log(
      `Onboarding complete for user ${userId} — ` +
        `DID NFT serial: ${didNftResult.serial}, ` +
        `Feed topic: ${topics.publicFeedTopic}, ` +
        `Notification topic: ${topics.notificationTopic}, ` +
        `Status: active`,
    );

    return {
      userId,
      hederaAccountId: user.hederaAccountId,
      didNft: didNftResult,
      topics,
      status: "active",
    };
  }

  // -------------------------------------------------------------------------
  // Private orchestration steps
  // -------------------------------------------------------------------------

  /**
   * Step 1: Mint a soulbound DID NFT.
   */
  private async mintDidNft(user: UserEntity): Promise<{
    serial: number;
    transactionId: string;
    metadataCid: string;
    tokenId: string;
  }> {
    this.logger.log(`[Step 1/4] Minting DID NFT for user ${user.id}`);

    const metadata = this.didNftService.buildMetadata({
      hederaAccountId: user.hederaAccountId ?? "",
      accountType: user.accountType === "business" ? "business" : "individual",
      kycLevel: "basic",
      displayName: user.displayName ?? "",
      bio: user.bio ?? "",
      avatarIpfsCid: user.avatarIpfsCid ?? undefined,
    });

    try {
      return await this.didNftService.mintDidNft(
        metadata,
        user.hederaAccountId ?? "",
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `[Step 1/4] DID NFT minting failed for user ${user.id}: ${message}`,
      );
      throw new OnboardingException(
        `DID NFT minting failed: ${message}`,
        "DID_NFT_MINT_FAILED",
      );
    }
  }

  /**
   * Step 2: Create HCS topics for user's public feed and notification inbox.
   */
  private async createUserTopics(user: UserEntity): Promise<{
    publicFeedTopic: string;
    notificationTopic: string;
  }> {
    this.logger.log(`[Step 2/4] Creating HCS topics for user ${user.id}`);

    let publicFeedTopic: string;
    let notificationTopic: string;

    // Create public feed topic
    try {
      publicFeedTopic = await this.hederaService.createTopic({
        memo: `Hedera Social — Public Feed for ${user.hederaAccountId}`,
      });
      this.logger.log(
        `Created public feed topic ${publicFeedTopic} for user ${user.id}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `[Step 2/4] Public feed topic creation failed for user ${user.id}: ${message}`,
      );
      throw new TopicCreationException(
        `Failed to create public feed topic: ${message}`,
        "PUBLIC_FEED_TOPIC_FAILED",
      );
    }

    // Create notification inbox topic
    try {
      notificationTopic = await this.hederaService.createTopic({
        memo: `Hedera Social — Notifications for ${user.hederaAccountId}`,
      });
      this.logger.log(
        `Created notification topic ${notificationTopic} for user ${user.id}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `[Step 2/4] Notification topic creation failed for user ${user.id}: ${message}`,
      );
      throw new TopicCreationException(
        `Failed to create notification topic: ${message}`,
        "NOTIFICATION_TOPIC_FAILED",
      );
    }

    return { publicFeedTopic, notificationTopic };
  }

  /**
   * Step 3: Submit KYC attestation to the platform's KYC attestation HCS topic.
   * This creates an immutable on-chain record of the KYC approval.
   *
   * Non-critical: if this fails, onboarding continues but a warning is logged.
   */
  private async submitKycAttestation(
    user: UserEntity,
    didNftSerial: number,
  ): Promise<void> {
    const topicId = this.configService.get<string>(
      "hedera.kycAttestationTopic",
    );

    if (!topicId) {
      this.logger.log(
        `[Step 3/4] KYC attestation topic not configured — skipping attestation submission`,
      );
      return;
    }

    this.logger.log(
      `[Step 3/4] Submitting KYC attestation for user ${user.id}`,
    );

    const attestation = {
      version: 1,
      type: "kyc_attestation",
      userId: user.id,
      hederaAccountId: user.hederaAccountId,
      accountType: user.accountType,
      kycLevel: "basic",
      kycProvider: "mirsad-ai",
      didNftSerial,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.hederaService.submitMessage(
        topicId,
        Buffer.from(JSON.stringify(attestation)),
      );
      this.logger.log(
        `[Step 3/4] KYC attestation submitted for user ${user.id}`,
      );
    } catch (error: unknown) {
      // Non-critical failure — log warning but continue onboarding
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.warn(
        `[Step 3/4] KYC attestation submission failed for user ${user.id}: ${message}. ` +
          `Onboarding will continue without attestation.`,
      );
    }
  }
}
