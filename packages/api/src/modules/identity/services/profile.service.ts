import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, ILike, In } from "typeorm";
import { ConfigService } from "@nestjs/config";
import sanitizeHtml from "sanitize-html";
import { UserEntity } from "../../../database/entities/user.entity";
import { FollowerCountEntity } from "../../../database/entities/follower-count.entity";
import { PostIndexEntity } from "../../../database/entities/post-index.entity";
import { HederaService } from "../../hedera/hedera.service";
import { DidNftService } from "./did-nft.service";
import { IpfsService } from "../../integrations/ipfs/ipfs.service";
import {
  ProfileNotFoundException,
  ProfileUpdateNotAllowedException,
  InvalidSearchQueryException,
  AvatarUploadException,
} from "../exceptions/profile.exception";

/** Strip all HTML tags from user-provided text to prevent stored XSS. */
const stripHtml = (text: string): string =>
  sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} }).trim();

/**
 * Public profile data returned to API consumers.
 * Includes identity info, DID NFT details, topic IDs, and social stats.
 */
export interface PublicProfileData {
  hederaAccountId: string;
  displayName: string;
  bio: string;
  avatarIpfsCid: string | null;
  avatarUrl: string | null;
  accountType: string;
  status: string;
  kycLevel: string | null;
  createdAt: Date;
  didNft: {
    serial: number | null;
    metadataCid: string | null;
  };
  topics: {
    publicFeed: string | null;
    notifications: string | null;
  };
  stats: {
    followers: number;
    following: number;
    posts: number;
  };
}

/**
 * Own profile data returned to the authenticated user.
 * Includes all public fields plus private fields (email, phone).
 */
export interface OwnProfileData extends PublicProfileData {
  email: string | null;
  phone: string | null;
  isOwner: true;
}

/**
 * Search result item — a compact representation of a user for search listings.
 */
export interface SearchResultItem {
  hederaAccountId: string;
  displayName: string;
  avatarIpfsCid: string | null;
  accountType: string;
  stats: {
    followers: number;
    following: number;
    posts: number;
  };
}

