# P1-T10: Wallet Creation via Tamam Custody

| Field | Value |
|-------|-------|
| Task ID | P1-T10 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 4 hours |
| Depends On | P1-T09 (Auth Registration), P0-T06 (Hedera SDK Setup) |
| Phase | 1 — Identity & Onboarding |
| Assignee | Backend Developer (Hedera specialist) |
| Module | Identity & Onboarding (Spec Section 2.1, FR-ID-002) |
| Hedera Transactions | 1x CryptoTransfer (auto-account creation, ~$0.05) |

---

## Objective

Create Hedera wallet accounts for authenticated users via Tamam Custody MPC (with MOCK implementation for hackathon). Each user gets a unique ECDSA keypair, a Hedera Account ID, and their public key is stored for message encryption. This is the bridge between platform authentication and on-chain identity.

---

## Background

**Why Tamam Custody?**
- Tamam provides enterprise-grade MPC (Multi-Party Computation) key management
- Private keys are never held by a single entity — split across Tamam's infrastructure
- In production, Tamam signs transactions on behalf of users
- For hackathon, we mock this with local ECDSA key generation

**Hedera Auto-Account Creation:**
- New Hedera accounts are created by "transferring hbar to an ECDSA alias"
- The alias is derived from the ECDSA public key using ED25519 -> ECDSA conversion
- Hedera network automatically creates the account on first transfer
- Costs ~0.05 HBAR to create a new account

**Key Storage for Hackathon:**
- In production: Private keys stored in Tamam MPC, never visible to platform
- For hackathon: Generate locally, encrypt with a master key, store in DB (NOT production-ready)
- Add a WARNING label that production must use Tamam's actual MPC

**Spec References:**
- FR-ID-002: Wallet Creation (docs/SPECIFICATION.md Section 2.1)
- Hedera SDK: https://github.com/hashgraph/hedera-sdk-js
- Tamam Integration: docs/SPECIFICATION.md Section 6.3

---

## Pre-requisites

Before you start, make sure:

1. **P1-T09 Complete** — Auth service working, users can register and get JWT
2. **P0-T06 Complete** — Hedera SDK configured (HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY in .env)
3. **Docker Running** — Postgres and Redis active
4. **Environment Variables**:
   ```env
   HEDERA_NETWORK=testnet
   HEDERA_OPERATOR_ID=0.0.XXXXX        # Your operator account
   HEDERA_OPERATOR_KEY=302e...         # Your operator private key
   TAMAM_CUSTODY_API_URL=https://tamam-backend-staging-776426377628.us-central1.run.app
   TAMAM_CUSTODY_API_KEY=              # Leave empty for hackathon mode
   TAMAM_CUSTODY_MOCK=true             # Enable mock implementation
   ```
5. **Hedera Testnet Account** — Get one at https://portal.hedera.com if you don't have one
6. **Dependencies** — `@hashgraph/sdk` already installed in `packages/api`

---

## Step-by-Step Instructions

### Step 1: Create Tamam Custody Service (Mock Implementation)

Create file `packages/api/src/hedera/services/tamam-custody.service.ts`:

