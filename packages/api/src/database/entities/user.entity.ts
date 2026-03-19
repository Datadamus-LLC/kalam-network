import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";

/**
 * User entity — represents a platform user with Hedera wallet association.
 *
 * Users start in 'registered' status after auth signup, transition to
 * 'pending_kyc' after wallet creation, and 'active' after KYC verification.
 */
@Entity("users")
export class UserEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  email!: string | null;

  @Column({ type: "varchar", length: 20, nullable: true })
  phone!: string | null;

  @Column({ type: "varchar", length: 100, nullable: true })
  @Index()
  displayName!: string | null;

  @Column({ type: "text", nullable: true })
  bio!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  avatarUrl!: string | null;

  /**
   * Hedera Account ID (e.g., 0.0.123456)
   * Set during wallet creation (P1-T10)
   */
  @Column({ type: "varchar", length: 20, nullable: true, unique: true })
  @Index()
  hederaAccountId!: string | null;

  /**
   * Unique username / handle (e.g. "alice_42").
   * 3–30 characters: letters, digits, underscores only. Stored lowercase.
   * Null until the user explicitly sets one.
   */
  @Column({ type: "varchar", length: 30, nullable: true, unique: true })
  @Index()
  username!: string | null;

  /**
   * Public key (hex format) for the user's ECDSA keypair
   * Used for Hedera transactions and message encryption
   */
  @Column({ type: "text", nullable: true })
  publicKey!: string | null;

  /**
   * Encrypted private key (local fallback when MPC custody is unavailable)
   * In production with Tamam MPC Custody configured, private keys are stored in MPC.
   * This field provides local AES-256-GCM encrypted fallback — requires PIN-based decryption.
   * This field is never returned in API responses (select: false).
   */
  @Column({ type: "text", nullable: true, select: false })
  encryptedPrivateKey!: string | null;

  /**
   * Vault ID from Tamam Custody.
   * References the per-user MPC vault created via POST /api/v1/vaults.
   * Used for transaction signing and message signing operations.
   */
  @Column({ type: "varchar", length: 100, nullable: true })
  keyId!: string | null;

  /**
   * User status lifecycle:
   * - 'registered': Just signed up, no wallet yet
   * - 'pending_wallet': Auth complete, awaiting wallet creation
   * - 'pending_kyc': Wallet created, awaiting KYC verification
   * - 'active': Fully verified, all features available
   * - 'suspended': Account temporarily disabled
   */
  @Column({
    type: "varchar",
    length: 20,
    default: "registered",
  })
  @Index()
  status!: string;

  /**
   * X25519 encryption public key (base64) for E2E encrypted messaging.
   * Set via PUT /profile/me. Decoded as base64 by conversation service for nacl.box.
   */
  @Column({ type: "text", nullable: true })
  encryptionPublicKey!: string | null;

  /**
   * Server-wrapped private key backup (AES-256-GCM encrypted with server key).
   * Returned at login so the client can restore the private key on new devices.
   * Stored as base64 JSON: { ciphertext, iv, tag }.
   * The server wrapping key is in ENCRYPTION_WRAP_KEY env var (never logged).
   */
  @Column({ type: "text", nullable: true })
  encryptedPrivateKeyBackup!: string | null;

  /**
   * User's public HCS feed topic for social posts.
   * Created when user makes their first post.
   */
  @Column({ type: "varchar", length: 20, nullable: true })
  publicFeedTopic!: string | null;

  /**
   * IPFS CID for user's avatar image.
   */
  @Column({ type: "varchar", length: 100, nullable: true })
  avatarIpfsCid!: string | null;

  /**
   * Account type: 'individual' or 'business'
   */
  @Column({ type: "varchar", length: 20, default: "individual" })
  accountType!: string;

  /**
   * DID NFT serial number (set after KYC verification mints soulbound NFT)
   */
  @Column({ type: "bigint", nullable: true })
  didNftSerial!: number | null;

  /**
   * IPFS CID of the DID NFT metadata JSON.
   * Set during onboarding after KYC approval.
   * Contains an ipfs:// URI when IPFS upload succeeds, or onchain: hash fallback.
   */
  @Column({ type: "varchar", length: 100, nullable: true })
  didNftMetadataCid!: string | null;

  /**
   * KYC verification level after approval.
   * Set by the onboarding service after Mirsad AI approves KYC.
   */
  @Column({ type: "varchar", length: 20, nullable: true })
  kycLevel!: string | null;

  /**
   * Mirsad AI KYC request_id for callback correlation.
   * Set when KYC is submitted, used to match async callbacks.
   */
  @Column({ type: "varchar", length: 255, nullable: true, unique: true })
  @Index()
  kycRequestId!: string | null;

  /**
   * Timestamp when KYC was submitted to Mirsad AI.
   */
  @Column({ type: "timestamptz", nullable: true })
  kycSubmittedAt!: Date | null;

  /**
   * Timestamp when KYC decision was received from Mirsad AI.
   */
  @Column({ type: "timestamptz", nullable: true })
  kycCompletedAt!: Date | null;

  /**
   * HCS Topic ID for user's notification inbox.
   * Created during onboarding after KYC approval.
   */
  @Column({ type: "varchar", length: 20, nullable: true })
  notificationTopic!: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt!: Date;
}