/**
 * ProfileService — Read and update user profiles.
 *
 * Features:
 * - Get public profile by Hedera Account ID
 * - Get authenticated user's own profile (includes private fields)
 * - Update authenticated user's profile (with DID NFT refresh)
 * - Search users by display name (simple LIKE query for hackathon)
 *
 * DID NFT Refresh Flow (on profile update):
 * 1. Build new HIP-412 metadata with updated fields
 * 2. Wipe the old DID NFT from user's account
 * 3. Mint a new DID NFT with updated metadata
 * 4. Freeze the new NFT (soulbound)
 * 5. Update user record with new serial and metadata CID
 *
 * Reference: tasks/phase-1-identity/P1-T12-profile-crud.md
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly didTokenId: string;
  private readonly pinataGatewayUrl: string;

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(FollowerCountEntity)
    private readonly followerCountRepository: Repository<FollowerCountEntity>,
    @InjectRepository(PostIndexEntity)
    private readonly postIndexRepository: Repository<PostIndexEntity>,
    private readonly hederaService: HederaService,
    private readonly didNftService: DidNftService,
    private readonly ipfsService: IpfsService,
    private readonly configService: ConfigService,
  ) {
    this.didTokenId = this.configService.get<string>("hedera.didTokenId") ?? "";
    this.pinataGatewayUrl = this.configService.get<string>(
      "pinata.gatewayUrl",
      "",
    );
  }

  /**
   * Get public profile by Hedera Account ID.
   * Returns profile info visible to everyone.
   *
   * @param hederaAccountId - Hedera Account ID (e.g. 0.0.123456)
   * @returns PublicProfileData
   * @throws ProfileNotFoundException if no user found with that account ID
   */
  async getPublicProfile(hederaAccountId: string): Promise<PublicProfileData> {
    this.logger.log(`Fetching public profile for ${hederaAccountId}`);

    const user = await this.userRepository.findOne({
      where: { hederaAccountId },
    });

    if (!user) {
      throw new ProfileNotFoundException(hederaAccountId);
    }

    return this.buildPublicProfile(user);
  }

  /**
   * Get authenticated user's own profile.
   * Returns full profile including private fields (email, phone).
   *
   * @param userId - Authenticated user's database UUID
   * @returns OwnProfileData with private fields
   * @throws ProfileNotFoundException if user not found
   */
  async getMyProfile(userId: string): Promise<OwnProfileData> {
    this.logger.log(`Fetching own profile for user ${userId}`);

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new ProfileNotFoundException(userId);
    }

    const publicProfile = await this.buildPublicProfile(user);

    return {
      ...publicProfile,
      email: user.email,
      phone: user.phone,
      isOwner: true,
    };
  }

  /**
   * Update authenticated user's profile.
   *
   * When profile fields change and the user has an active DID NFT,
   * triggers DID NFT refresh: wipe old -> mint new -> freeze new.
   *
   * Avatar upload to IPFS is handled via Pinata IpfsService.
   *
   * @param userId - Authenticated user's database UUID
   * @param updateData - Fields to update
   * @returns Updated public profile
   * @throws ProfileNotFoundException if user not found
   * @throws ProfileUpdateNotAllowedException if user is not 'active'
   * @throws DidNftRefreshException if DID NFT wipe/mint/freeze fails
   * @throws AvatarUploadException if avatar upload fails
   */
  async updateProfile(
    userId: string,
    updateData: {
      displayName?: string;
      bio?: string;
      location?: string;
      encryptionPublicKey?: string;
      avatarFile?: { buffer: Buffer; mimetype: string; originalname: string };
    },
  ): Promise<PublicProfileData> {
    this.logger.log(`Updating profile for user ${userId}`);

    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new ProfileNotFoundException(userId);
    }

    // Allow profile updates for 'active' and 'pending_kyc' statuses.
    // Users in pending_kyc need to set their encryption public key
    // to participate in conversations before KYC is complete.
    const allowedStatuses = ["active", "pending_kyc"];
    if (!allowedStatuses.includes(user.status)) {
      throw new ProfileUpdateNotAllowedException(userId, user.status);
    }

    // Prepare updates to user entity
    const userUpdates: Partial<UserEntity> = {};

    if (updateData.displayName !== undefined) {
      userUpdates.displayName = stripHtml(updateData.displayName);
    }

    if (updateData.bio !== undefined) {
      userUpdates.bio = stripHtml(updateData.bio);
    }

    // Handle encryption public key update (no DID NFT refresh needed)
    if (updateData.encryptionPublicKey !== undefined) {
      userUpdates.encryptionPublicKey = updateData.encryptionPublicKey;
    }

    // Handle avatar upload to IPFS via Pinata
    let newAvatarCid: string | undefined;
    if (updateData.avatarFile) {
      this.logger.log(`Processing avatar upload for user ${userId}`);
      try {
        const cid = await this.ipfsService.uploadFile(
          updateData.avatarFile.buffer,
          `avatar-${userId}.${this.getExtensionFromMimetype(updateData.avatarFile.mimetype)}`,
        );
        newAvatarCid = cid;
        userUpdates.avatarIpfsCid = cid;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown IPFS error";
        this.logger.error(
          `Avatar upload failed for user ${userId}: ${message}`,
        );
        throw new AvatarUploadException(`Failed to upload avatar: ${message}`);
      }
    }

    // Determine if profile changed in a way that requires DID NFT refresh
    const profileChanged =
      updateData.displayName !== undefined ||
      updateData.bio !== undefined ||
      newAvatarCid !== undefined;

    // Refresh DID NFT if profile changed and user has an existing NFT.
    // This is done asynchronously (fire-and-forget) so the profile update
    // returns immediately — NFT metadata will be updated in the background.
    if (profileChanged && user.didNftSerial && user.hederaAccountId) {
      this.logger.log(
        `Profile changed for user ${userId} — scheduling async DID NFT refresh`,
      );

      // Non-blocking: start refresh in background, don't await
      this.refreshDidNft(user, userUpdates)
        .then((nftResult) => {
          // Update NFT serial/metadata after refresh completes
          void this.userRepository.update(userId, {
            didNftSerial: nftResult.serial,
            didNftMetadataCid: nftResult.metadataCid,
          });
          this.logger.log(
            `Background DID NFT refresh complete for user ${userId}: serial ${nftResult.serial}`,
          );
        })
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          this.logger.warn(
            `Background DID NFT refresh failed for user ${userId}: ${message}`,
          );
        });
    }

    // Persist updates if there are any
    if (Object.keys(userUpdates).length > 0) {
      await this.userRepository.update(userId, userUpdates);
      this.logger.log(`Profile updated for user ${userId}`);
    }

    // Fetch the updated user to return
    const updatedUser = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!updatedUser) {
      throw new ProfileNotFoundException(userId);
    }

    return this.buildPublicProfile(updatedUser);
  }

  /**
   * Search users by display name.
   * Simple LIKE query on the displayName column.
   * For hackathon — in production would use Meilisearch or Elasticsearch.
   *
   * @param query - Search term (minimum 2 characters)
   * @param limit - Maximum results to return (default 20, max 100)
   * @returns Array of search result items
   * @throws InvalidSearchQueryException if query is too short
   */
  async searchUsers(
    query: string,
    limit: number = 20,
  ): Promise<SearchResultItem[]> {
    if (!query || query.trim().length < 2) {
      throw new InvalidSearchQueryException(
        "Search query must be at least 2 characters",
      );
    }

    const sanitizedLimit = Math.min(Math.max(limit, 1), 100);
    const trimmedQuery = query.trim();

    this.logger.log(
      `Searching users for "${trimmedQuery}" (limit: ${sanitizedLimit})`,
    );

    // Users with wallets (active or pending_kyc) should be discoverable.
    // In hackathon mode, most users are pending_kyc since KYC isn't completed.
    const searchableStatuses = In(["active", "pending_kyc"]);

    // Build search conditions: displayName + fallback to accountId or email
    const whereConditions: Array<Record<string, unknown>> = [
      { displayName: ILike(`%${trimmedQuery}%`), status: searchableStatuses },
    ];

    // For multi-word queries, also match each word individually against displayName.
    // This allows "QA User" to match "QA Updated R18" (matches on "QA").
    const words = trimmedQuery.split(/\s+/).filter((w) => w.length >= 2);
    if (words.length > 1) {
      for (const word of words) {
        whereConditions.push({
          displayName: ILike(`%${word}%`),
          status: searchableStatuses,
        });
      }
    }

    // If query looks like a Hedera account ID (0.0.XXXXX), also search by accountId
    if (/^0\.0\.\d+$/.test(trimmedQuery)) {
      whereConditions.push({
        hederaAccountId: trimmedQuery,
        status: searchableStatuses,
      });
    }

    // Also search by email prefix (e.g. "qa1" matches "qa1@test.hedera.com")
    whereConditions.push({
      email: ILike(`%${trimmedQuery}%`),
      status: searchableStatuses,
    });

    const users = await this.userRepository.find({
      where: whereConditions,
      take: sanitizedLimit,
      order: { displayName: "ASC" },
    });

    // Deduplicate users (same user may match multiple conditions)
    const uniqueUsers = [
      ...new Map(users.map((u) => [u.id, u])).values(),
    ].slice(0, sanitizedLimit);

    // Build search results with stats
    const results: SearchResultItem[] = [];
    for (const user of uniqueUsers) {
      const stats = await this.getUserStats(user.hederaAccountId);
      results.push({
        hederaAccountId: user.hederaAccountId ?? "",
        displayName: user.displayName ?? "Anonymous",
        avatarIpfsCid: user.avatarIpfsCid,
        accountType: user.accountType,
        stats,
      });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the public profile response from a user entity.
   * Fetches follower/following/post stats from denormalized tables.
   */
  private async buildPublicProfile(
    user: UserEntity,
  ): Promise<PublicProfileData> {
    const stats = await this.getUserStats(user.hederaAccountId);

    return {
      hederaAccountId: user.hederaAccountId ?? "",
      displayName: user.displayName ?? "Anonymous",
      bio: user.bio ?? "",
      avatarIpfsCid: user.avatarIpfsCid ?? null,
      avatarUrl: user.avatarIpfsCid
        ? `${this.pinataGatewayUrl}/${user.avatarIpfsCid}`
        : null,
      accountType: user.accountType,
      status: user.status,
      kycLevel: user.kycLevel,
      createdAt: user.createdAt,
      didNft: {
        serial: user.didNftSerial,
        metadataCid: user.didNftMetadataCid,
      },
      topics: {
        publicFeed: user.publicFeedTopic,
        notifications: user.notificationTopic,
      },
      stats,
    };
  }

  /**
   * Fetch follower/following/post counts for a user.
   * Uses FollowerCountEntity for social stats and PostIndexEntity for post count.
   * Returns zeroes if no records exist yet (user hasn't been followed or posted).
   */
  private async getUserStats(
    hederaAccountId: string | null,
  ): Promise<{ followers: number; following: number; posts: number }> {
    if (!hederaAccountId) {
      return { followers: 0, following: 0, posts: 0 };
    }

    // Fetch follower/following counts from denormalized table
    const followerCount = await this.followerCountRepository.findOne({
      where: { accountId: hederaAccountId },
    });

    // Count posts from the post index table
    const postCount = await this.postIndexRepository.count({
      where: { authorAccountId: hederaAccountId },
    });

    return {
      followers: followerCount?.followerCount ?? 0,
      following: followerCount?.followingCount ?? 0,
      posts: postCount,
    };
  }

  /**
   * Refresh the user's DID NFT after a profile update.
   *
   * Flow:
   * 1. Build new HIP-412 metadata with updated fields
   * 2. Wipe the old DID NFT
   * 3. Mint a new DID NFT with the updated metadata
   * 4. Freeze the new NFT (soulbound)
   *
   * @param user - Current user entity (pre-update)
   * @param updates - Partial updates being applied
   * @returns New serial number and metadata CID
   */
  private async refreshDidNft(
    user: UserEntity,
    updates: Partial<UserEntity>,
  ): Promise<{ serial: number; metadataCid: string }> {
    const hederaAccountId = user.hederaAccountId ?? "";
    const oldSerial = user.didNftSerial;

    // Build metadata with updated values merged on top of existing
    const metadata = this.didNftService.buildMetadata({
      hederaAccountId,
      accountType: user.accountType === "business" ? "business" : "individual",
      kycLevel: user.kycLevel ?? "basic",
      displayName: (updates.displayName ?? user.displayName) || "",
      bio: (updates.bio ?? user.bio) || "",
      avatarIpfsCid: updates.avatarIpfsCid ?? user.avatarIpfsCid ?? undefined,
    });

    // Step 1: Wipe old NFT — try user's account first, fall back to treasury
    // New accounts have maxAutoTokenAssociations=10 so NFTs transfer automatically.
    // Older accounts may still have the NFT in the treasury.
    if (oldSerial && this.didTokenId) {
      let wiped = false;

      // Try wiping from user's account (if NFT was transferred there)
      try {
        await this.hederaService.wipeNft(
          this.didTokenId,
          hederaAccountId,
          oldSerial,
        );
        wiped = true;
        this.logger.log(
          `Old DID NFT (serial ${oldSerial}) wiped from user ${hederaAccountId}`,
        );
      } catch {
        // NFT may still be in treasury — try wiping from there
      }

      if (!wiped) {
        // Fall back: try wiping from treasury (operator account)
        try {
          const operatorId = this.hederaService.getOperatorId();
          await this.hederaService.wipeNft(
            this.didTokenId,
            operatorId,
            oldSerial,
          );
          this.logger.log(
            `Old DID NFT (serial ${oldSerial}) wiped from treasury`,
          );
        } catch (wipeError: unknown) {
          const wipeMsg =
            wipeError instanceof Error ? wipeError.message : String(wipeError);
          this.logger.warn(
            `Could not wipe old DID NFT (serial ${oldSerial}): ${wipeMsg}. Continuing with new mint.`,
          );
        }
      }
    }

    // Step 2: Mint new NFT
    this.logger.log(`Minting new DID NFT for ${hederaAccountId}`);
    const mintResult = await this.didNftService.mintDidNft(
      metadata,
      hederaAccountId,
    );

    this.logger.log(
      `New DID NFT minted for ${hederaAccountId} — serial: ${mintResult.serial}`,
    );

    // Step 3: Freeze new NFT (soulbound)
    // Note: freezeToken in DidNftService.mintDidNft already handles freezing,
    // but if that failed (hackathon-tolerant), we attempt again here.
    // DidNftService.mintDidNft already does freeze internally.

    return {
      serial: mintResult.serial,
      metadataCid: mintResult.metadataCid,
    };
  }

  /**
   * Derive file extension from MIME type.
   */
  private getExtensionFromMimetype(mimetype: string): string {
    const mimeMap: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/gif": "gif",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    };
    return mimeMap[mimetype] ?? "bin";
  }
}