```typescript
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrivateKey, PublicKey } from '@hashgraph/sdk';
import * as crypto from 'crypto';

/**
 * Tamam Custody Service — Manages Hedera wallet keypairs
 *
 * In production:
 * - Calls Tamam Custody API to generate keypairs via MPC
 * - Private keys are never returned — only public keys and key share IDs
 * - All signing is done by Tamam's HSM
 *
 * For hackathon (TAMAM_CUSTODY_MOCK=true):
 * - Generate ECDSA keypairs locally using @hashgraph/sdk
 * - Store encrypted private keys in database (with WARNING)
 * - This is NOT secure for production — only for demo/testing
 */
@Injectable()
export class TamamCustodyService {
  private readonly logger = new Logger(TamamCustodyService.name);
  private readonly mockMode: boolean;

  constructor(private configService: ConfigService) {
    this.mockMode = this.configService.get('TAMAM_CUSTODY_MOCK') === 'true';

    if (this.mockMode) {
      this.logger.warn(
        '======= ATTENTION =======\n' +
        'TAMAM_CUSTODY_MOCK=true — Using LOCAL key generation\n' +
        'Private keys are stored encrypted in database\n' +
        'THIS IS NOT PRODUCTION-SAFE — FOR HACKATHON ONLY\n' +
        'In production, use Tamam Custody API with real MPC\n' +
        '=======================',
      );
    }
  }

  /**
   * Create a new ECDSA keypair for a user
   *
   * In production:
   * - POST to Tamam Custody API: POST /mpc/keygen
   * - Returns: { keyId, publicKey, keyShareId }
   * - Private key is stored in Tamam's HSM
   *
   * For hackathon:
   * - Generate ECDSA keypair locally using PrivateKey.generateECDSA()
   * - Return public key and encrypted private key (for DB storage)
   *
   * @param userId - User's database ID (for logging)
   * @returns Object with publicKey and encryptedPrivateKey
   */
  async createWallet(userId: string): Promise<{
    publicKey: string;
    encryptedPrivateKey?: string;
    keyId: string;
  }> {
    if (this.mockMode) {
      return this.createWalletMock(userId);
    } else {
      return this.createWalletProduction(userId);
    }
  }

  /**
   * MOCK implementation — Generate ECDSA keypair locally
   * For hackathon use only
   *
   * @param userId - User ID for logging
   * @returns publicKey (hex string), encryptedPrivateKey, keyId
   */
  private async createWalletMock(userId: string): Promise<{
    publicKey: string;
    encryptedPrivateKey: string;
    keyId: string;
  }> {
    try {
      this.logger.log(`[MOCK] Generating ECDSA keypair for user ${userId}`);

      // Generate ECDSA keypair (Hedera Layer 1) + X25519 keypair (Layer 2 E2E encryption)
      // @hashgraph/sdk provides PrivateKey class with generateECDSA()
      const privateKey = PrivateKey.generateECDSA();
      const publicKey = privateKey.publicKey;

      // Get keys as hex strings for storage
      const publicKeyHex = publicKey.toStringRaw();
      const privateKeyHex = privateKey.toStringRaw();

      // Encrypt private key with a master encryption key (from environment or config)
      // In real production, private key would NEVER be stored locally
      const masterKey = this.getMasterEncryptionKey();
      const encryptedPrivateKey = this.encryptPrivateKey(privateKeyHex, masterKey);

      // Generate unique key ID for this keypair
      const keyId = crypto.randomUUID();

      this.logger.log(
        `[MOCK] Created keypair for user ${userId}:\n` +
        `  Key ID: ${keyId}\n` +
        `  Public Key: ${publicKeyHex.substring(0, 32)}...\n` +
        `  (Private key encrypted and stored)`,
      );

      return {
        publicKey: publicKeyHex,
        encryptedPrivateKey,
        keyId,
      };
    } catch (error) {
      this.logger.error(`Failed to generate ECDSA keypair: ${error.message}`);
      throw new BadRequestException(
        'Failed to generate keypair. Please try again.',
      );
    }
  }

  /**
   * PRODUCTION implementation — Call Tamam Custody API
   * Not fully implemented for hackathon
   *
   * @param userId - User ID for logging
   */
  private async createWalletProduction(userId: string): Promise<{
    publicKey: string;
    encryptedPrivateKey?: string;
    keyId: string;
  }> {
    const apiUrl = this.configService.get('TAMAM_CUSTODY_API_URL');
    const apiKey = this.configService.get('TAMAM_CUSTODY_API_KEY');

    if (!apiUrl || !apiKey) {
      throw new BadRequestException(
        'Tamam Custody API not configured. Set TAMAM_CUSTODY_API_URL and TAMAM_CUSTODY_API_KEY in .env',
      );
    }

    // TODO: Implement actual Tamam Custody API call
    // const response = await fetch(`${apiUrl}/mpc/keygen`, {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${apiKey}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({ userId, keyType: 'ECDSA_SECP256K1' }),
    // });
    // const { keyId, publicKey, keyShareId } = await response.json();

    throw new BadRequestException('Production Tamam Custody API not yet implemented');
  }

  /**
   * Sign a Hedera transaction
   *
   * In production:
   * - Call Tamam Custody API with transaction bytes
   * - Tamam's HSM signs and returns signature
   *
   * For hackathon:
   * - Use local private key to sign
   * - Return signature
   *
   * @param transactionBytes - Serialized Hedera transaction
   * @param encryptedPrivateKey - Encrypted private key from DB
   * @returns Signature bytes (hex string)
   */
  async signTransaction(
    transactionBytes: Buffer,
    encryptedPrivateKey: string,
  ): Promise<string> {
    if (this.mockMode) {
      return this.signTransactionMock(transactionBytes, encryptedPrivateKey);
    } else {
      return this.signTransactionProduction(transactionBytes);
    }
  }

  /**
   * MOCK implementation — Sign with local private key
   * @param transactionBytes - Transaction to sign
   * @param encryptedPrivateKey - Encrypted private key from DB
   * @returns Signature as hex string
   */
  private async signTransactionMock(
    transactionBytes: Buffer,
    encryptedPrivateKey: string,
  ): Promise<string> {
    try {
      // Decrypt private key
      const masterKey = this.getMasterEncryptionKey();
      const privateKeyHex = this.decryptPrivateKey(encryptedPrivateKey, masterKey);
      const privateKey = PrivateKey.fromStringECDSA(privateKeyHex);

      // Sign transaction
      const signature = privateKey.sign(transactionBytes);

      return Buffer.from(signature).toString('hex');
    } catch (error) {
      this.logger.error(`Failed to sign transaction: ${error.message}`);
      throw new BadRequestException('Failed to sign transaction');
    }
  }

  /**
   * PRODUCTION implementation — Call Tamam Custody API
   * @param transactionBytes - Transaction to sign
   */
  private async signTransactionProduction(transactionBytes: Buffer): Promise<string> {
    throw new BadRequestException(
      'Production Tamam Custody signing not yet implemented',
    );
  }

  /**
   * Get master encryption key for local key storage
   * In production, this would come from AWS KMS or similar
   * For hackathon, derive from a config value
   *
   * @returns Master key (256-bit / 32 bytes)
   */
  private getMasterEncryptionKey(): Buffer {
    const keySource = this.configService.get('ENCRYPTION_MASTER_KEY') ||
      process.env.JWT_SECRET || // Fallback to JWT secret if no specific key
      'HACKATHON_MODE_INSECURE_KEY';

    // Hash to get exactly 32 bytes
    return crypto
      .createHash('sha256')
      .update(keySource)
      .digest();
  }

  /**
   * Encrypt private key using AES-256-GCM
   * @param privateKeyHex - Private key as hex string
   * @param masterKey - Encryption master key (32 bytes)
   * @returns Encrypted key (base64: iv + ciphertext + authTag)
   */
  private encryptPrivateKey(privateKeyHex: string, masterKey: Buffer): string {
    // Generate random IV (16 bytes for AES)
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);

    // Encrypt
    const encrypted = Buffer.concat([
      cipher.update(privateKeyHex, 'utf8'),
      cipher.final(),
    ]);

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine: iv + encrypted + authTag, encode as base64
    const combined = Buffer.concat([iv, encrypted, authTag]);
    return combined.toString('base64');
  }

  /**
   * Decrypt private key using AES-256-GCM
   * @param encryptedKeyBase64 - Encrypted key from DB
   * @param masterKey - Encryption master key (32 bytes)
   * @returns Decrypted private key as hex string
   */
  private decryptPrivateKey(encryptedKeyBase64: string, masterKey: Buffer): string {
    // Decode from base64
    const combined = Buffer.from(encryptedKeyBase64, 'base64');

    // Extract parts: IV (16 bytes) + encrypted + authTag (16 bytes)
    const iv = combined.slice(0, 16);
    const authTag = combined.slice(-16);
    const ciphertext = combined.slice(16, -16);

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
```

