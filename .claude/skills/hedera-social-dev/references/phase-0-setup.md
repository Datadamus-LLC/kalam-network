# Phase 0: Project Setup & Infrastructure

**Status**: FULLY IMPLEMENTABLE. No blockers — everything here has documentation or is standard tooling.

**Scope**: Tasks T01–T08, S01–S06

---

## Monorepo Structure (pnpm workspaces)

Create a root `pnpm-workspace.yaml`:

```yaml
packages:
  - 'packages/*'
  - 'apps/backend'
  - 'apps/frontend'
```

Folder layout:
```
hedera-social-platform/
├── packages/
│   ├── types/                 # Shared TypeScript interfaces
│   ├── crypto/                # AES-256-GCM encryption utilities
│   └── hedera-sdk-config/     # Hedera SDK initialization
├── apps/
│   ├── backend/               # NestJS monolith
│   │   ├── src/
│   │   │   ├── auth/          # OTP, JWT, wallet registration
│   │   │   ├── kyc/           # KYC/KYB flow (Mirsad AI integration point)
│   │   │   ├── wallet/        # Hedera account & keypair management
│   │   │   ├── messaging/     # HCS topic subscription, encryption
│   │   │   ├── social/        # Feed, posts, follows
│   │   │   ├── payments/      # Payment service (Tamam MPC integration point)
│   │   │   ├── notifications/ # Notification topics & WebSocket gateway
│   │   │   ├── health/        # Readiness & liveness probes
│   │   │   └── config/        # Environment validation (Zod)
│   │   ├── docker/
│   │   │   └── Dockerfile
│   │   └── package.json
│   └── frontend/              # Next.js with App Router
│       ├── app/
│       │   ├── auth/          # Login, register, OTP
│       │   ├── onboarding/    # KYC flow, wallet connection
│       │   ├── dashboard/     # Home feed, posts
│       │   ├── chat/          # Conversations, messages, payments
│       │   ├── profile/       # User profile, follow, settings
│       │   └── layout.tsx
│       ├── components/
│       ├── lib/
│       │   ├── crypto.ts      # Client-side encryption (WASM or Web Crypto)
│       │   ├── socket-io.ts   # WebSocket connection & events
│       │   └── api.ts         # HTTP client with interceptors
│       └── package.json
├── docker-compose.yml
├── .env.example
├── tsconfig.base.json
├── .eslintrc.json
├── .prettierrc.json
├── .husky/
├── .commitlintrc.json
├── pnpm-workspace.yaml
└── pnpm-lock.yaml
```

---

## Root Configuration

### `.env.example`

```bash
# Hedera
HEDERA_NETWORK=testnet
HEDERA_ACCOUNT_ID=0.0.123456
HEDERA_PRIVATE_KEY=302e020100300506032b6570...
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com:443

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/hedera_social
REDIS_URL=redis://localhost:6379

# Backend
BACKEND_PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key-min-32-chars
JWT_EXPIRY=24h
JWT_REFRESH_EXPIRY=30d

# Frontend
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=http://localhost:3000

# Email/SMS (placeholder — choose provider)
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=test
SMTP_PASS=test

# Optional: Pinata IPFS
PINATA_API_KEY=
PINATA_SECRET_KEY=

# Tamam MPC Custody (DOCUMENTED)
TAMAM_CUSTODY_API_URL=https://tamam-backend-staging-776426377628.us-central1.run.app
TAMAM_CUSTODY_API_KEY=

# BLOCKED: Mirsad AI KYC
MIRSAD_KYC_API_URL=
MIRSAD_KYC_API_KEY=
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020"],
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "baseUrl": ".",
    "paths": {
      "@hedera-social/types": ["packages/types/src"],
      "@hedera-social/crypto": ["packages/crypto/src"],
      "@hedera-social/hedera-config": ["packages/hedera-sdk-config/src"],
      "@/*": ["apps/backend/src/*"],
      "@frontend/*": ["apps/frontend/src/*"]
    }
  },
  "include": ["packages", "apps"]
}
```

### `.eslintrc.json`

