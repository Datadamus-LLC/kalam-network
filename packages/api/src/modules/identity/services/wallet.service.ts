import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import nacl from "tweetnacl";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "crypto";
import { UserEntity } from "../../../database/entities/user.entity";
import { HederaService } from "../../hedera/hedera.service";
import { TamamCustodyService } from "../../integrations/tamam-custody/tamam-custody.service";
import {
  WalletAlreadyExistsException,
  UserNotFoundException,
} from "../exceptions/wallet-creation.exception";
import {
  CustodyApiException,
  CustodyNotConfiguredException,
} from "../exceptions/custody-api.exception";
import { TopicCreationException } from "../exceptions/kyc.exception";

/**
 * Result shape returned after successful wallet creation.
 */
export interface WalletCreationResult {
  hederaAccountId: string;
  publicKey: string;
  encryptionPublicKey: string;
  status: string;
}

/**
 * Wallet status shape returned for status queries.
 */
export interface WalletStatusResult {
  userId: string;
  status: string;
  hederaAccountId: string | null;
  publicKey: string | null;
  hasWallet: boolean;
  hasEncryptionKey: boolean;
  hasBackup: boolean; // Whether a PIN-wrapped key backup exists
}

/**
 * Result shape returned after encryption key generation.
 */
export interface EncryptionKeyResult {
  encryptionPublicKey: string;
  encryptionPrivateKey?: string; // Returned at generation AND on existing key retrieval (server-wrapped backup)
  generated: boolean;
}

/**
 * WalletService — orchestrates Hedera wallet creation for new users.
 *
 * Uses Tamam MPC Custody exclusively (no local fallback):
 * 1. Creates a per-user vault via `POST /api/v1/vaults`
 * 2. If vault doesn't auto-provision a Hedera account, creates one via SDK
 * 3. Creates HCS topics for public feed and notifications
 * 4. Stores `hederaAccountId`, `publicKey`, `keyId` (vault ID) on user entity
 * 5. Updates user status to `pending_kyc`
 */