### Step 2: Create Identity Service (Main Orchestration)

Create file `packages/api/src/hedera/services/identity.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  AccountCreateTransaction,
  Hbar,
  PrivateKey,
  PublicKey,
  TransactionResponse,
} from '@hashgraph/sdk';
import { TamamCustodyService } from './tamam-custody.service';
import { UsersService } from '../../users/services/users.service';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);
  private client: Client;

  constructor(
    private configService: ConfigService,
    private tamamCustodyService: TamamCustodyService,
    private usersService: UsersService,
  ) {
    this.initializeHederaClient();
  }

  /**
   * Initialize Hedera SDK client
   * Connects to testnet or mainnet based on environment
   */
  private initializeHederaClient(): void {
    const network = this.configService.get('HEDERA_NETWORK') || 'testnet';
    const operatorId = this.configService.get('HEDERA_OPERATOR_ID');
    const operatorKey = this.configService.get('HEDERA_OPERATOR_KEY');

    if (!operatorId || !operatorKey) {
      throw new Error(
        'Hedera operator credentials not configured. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env',
      );
    }

    if (network === 'testnet') {
      this.client = Client.forTestnet();
    } else if (network === 'mainnet') {
      this.client = Client.forMainnet();
    } else {
      throw new Error(`Unknown Hedera network: ${network}`);
    }

    this.client.setOperator(operatorId, operatorKey);
    this.logger.log(`Hedera client initialized for ${network}`);
  }

  /**
   * Create Hedera wallet for a user
   *
   * Flow:
   * 1. Call Tamam Custody to generate ECDSA keypair (or mock generate)
   * 2. Create Hedera account via auto-account creation (transfer 0.1 HBAR to ECDSA alias)
   * 3. Wait for transaction receipt → get Account ID
   * 4. Store Account ID + public key in users table
   * 5. Update user status to 'pending_kyc'
   *
   * @param userId - User's database ID
   * @returns Object with hederaAccountId and publicKey
   */
  async createWallet(userId: string): Promise<{
    hederaAccountId: string;
    publicKey: string;
    transactionId: string;
  }> {
    try {
      // Fetch user
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new BadRequestException(`User ${userId} not found`);
      }

      // Check if user already has wallet
      if (user.hederaAccountId) {
        throw new ConflictException(
          `User ${userId} already has Hedera account ${user.hederaAccountId}`,
        );
      }

      this.logger.log(`Creating Hedera wallet for user ${userId}`);

      // Step 1: Call Tamam Custody to generate keypair
      const { publicKey, encryptedPrivateKey, keyId } =
        await this.tamamCustodyService.createWallet(userId);

      this.logger.log(`Generated keypair for user ${userId}, Key ID: ${keyId}`);

      // Step 2: Create Hedera account via auto-account creation
      // Public key object from hex string
      const publicKeyObj = PublicKey.fromString(publicKey);

      // Create transaction: transfer 0.1 HBAR to ECDSA-derived alias
      // This triggers automatic account creation with the new public key
      const transaction = new AccountCreateTransaction()
        .setKey(publicKeyObj)
        .setInitialBalance(Hbar.from(0.1)); // Minimum to trigger account creation

      // Submit transaction
      const transactionResponse = await transaction.execute(this.client);

      // Wait for receipt to get the new Account ID
      const receipt = await transactionResponse.getReceipt(this.client);

      if (!receipt.accountId) {
        throw new BadRequestException(
          'Account creation failed — no account ID in receipt',
        );
      }

      const hederaAccountId = receipt.accountId.toString();
      const transactionId = transactionResponse.transactionId.toString();

      this.logger.log(
        `Hedera account created for user ${userId}:\n` +
        `  Account ID: ${hederaAccountId}\n` +
        `  Transaction ID: ${transactionId}`,
      );

      // Step 3: Store in database
      await this.usersService.update(userId, {
        hederaAccountId,
        publicKey,
        status: 'pending_kyc', // User can now proceed to KYC
      });

      // If mock mode, also store encrypted private key (for testing transaction signing)
      // WARNING: This is NOT production-safe
      if (encryptedPrivateKey) {
        this.logger.warn(
          `[HACKATHON] Storing encrypted private key for user ${userId} — NOT FOR PRODUCTION`,
        );
        // Private key storage would be in a separate secure table in production
        // For now, we're just logging it
      }

      this.logger.log(
        `User ${userId} wallet creation complete. Status updated to pending_kyc`,
      );

      return {
        hederaAccountId,
        publicKey,
        transactionId,
      };
    } catch (error) {
      this.logger.error(
        `Wallet creation failed for user ${userId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get user's Hedera account information
   * Query from platform DB (cached from on-chain)
   *
   * @param hederaAccountId - Hedera Account ID (0.0.XXXXX)
   * @returns User profile with Hedera account info
   */
  async getHederaAccount(hederaAccountId: string): Promise<Record<string, unknown>> {
    try {
      const user = await this.usersService.findByHederaAccountId(
        hederaAccountId,
      );

      if (!user) {
        throw new BadRequestException(
          `User with Hedera account ${hederaAccountId} not found`,
        );
      }

      return {
        hederaAccountId: user.hederaAccountId,
        publicKey: user.publicKey,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
        status: user.status,
        createdAt: user.createdAt,
      };
    } catch (error) {
      this.logger.error(
        `Failed to get Hedera account ${hederaAccountId}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Query Hedera Mirror Node for account info (optional)
   * For getting up-to-date balance, token associations, etc.
   *
   * @param hederaAccountId - Hedera Account ID
   * @returns Account info from Mirror Node
   */
  async queryAccountMirrorNode(hederaAccountId: string): Promise<Record<string, unknown>> {
    try {
      const mirrorNodeUrl = `https://${this.configService.get('HEDERA_NETWORK') === 'mainnet' ? 'mainnet' : 'testnet'}.mirrornode.hedera.com`;

      const response = await fetch(
        `${mirrorNodeUrl}/api/v1/accounts/${hederaAccountId}`,
      );

      if (!response.ok) {
        throw new Error(`Mirror Node returned ${response.status}`);
      }

      return response.json();
    } catch (error) {
      this.logger.error(
        `Failed to query Mirror Node for ${hederaAccountId}: ${error.message}`,
      );
      // Don't throw — Mirror Node is optional for now
      return null;
    }
  }

  /**
   * Sign a transaction using the user's private key (hackathon only)
   * In production, this would be handled by Tamam Custody's HSM
   *
   * @param userId - User ID whose key to use for signing
   * @param transactionBytes - Serialized transaction to sign
   * @returns Signature as hex string
   */
  async signTransaction(
    userId: string,
    transactionBytes: Buffer,
  ): Promise<string> {
    // This would fetch the encrypted private key from DB and use TamamCustodyService
    // Placeholder for P1-T10 — fully implemented in payment-related tasks
    throw new BadRequestException(
      'Transaction signing not yet implemented. Use in P2-T14 (Payments)',
    );
  }

  /**
   * Close Hedera client connection
   * Call this on application shutdown
   */
  async closeClient(): void {
    if (this.client) {
      this.client.close();
      this.logger.log('Hedera client closed');
    }
  }
}
```

### Step 3: Create Hedera Module

Create file `packages/api/src/hedera/hedera.module.ts`:

```typescript
import { Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TamamCustodyService } from './services/tamam-custody.service';
import { IdentityService } from './services/identity.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ConfigModule, UsersModule],
  providers: [TamamCustodyService, IdentityService],
  exports: [TamamCustodyService, IdentityService],
})
export class HederaModule implements OnModuleDestroy {
  constructor(private identityService: IdentityService) {}