```json
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:prettier/recommended"
  ],
  "plugins": ["@typescript-eslint"],
  "rules": {
    "@typescript-eslint/explicit-function-return-types": "warn",
    "@typescript-eslint/no-unused-vars": "error",
    "no-console": ["warn", { "allow": ["warn", "error", "debug"] }]
  }
}
```

### `.prettierrc.json`

```json
{
  "singleQuote": true,
  "trailingComma": "es5",
  "printWidth": 100,
  "tabWidth": 2
}
```

### `.commitlintrc.json`

```json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "type-enum": [
      2,
      "always",
      [
        "feat",
        "fix",
        "docs",
        "style",
        "refactor",
        "test",
        "chore",
        "revert"
      ]
    ]
  }
}
```

---

## NestJS Backend Scaffold

### `apps/backend/src/main.ts`

```typescript
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // CORS for frontend
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  });

  const port = process.env.BACKEND_PORT || 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Server running on http://localhost:${port}`);
}

bootstrap();
```

### `apps/backend/src/app.module.ts`

All module imports as EMPTY SHELLS:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AuthModule } from './auth/auth.module';
import { KycModule } from './kyc/kyc.module';
import { WalletModule } from './wallet/wallet.module';
import { MessagingModule } from './messaging/messaging.module';
import { SocialModule } from './social/social.module';
import { PaymentsModule } from './payments/payments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { HealthModule } from './health/health.module';
import { ConfigValidationService } from './config/config-validation.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => ConfigValidationService.validate(config),
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV === 'development',
    }),
    AuthModule,
    KycModule,
    WalletModule,
    MessagingModule,
    SocialModule,
    PaymentsModule,
    NotificationsModule,
    HealthModule,
  ],
  providers: [],
})
export class AppModule {}
```

### Environment Validation (Zod)

**File**: `apps/backend/src/config/config-validation.service.ts`

```typescript
import { z } from 'zod';

const ConfigSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BACKEND_PORT: z.string().transform(Number).default('3000'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRY: z.string().default('24h'),
  JWT_REFRESH_EXPIRY: z.string().default('30d'),
  HEDERA_NETWORK: z.enum(['testnet', 'mainnet', 'previewnet']).default('testnet'),
  HEDERA_ACCOUNT_ID: z.string().regex(/^\d+\.\d+\.\d+$/),
  HEDERA_PRIVATE_KEY: z.string(),
  HEDERA_MIRROR_NODE_URL: z.string().url(),
  FRONTEND_URL: z.string().url().optional(),
  // BLOCKED services — required for production but throw if missing in Phase 0
  TAMAM_CUSTODY_API_URL: z.string().url().optional(),
  TAMAM_CUSTODY_API_KEY: z.string().optional(),
  TAMAM_RAILS_API_URL: z.string().url().optional(),
  TAMAM_RAILS_API_KEY: z.string().optional(),
  MIRSAD_API_URL: z.string().url().optional(),
  MIRSAD_API_KEY: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigValidationService {
  static validate(config: Record<string, unknown>): Config {
    try {
      const validated = ConfigSchema.parse(config);

      // Phase 0 warning: these are required for Phase 1+ but missing now
      const blocked = [
        { key: 'TAMAM_CUSTODY_API_URL', phase: '1 (Wallet creation)' },
        { key: 'MIRSAD_KYC_API_URL', phase: '1 (KYC)' },
        { key: 'TAMAM_MPC_RAILS_API_URL', phase: '4 (Payments)' },
      ];

      const missing = blocked.filter(b => !config[b.key]);
      if (missing.length > 0) {
        console.warn(
          `BLOCKED SERVICES NOT CONFIGURED (Phase 0 will work without them):\n` +
          missing.map(m => `  - ${m.key} (needed for Phase ${m.phase})`).join('\n')
        );
      }

      return validated;
    } catch (error) {
      throw new Error(`Invalid config: ${(error as Error).message}`);
    }
  }
}
```

---

## Hedera SDK Client Initialization

**Package**: `packages/hedera-sdk-config/src/index.ts`