@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly hederaService: HederaService,
    private readonly tamamCustodyService: TamamCustodyService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a Hedera wallet for the authenticated user.
   *
   * @param userId Platform user ID
   * @returns Created wallet info with Hedera account ID
   * @throws UserNotFoundException if user does not exist
   * @throws WalletAlreadyExistsException if user already has a wallet
   * @throws WalletCreationException if wallet creation fails
   */
  async createWallet(userId: string): Promise<WalletCreationResult> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    if (user.hederaAccountId) {
      throw new WalletAlreadyExistsException(userId, user.hederaAccountId);
    }

    this.logger.log(`Creating wallet for user ${userId}`);

    if (!this.tamamCustodyService.isConfigured()) {
      throw new CustodyNotConfiguredException();
    }

    return this.createWalletViaTamam(user);
  }

  /**
   * Get wallet status for the authenticated user.
   */
  async getWalletStatus(userId: string): Promise<WalletStatusResult> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    return {
      userId: user.id,
      status: user.status,
      hederaAccountId: user.hederaAccountId,
      publicKey: user.publicKey,
      hasWallet: user.hederaAccountId !== null,
      hasEncryptionKey: user.encryptionPublicKey !== null,
      hasBackup: user.encryptedPrivateKeyBackup !== null,
    };
  }

  /**
   * Ensure the authenticated user has an X25519 encryption keypair.
   *
   * If the user already has an encryption key, returns it.
   * If not, generates a new X25519 keypair, stores the public key,
   * and returns it. This fixes users created before encryption key
   * generation was added to the wallet creation flow.
   *
   * @param userId Platform user ID
   * @returns Encryption key result with public key
   * @throws UserNotFoundException if user does not exist
   */
  async ensureEncryptionKey(userId: string): Promise<EncryptionKeyResult> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new UserNotFoundException(userId);
    }

    if (user.encryptionPublicKey) {
      this.logger.log(`User ${userId} already has encryption key`);
      return {
        encryptionPublicKey: user.encryptionPublicKey,
        // Return the client-encrypted backup blob (client decrypts with PIN)
        encryptedBackup: user.encryptedPrivateKeyBackup ?? undefined,
        generated: false,
      } as EncryptionKeyResult & { encryptedBackup?: string };
    }

    this.logger.log(`Generating encryption keypair for user ${userId}`);

    const encryptionKeyPair = nacl.box.keyPair();
    const encryptionPublicKeyBase64 = Buffer.from(
      encryptionKeyPair.publicKey,
    ).toString("base64");
    const encryptionPrivateKeyBase64 = Buffer.from(
      encryptionKeyPair.secretKey,
    ).toString("base64");

    await this.userRepository.update(userId, {
      encryptionPublicKey: encryptionPublicKeyBase64,
      encryptedPrivateKeyBackup: null, // Client stores backup via storeKeyBackup()
    });

    this.logger.log(`Encryption keypair generated for user ${userId}`);

    return {
      encryptionPublicKey: encryptionPublicKeyBase64,
      encryptionPrivateKey: encryptionPrivateKeyBase64,
      generated: true,
    };
  }

  /**
   * Store a client-side PIN-encrypted private key backup.
   * The server stores the blob opaquely — it cannot decrypt it (no PIN).
   */
  async storeKeyBackup(userId: string, encryptedBackup: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UserNotFoundException(userId);
    await this.userRepository.update(userId, {
      encryptedPrivateKeyBackup: encryptedBackup,
    });
  }

  /**
   * Retrieve the PIN-encrypted private key backup.
   * Returns null if no backup stored yet.
   */
  async getKeyBackup(userId: string): Promise<string | null> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new UserNotFoundException(userId);
    return user.encryptedPrivateKeyBackup ?? null;
  }

  /**
   * Encrypt the private key with a server-side wrapping key (AES-256-GCM).
   * The wrapped key is safe to store in the DB — only the server can unwrap it.
   * This enables new-device access without re-keying conversations.
   */
  private wrapPrivateKey(privateKeyBase64: string): string {
    const wrapKeyHex = this.configService.getOrThrow<string>(
      "ENCRYPTION_WRAP_KEY",
    );
    const wrapKey = createHash("sha256").update(wrapKeyHex).digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", wrapKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(privateKeyBase64, "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      iv: iv.toString("base64"),
      ciphertext: encrypted.toString("base64"),
      tag: tag.toString("base64"),
    });
  }

  /** Unwrap a server-encrypted private key. */
  private unwrapPrivateKey(wrapped: string): string {
    const wrapKeyHex = this.configService.getOrThrow<string>(
      "ENCRYPTION_WRAP_KEY",
    );
    const wrapKey = createHash("sha256").update(wrapKeyHex).digest();
    const { iv, ciphertext, tag } = JSON.parse(wrapped) as {
      iv: string;
      ciphertext: string;
      tag: string;
    };
    const decipher = createDecipheriv(
      "aes-256-gcm",
      wrapKey,
      Buffer.from(iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return (
      decipher.update(Buffer.from(ciphertext, "base64")).toString("utf8") +
      decipher.final("utf8")
    );
  }

  /**
   * Create wallet via Tamam MPC Custody vault creation.
   *
   * Calls `POST /api/v1/vaults` to create a per-user vault under the
   * platform's existing organization. The vault auto-generates MPC keys.
   * If the vault doesn't auto-provision a Hedera account, creates one
   * via the Hedera SDK using the MPC public key.
   *
   * The vault ID is stored as the user's `keyId` for future signing operations.
   */
  private async createWalletViaTamam(
    user: UserEntity,
  ): Promise<WalletCreationResult> {
    this.logger.log(
      `Using Tamam Custody for wallet creation (user ${user.id})`,
    );

    try {
      const userDisplayName =
        user.displayName ?? `User ${user.id.substring(0, 8)}`;

      const vaultResult =
        await this.tamamCustodyService.createUserVault(userDisplayName);

      let hederaAccountId = vaultResult.hederaAccountId;

      // Vault may or may not auto-provision a Hedera account.
      // If not, create one via SDK using the MPC public key.
      if (!hederaAccountId) {
        this.logger.log(
          `Vault did not auto-provision Hedera account, creating via SDK`,
        );
        hederaAccountId = await this.hederaService.createAccount(
          vaultResult.publicKey,
          10,
        );
      } else {
        // Vault auto-provisioned the account but it has 0 HBAR.
        // Fund it from the operator to cover transaction fees.
        this.logger.log(
          `Vault auto-provisioned ${hederaAccountId}, funding with 10 HBAR from operator`,
        );
        await this.hederaService.fundAccount(hederaAccountId, 10);
      }

      // Create HCS topics for the user's public feed and notification inbox
      const topics = await this.createUserTopics(hederaAccountId, user.id);

      // Generate X25519 keypair for E2E encrypted messaging (Layer 2).
      // The public key is stored on the user entity so other users can
      // encrypt messages for this user. The secret key is returned to the
      // client for local storage (never persisted server-side).
      const encryptionKeyPair = nacl.box.keyPair();
      const encryptionPublicKeyBase64 = Buffer.from(
        encryptionKeyPair.publicKey,
      ).toString("base64");

      await this.userRepository.update(user.id, {
        hederaAccountId,
        publicKey: vaultResult.publicKey,
        keyId: vaultResult.vaultId,
        publicFeedTopic: topics.publicFeedTopic,
        notificationTopic: topics.notificationTopic,
        encryptionPublicKey: encryptionPublicKeyBase64,
        status: "pending_kyc",
      });

      this.logger.log(
        `Wallet created via Tamam for user ${user.id}: ${hederaAccountId}, ` +
          `vaultId: ${vaultResult.vaultId}, ` +
          `feed topic: ${topics.publicFeedTopic}, ` +
          `encryptionPublicKey set`,
      );

      return {
        hederaAccountId,
        publicKey: vaultResult.publicKey,
        encryptionPublicKey: encryptionPublicKeyBase64,
        status: "pending_kyc",
      };
    } catch (error: unknown) {
      if (error instanceof WalletAlreadyExistsException) {
        throw error;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Tamam wallet creation failed for user ${user.id}: ${message}`,
      );
      throw new CustodyApiException(
        `Wallet creation via Tamam Custody failed: ${message}`,
      );
    }
  }

  /**
   * Create HCS topics for the user's public feed and notification inbox.
   * Called during wallet creation so users can post immediately after
   * creating their wallet, even before KYC is complete.
   */
  private async createUserTopics(
    hederaAccountId: string,
    userId: string,
  ): Promise<{ publicFeedTopic: string; notificationTopic: string }> {
    this.logger.log(`Creating HCS topics for user ${userId}`);

    let publicFeedTopic: string;
    let notificationTopic: string;

    try {
      publicFeedTopic = await this.hederaService.createTopic({
        memo: `Hedera Social — Public Feed for ${hederaAccountId}`,
      });
      this.logger.log(
        `Created public feed topic ${publicFeedTopic} for user ${userId}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Public feed topic creation failed for user ${userId}: ${message}`,
      );
      throw new TopicCreationException(
        `Failed to create public feed topic: ${message}`,
        "PUBLIC_FEED_TOPIC_FAILED",
      );
    }

    try {
      notificationTopic = await this.hederaService.createTopic({
        memo: `Hedera Social — Notifications for ${hederaAccountId}`,
      });
      this.logger.log(
        `Created notification topic ${notificationTopic} for user ${userId}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      this.logger.error(
        `Notification topic creation failed for user ${userId}: ${message}`,
      );
      throw new TopicCreationException(
        `Failed to create notification topic: ${message}`,
        "NOTIFICATION_TOPIC_FAILED",
      );
    }

    return { publicFeedTopic, notificationTopic };
  }
}