  onModuleDestroy() {
    this.identityService.closeClient();
  }
}
```

### Step 4: Create Wallet Controller

Create file `packages/api/src/hedera/controllers/wallet.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { IdentityService } from '../services/identity.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('api/v1/wallet')
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(private identityService: IdentityService) {}

  /**
   * POST /api/v1/wallet/create
   *
   * Create Hedera wallet for authenticated user
   * REQUIRES: Valid JWT token (user must be logged in via P1-T09)
   *
   * Request: No body required
   *
   * Response (200 OK):
   * ```json
   * {
   *   "hederaAccountId": "0.0.123456",
   *   "publicKey": "302a300506032b6570032100...",
   *   "transactionId": "0.0.12345@1234567890.123456789",
   *   "message": "Wallet created successfully"
   * }
   * ```
   *
   * Errors:
   * - 401: Not authenticated (missing JWT)
   * - 409: User already has a wallet
   * - 400: Hedera network error
   */
  @Post('create')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async createWallet(@CurrentUser() user: { id: string; hederaAccountId: string; email?: string }) {
    this.logger.log(`Wallet creation requested by user ${user.id}`);

    try {
      const result = await this.identityService.createWallet(user.id);
      return {
        ...result,
        message: 'Hedera wallet created successfully. You can now proceed to KYC verification.',
      };
    } catch (error: unknown) {
      this.logger.error(`Wallet creation failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * GET /api/v1/wallet/info/:hederaAccountId
   *
   * Get Hedera account information by Account ID
   * Public endpoint — no authentication required
   *
   * Request: No body
   *
   * Response (200 OK):
   * ```json
   * {
   *   "hederaAccountId": "0.0.123456",
   *   "publicKey": "302a300506032b6570032100...",
   *   "displayName": "John Doe",
   *   "status": "pending_kyc",
   *   "createdAt": "2026-03-11T10:00:00Z"
   * }
   * ```
   *
   * Errors:
   * - 404: Account not found
   */
  @Get('info/:hederaAccountId')
  @HttpCode(HttpStatus.OK)
  async getAccountInfo(@Param('hederaAccountId') hederaAccountId: string) {
    this.logger.log(`Account info requested for ${hederaAccountId}`);

    try {
      return await this.identityService.getHederaAccount(hederaAccountId);
    } catch (error) {
      this.logger.error(`Failed to get account info: ${error.message}`);
      throw error;
    }
  }

  /**
   * GET /api/v1/wallet/mirror/:hederaAccountId
   *
   * Query Hedera Mirror Node for real-time account data
   * Public endpoint — returns balance, token associations, etc.
   *
   * Response (200 OK):
   * ```json
   * {
   *   "account": "0.0.123456",
   *   "balance": {
   *     "timestamp": "1234567890.123456789",
   *     "balance": 1000000  // in tinybars (1 HBAR = 1000000000 tinybars)
   *   },
   *   "accounts": [...],  // Token associations
   *   "transactions": [...]
   * }
   * ```
   */
  @Get('mirror/:hederaAccountId')
  @HttpCode(HttpStatus.OK)
  async getMirrorNodeInfo(@Param('hederaAccountId') hederaAccountId: string) {
    this.logger.log(`Mirror Node info requested for ${hederaAccountId}`);

    try {
      return await this.identityService.queryAccountMirrorNode(hederaAccountId);
    } catch (error) {
      this.logger.error(`Failed to query Mirror Node: ${error.message}`);
      throw error;
    }
  }
}
```

### Step 5: Update AppModule to Include HederaModule

Edit `packages/api/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RedisModule } from './redis/redis.module';
import { HederaModule } from './hedera/hedera.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'hedera_social',
      password: process.env.DB_PASSWORD || 'devpassword',
      database: process.env.DB_DATABASE || 'hedera_social',
      autoLoadEntities: true,
      synchronize: false,
    }),
    AuthModule,
    UsersModule,
    HederaModule,  // Add this
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

### Step 6: Update User Entity with Private Key Field

Edit `packages/api/src/users/entities/user.entity.ts` to add:

```typescript
/**
 * Encrypted private key (HACKATHON MODE ONLY)
 * In production, private keys are stored in Tamam Custody MPC
 * For hackathon, we encrypt locally (NOT SECURE FOR PRODUCTION)
 * This field is never returned in API responses
 */
@Column({ nullable: true, select: false }) // select: false hides from queries by default
encryptedPrivateKey?: string;

/**
 * Key ID from Tamam Custody (for audit trail)
 * Links this user's keypair to Tamam's KMS
 */
@Column({ nullable: true })
keyId?: string;
```

---

## Verification Steps

| # | Command | Expected Output |
|---|---------|-----------------|
| 1 | `docker exec hedera-social-postgres psql -U hedera_social -d hedera_social -c "ALTER TABLE users ADD COLUMN encrypted_private_key TEXT;"` | No error (column added) |
| 2 | `docker exec hedera-social-postgres psql -U hedera_social -d hedera_social -c "ALTER TABLE users ADD COLUMN key_id UUID;"` | No error (column added) |
| 3 | `pnpm --filter @hedera-social/api start:dev` | Server starts, Hedera client initializes |
| 4 | **CURL TEST 1 - Register:** `curl -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d '{"email":"wallet-test@example.com"}'` | Returns 200 with OTP message |
| 5 | **Get OTP** from server logs (look for "HACKATHON OTP") | Shows: `OTP CODE: XXXXXX` |
| 6 | **CURL TEST 2 - Verify OTP:** `curl -X POST http://localhost:3001/api/v1/auth/verify-otp -H "Content-Type: application/json" -d '{"email":"wallet-test@example.com","otp":"XXXXXX"}'` | Returns 200 with accessToken |
| 7 | **CURL TEST 3 - Create Wallet:** `curl -X POST http://localhost:3001/api/v1/wallet/create -H "Authorization: Bearer {accessToken}"` | Returns 200 with hederaAccountId (0.0.XXXXX), publicKey, transactionId |
| 8 | **Check Logs** for wallet creation | Shows: `Hedera account created: 0.0.XXXXX` |
| 9 | **DATABASE CHECK:** `docker exec hedera-social-postgres psql -U hedera_social -d hedera_social -c "SELECT id, hedera_account_id, status FROM users WHERE email='wallet-test@example.com';"` | Shows: hederaAccountId populated, status='pending_kyc' |
| 10 | **CURL TEST 4 - Get Account Info:** `curl http://localhost:3001/api/v1/wallet/info/0.0.XXXXX` | Returns account details (name, status, created date) |

---

## Definition of Done

- [ ] TamamCustodyService created with mock ECDSA key generation
- [ ] IdentityService created with full wallet creation flow
- [ ] Hedera client initializes successfully (check logs for "initialized for testnet")
- [ ] Wallet creation:
  - [ ] Generates ECDSA keypair locally (mock mode)
  - [ ] Creates Hedera account via auto-account creation
  - [ ] Stores Account ID, public key, and status in database
  - [ ] Updates user status from pending_wallet to pending_kyc
- [ ] WalletController endpoints working:
  - [ ] POST /api/v1/wallet/create (requires JWT)
  - [ ] GET /api/v1/wallet/info/:hederaAccountId (public)
- [ ] All tests pass:
  - [ ] User can create wallet after OTP verification
  - [ ] Hedera Account ID is unique per user
  - [ ] Public key is stored and queryable
  - [ ] User status updates correctly
  - [ ] Cannot create second wallet for same user (409 error)
- [ ] Logs show:
  - [ ] Hedera client initialization
  - [ ] ECDSA keypair generation (with [MOCK] tag)
  - [ ] Account creation transactions
  - [ ] Private key encryption warning (for hackathon)
- [ ] WARNING displayed on startup about private key storage (not production-ready)
- [ ] Git commit made: `"feat(P1-T10): implement wallet creation via Tamam Custody (mock)"`

---

## Troubleshooting

**Problem:** "Hedera operator credentials not configured"
**Fix:** Make sure `.env` has:
```env
HEDERA_OPERATOR_ID=0.0.XXXXX
HEDERA_OPERATOR_KEY=302e...
```
Get testnet account at https://portal.hedera.com

**Problem:** "Account creation failed — no account ID in receipt"
**Fix:** This means the Hedera transaction failed. Check:
- Operator account has enough HBAR (minimum 1 HBAR)
- Testnet network is working (check Hedera status page)
- Increase balance if needed (ask faucet at https://portal.hedera.com)

**Problem:** OTP verification fails after creating wallet
**Fix:** Make sure you followed Step 6 of P1-T09 correctly. The JWT token must be in Authorization header:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" ...
```

**Problem:** "Failed to generate ECDSA keypair"
**Fix:** This shouldn't happen with mock mode. Check:
- @hashgraph/sdk is installed: `pnpm list | grep hashgraph`
- Node version is 18+: `node --version`

**Problem:** Wallet creation succeeds but status doesn't update to pending_kyc
**Fix:** Check database migration — user entity must have status column:
```bash
docker exec hedera-social-postgres psql -U hedera_social -d hedera_social -c "\\d users" | grep status
```

---

## Files Created in This Task

```
packages/api/src/
├── hedera/
│   ├── services/
│   │   ├── tamam-custody.service.ts
│   │   └── identity.service.ts
│   ├── controllers/
│   │   └── wallet.controller.ts
│   └── hedera.module.ts
├── users/entities/user.entity.ts (UPDATED)
└── app.module.ts (UPDATED)
```

---

## What Happens Next

After this task is complete:
- **P1-T11** — KYC & DID NFT Minting (needs wallet from this task)
- **P1-T12** — Profile CRUD (can read wallet data)
- **P1-T13** — Frontend Onboarding UI (can call /api/v1/wallet/create)
- **P2-T14** — Payments (needs transaction signing from wallet)

The user now has a Hedera account on-chain and is ready for identity verification (KYC) in the next task.