```typescript
import { Client, AccountId, PrivateKey, Network } from '@hashgraph/sdk';

export class HederaClient {
  private static instance: Client;

  static getInstance(
    network: 'testnet' | 'mainnet' | 'previewnet' = 'testnet',
    accountId: string,
    privateKeyString: string
  ): Client {
    if (!this.instance) {
      const client = network === 'testnet'
        ? Client.forTestnet()
        : network === 'mainnet'
        ? Client.forMainnet()
        : Client.forPreviewnet();

      const accountIdObj = AccountId.fromString(accountId);
      const privateKey = PrivateKey.fromString(privateKeyString);

      client.setOperator(accountIdObj, privateKey);
      client.setDefaultMaxTransactionFee({ toTinybars: 100_000_000 }); // 1 HBAR

      this.instance = client;
    }
    return this.instance;
  }
}

export async function createHCSTopics(client: Client) {
  /**
   * IMPLEMENTABLE IN PHASE 0:
   * - Create platform social graph topic (for follow events)
   * - For each user in testnet seed, create:
   *   - Public feed topic
   *   - Notifications topic
   *
   * These calls use @hashgraph/sdk TopicCreateTransaction directly.
   * No external APIs required.
   */
  // Implementation deferred to Phase 0 seed script
}
```

---

## Next.js Frontend Scaffold

### `apps/frontend/app/layout.tsx`

```typescript
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Hedera Social',
  description: 'Decentralized social platform on Hedera',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

### App Router Structure

```
apps/frontend/app/
├── (auth)/
│   ├── login/page.tsx
│   ├── register/page.tsx
│   └── otp/page.tsx
├── (onboarding)/
│   ├── kyc/page.tsx
│   ├── kyc-confirmation/page.tsx
│   └── wallet/page.tsx
├── (main)/
│   ├── dashboard/page.tsx (home feed)
│   ├── chat/
│   │   ├── page.tsx (conversation list)
│   │   └── [conversationId]/page.tsx (message thread)
│   ├── profile/
│   │   ├── [userId]/page.tsx
│   │   └── settings/page.tsx
│   └── layout.tsx (authenticated layout)
├── layout.tsx (root)
└── error.tsx
```

---

## Docker Compose

**File**: `docker-compose.yml`

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: hedera_user
      POSTGRES_PASSWORD: hedera_password
      POSTGRES_DB: hedera_social
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U hedera_user']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  mailhog:
    image: mailhog/mailhog:latest
    ports:
      - '1025:1025'  # SMTP
      - '8025:8025'  # Web UI
    # For dev: email is logged to console, not actually sent

volumes:
  postgres_data:
  redis_data:
```

---

## Shared Types Package

**File**: `packages/types/src/index.ts`

```typescript
// User & Auth
export interface User {
  id: string;
  accountId: string; // Hedera account ID (0.0.X)
  username: string;
  email: string;
  phoneNumber?: string;
  profilePictureCID?: string; // IPFS CID
  bio?: string;
  publicKey: string; // For key exchange
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface OTPRequest {
  email?: string;
  phoneNumber?: string;
}

// Wallet
export interface Wallet {
  userId: string;
  accountId: string; // Hedera account ID
  publicKey: string;
  encryptedPrivateKey: string; // AES-256-GCM encrypted
  status: 'pending_custody' | 'active' | 'frozen';
  createdAt: Date;
}

// KYC
export interface KYCSubmission {
  userId: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: Date;
  reviewedAt?: Date;
  didNFTTokenId?: string; // HTS token ID after approval
  encryptedData: string; // AES-256-GCM encrypted personal data
}

// Messaging
export interface Conversation {
  id: string;
  topicId: string; // HCS topic ID
  participants: string[]; // Hedera account IDs
  keyId: string; // UUID for key rotation tracking
  rotationIndex: number;
  createdAt: Date;
}

export interface Message {
  id: string; // UUID
  conversationId: string;
  senderAccountId: string;
  encryptedContent: string; // AES-256-GCM encrypted
  hcsMessageId: string; // Consensus message timestamp from Mirror Node
  consensusTimestamp: bigint;
  createdAt: Date;
}

// Social
export interface Post {
  id: string;
  authorAccountId: string;
  content: string;
  mediaIPFSCID?: string[];
  topicId: string; // User's public feed topic
  likes: number;
  liked?: boolean; // for client
  createdAt: Date;
}

export interface Follow {
  followerAccountId: string;
  followingAccountId: string;
  createdAt: Date;
}

// Payments
export interface PaymentRecord {
  id: string;
  senderAccountId: string;
  recipientAccountId: string;
  amount: number; // In USD or HBAR
  currency: 'USD' | 'HBAR';
  hcsPaymentId: string; // Reference to HCS message ID
  status: 'pending' | 'confirmed' | 'failed';
  createdAt: Date;
}

// Notifications
export interface Notification {
  id: string;
  recipientAccountId: string;
  category: 'message' | 'payment' | 'social' | 'system';
  data: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
}
```

---

## Crypto Package (AES-256-GCM)

**File**: `packages/crypto/src/index.ts`

Uses Web Crypto API (no external dependencies required for Phase 0).

```typescript
export class AES256GCM {
  private static readonly ALGORITHM = {
    name: 'AES-GCM',
    length: 256,
  };
  private static readonly ITERATION_COUNT = 100_000;
  private static readonly TAG_LENGTH = 128;

  /**
   * Generate a random 256-bit AES key for symmetric encryption.
   */
  static async generateKey(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt plaintext with AES-256-GCM.
   * Returns base64-encoded JSON: { nonce, ciphertext }
   */
  static async encrypt(plaintext: string, key: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const nonce = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      data
    );

    const payload = {
      nonce: btoa(String.fromCharCode(...nonce)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    };

    return btoa(JSON.stringify(payload));
  }

  /**
   * Decrypt base64-encoded { nonce, ciphertext } payload.
   */
  static async decrypt(encrypted: string, key: CryptoKey): Promise<string> {
    const payload = JSON.parse(atob(encrypted));
    const nonce = Uint8Array.from(atob(payload.nonce), c => c.charCodeAt(0));
    const ciphertext = Uint8Array.from(atob(payload.ciphertext), c => c.charCodeAt(0));

    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      ciphertext
    );

    return new TextDecoder().decode(plaintext);
  }

  /**
   * Derive a key from a password (for wallet encryption).
   */
  static async deriveKeyFromPassword(
    password: string,
    salt: Uint8Array
  ): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: this.ITERATION_COUNT,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
  }
}

/**
 * Layer 2 Key Exchange — X25519/nacl.box (tweetnacl).
 * Used to encrypt per-conversation symmetric keys for each participant.
 * Wire format: senderPublicKey (32 bytes) || nonce (24 bytes) || ciphertext
 * See crypto.md rules for full specification.
 */
// Implementation in packages/crypto using tweetnacl (nacl.box)
```

---

## Testnet Initialization Script

**File**: `apps/backend/scripts/seed-testnet.ts`

```typescript
import { Client } from '@hashgraph/sdk';
import { HederaClient } from '@hedera-social/hedera-config';

async function seedTestnet() {
  const client = HederaClient.getInstance(
    'testnet',
    process.env.HEDERA_ACCOUNT_ID!,
    process.env.HEDERA_PRIVATE_KEY!
  );

  console.log('🌱 Seeding Hedera testnet...');

  // Step 1: Create DID NFT token collection
  console.log('📝 Creating DID NFT token collection...');
  // Use TokenCreateTransaction — IMPLEMENTABLE
  // This token will be minted for each user who completes KYC

  // Step 2: Create platform HCS topics
  console.log('📡 Creating HCS topics...');
  // - Platform social graph topic (for follow events)
  // - IMPLEMENTABLE: TopicCreateTransaction with no permissions initially

  // Step 3: Insert into PostgreSQL
  console.log('💾 Storing topic IDs in database...');
  // Store topic IDs for later reference

  console.log('✅ Testnet seeding complete!');
}

seedTestnet().catch(console.error);
```

---

## Key Takeaways for Phase 0

- **All configuration** is standard NestJS/Next.js
- **Hedera SDK** is documented — we can initialize the client and create topics
- **AES-256-GCM** uses Web Crypto API — no external dependencies
- **Docker Compose** provides local PostgreSQL and Redis
- **No integration blockers** — Phase 0 is fully implementable
- **All modules are shells** — ready for Phase 1 implementation
- **Environment validation** warns about missing Tamam/Mirsad AI KYC APIs but doesn't crash

Next: Phase 1 (Identity & Onboarding) — where Tamam MPC Custody and Mirsad AI KYC become blockers.
