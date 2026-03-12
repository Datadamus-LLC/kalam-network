# Hedera Social Platform — Development Roadmap & Task Breakdown

## Document Control
| Field | Value |
|-------|-------|
| Version | 1.0 |
| Created | 2026-03-11 |
| Related | ARCHITECTURE.md, SPECIFICATION.md |
| Hackathon Deadline | 2026-03-23, 11:59 PM ET |
| Purpose | Junior-developer-ready task breakdown |

---

## HOW TO READ THIS DOCUMENT

Every task in this document follows this structure:

- **Task ID**: Unique identifier (e.g., `P0-T01`)
- **Title**: What you are building
- **Depends On**: Tasks that MUST be complete before you start
- **Inputs**: What you need (files, APIs, keys, etc.)
- **Steps**: Numbered, exact steps to follow
- **Output / Definition of Done**: How you know you are finished
- **Files to Create/Modify**: Exact file paths
- **Reference**: Which spec section to read for details
- **Hedera Transactions**: Which Hedera operations this task involves (if any)

**Priority Legend:**
- 🔴 P0 = Must have for hackathon demo (do first)
- 🟡 P1 = Important, needed for full flow
- 🟢 P2 = Nice to have, adds polish

---

# PHASE 0: PROJECT SETUP & INFRASTRUCTURE
**Timeline: Day 1**
**Goal: Everyone can run the project locally and deploy to testnet**

---

### P0-T01: Initialize Monorepo

**Depends On:** Nothing
**Estimated Time:** 2 hours

**Steps:**

1. Create a new directory called `social-platform` at the repo root.
2. Initialize it with `pnpm init` (we use pnpm workspaces).
3. Create `pnpm-workspace.yaml` at root:
   ```yaml
   packages:
     - 'apps/*'
     - 'packages/*'
   ```
4. Create the following directory structure:
   ```
   social-platform/
   ├── apps/
   │   ├── web/              # Next.js frontend
   │   └── mobile/           # React Native (future, create empty folder)
   ├── packages/
   │   ├── api/              # NestJS backend
   │   ├── shared/           # Shared TypeScript types, constants, utils
   │   └── crypto/           # Encryption library (AES-256-GCM, key exchange)
   ├── pnpm-workspace.yaml
   ├── package.json
   ├── tsconfig.base.json
   ├── .gitignore
   ├── .env.example
   └── docker-compose.yml
   ```
5. Create `tsconfig.base.json` at root:
   ```json
   {
     "compilerOptions": {
       "target": "ES2022",
       "module": "ESNext",
       "moduleResolution": "bundler",
       "strict": true,
       "esModuleInterop": true,
       "skipLibCheck": true,
       "forceConsistentCasingInFileNames": true,
       "resolveJsonModule": true,
       "declaration": true,
       "declarationMap": true,
       "sourceMap": true,
       "outDir": "./dist",
       "baseUrl": ".",
       "paths": {
         "@hedera-social/shared": ["packages/shared/src"],
         "@hedera-social/crypto": ["packages/crypto/src"],
         "@hedera-social/api": ["packages/api/src"]
       }
     }
   }
   ```
6. Create `.env.example`:
   ```env
   # Hedera
   HEDERA_NETWORK=testnet
   HEDERA_OPERATOR_ID=0.0.XXXXX
   HEDERA_OPERATOR_KEY=302e...
   HEDERA_DID_TOKEN_ID=0.0.XXXXX
   HEDERA_SOCIAL_GRAPH_TOPIC=0.0.XXXXX
   HEDERA_KYC_ATTESTATION_TOPIC=0.0.XXXXX
   HEDERA_ANNOUNCEMENTS_TOPIC=0.0.XXXXX

   # Tamam MPC Custody
   TAMAM_CUSTODY_API_URL=https://tamam-backend-staging-776426377628.us-central1.run.app
   TAMAM_CUSTODY_API_KEY=olara_...
   TAMAM_CUSTODY_WEBHOOK_SECRET=

   # Mirsad AI KYC/AML
   MIRSAD_KYC_API_URL=https://olara-api.var-meta.com      # staging
   # MIRSAD_KYC_API_URL=https://dashboard-api.olara.io    # production
   MIRSAD_KYC_CALLBACK_URL=https://api.ourplatform.com/webhooks/mirsad-ai

   # Database
   DATABASE_URL=postgresql://user:password@localhost:5432/hedera_social
   REDIS_URL=redis://localhost:6379

   # IPFS
   PINATA_API_KEY=
   PINATA_SECRET_KEY=
   PINATA_GATEWAY_URL=https://gateway.pinata.cloud/ipfs

   # JWT
   JWT_SECRET=your-secret-here
   JWT_EXPIRY=24h
   JWT_REFRESH_EXPIRY=30d

   # App
   API_PORT=3001
   WEB_PORT=3000
   CORS_ORIGIN=http://localhost:3000
   ```
7. Create `.gitignore` with: `node_modules/`, `dist/`, `.env`, `.env.local`, `*.log`, `.next/`, `coverage/`.
8. Create `docker-compose.yml`:
   ```yaml
   version: '3.8'
   services:
     postgres:
       image: postgres:16
       environment:
         POSTGRES_USER: hedera_social
         POSTGRES_PASSWORD: devpassword
         POSTGRES_DB: hedera_social
       ports:
         - "5432:5432"
       volumes:
         - pgdata:/var/lib/postgresql/data

     redis:
       image: redis:7-alpine
       ports:
         - "6379:6379"

   volumes:
     pgdata:
   ```
9. Run `pnpm install` from root to verify workspaces resolve.
10. Commit: `"chore: initialize monorepo structure with pnpm workspaces"`.

**Output / Definition of Done:**
- [ ] `pnpm install` runs without errors from repo root
- [ ] Directory structure matches the tree above
- [ ] `.env.example` contains all environment variables
- [ ] `docker-compose up -d` starts Postgres and Redis
- [ ] Can connect to Postgres at `localhost:5432` with credentials from env

**Files Created:**
- `pnpm-workspace.yaml`
- `package.json` (root)
- `tsconfig.base.json`
- `.env.example`
- `.gitignore`
- `docker-compose.yml`

---

### P0-T02: Setup `packages/shared` — Shared Types & Constants

**Depends On:** P0-T01
**Estimated Time:** 3 hours

**Steps:**

1. `cd packages/shared && pnpm init` — set name to `@hedera-social/shared`.
2. Install: `pnpm add -D typescript`.
3. Create `tsconfig.json` extending root `tsconfig.base.json`.
4. Create `src/index.ts` as barrel export.
5. Create `src/types/user.types.ts`:
   ```typescript
   export type AccountType = 'individual' | 'business';
   export type UserStatus = 'pending_wallet' | 'pending_kyc' | 'kyc_submitted' | 'active' | 'kyc_rejected';
   export type KycLevel = 'basic' | 'enhanced' | 'institutional';
   export type KybLevel = 'basic' | 'verified' | 'certified';

   export interface User {
     id: string;
     hederaAccountId: string;
     accountType: AccountType;
     email?: string;
     phone?: string;
     displayName?: string;
     bio?: string;
     avatarIpfsCid?: string;
     status: UserStatus;
     kycLevel?: KycLevel;
     didNftSerial?: number;
     didNftMetadataCid?: string;
     publicFeedTopic?: string;
     notificationTopic?: string;
     broadcastTopic?: string;
     publicKey?: string;
     createdAt: Date;
     updatedAt: Date;
   }

   export interface BusinessProfile {
     userId: string;
     companyName?: string;
     registrationNumber?: string;
     businessCategory?: string;
     kybLevel?: KybLevel;
     website?: string;
     businessHours?: Record<string, string>;
   }
   ```
6. Create `src/types/message.types.ts`:
   ```typescript
   export type MessageContentType = 'text' | 'image' | 'file' | 'voice' | 'location' | 'contact';
   export type ConversationType = 'direct' | 'group';
   export type HcsMessageType = 'message' | 'key_exchange' | 'group_meta' | 'system' | 'payment' | 'payment_request' | 'payment_split';

   export interface HcsMessagePayload {
     v: '1.0';
     type: HcsMessageType;
     sender: string; // Hedera Account ID
     ts: number;
     content: MessageContent;
     replyTo?: number; // sequence number
     nonce: string; // base64 encoded
   }

   export interface MessageContent {
     type: MessageContentType;
     text?: string;
     mediaRef?: string; // ipfs://CID
     mediaMeta?: {
       filename: string;
       mimeType: string;
       size: number;
       dimensions?: string;
     };
   }

   export interface KeyExchangePayload {
     v: '1.0';
     type: 'key_exchange';
     keys: Record<string, string>; // accountId -> base64(encrypt(Ks, pubKey))
     algorithm: 'AES-256-GCM';
     keyId: string; // uuid
     rotationIndex: number;
   }

   export interface GroupMetaPayload {
     v: '1.0';
     type: 'group_meta';
     action: 'create' | 'update';
     data: {
       name: string;
       avatar?: string;
       admin: string;
       participants: string[];
     };
   }

   export interface SystemMessagePayload {
     v: '1.0';
     type: 'system';
     sender: string;
     action: 'member_added' | 'member_removed' | 'key_rotated' | 'group_renamed';
     data: {
       actor: string;
       target: string;
       newKeyId?: string;
     };
   }
   ```
7. Create `src/types/payment.types.ts`:
   ```typescript
   export type PaymentStatus = 'confirmed' | 'failed';
   export type PaymentRequestStatus = 'pending' | 'paid' | 'declined';
   export type PaymentType = 'send' | 'request_fulfillment' | 'split_payment';
   export type SplitMethod = 'equal' | 'custom';

   export interface PaymentReceiptPayload {
     v: '1.0';
     type: 'payment';
     sender: string;
     content: {
       action: 'send';
       amount: number;
       currency: string;
       tokenId: string;
       recipient: string;
       note?: string;
       txHash: string;
       status: PaymentStatus;
       custodyTxId: string;
     };
   }

   export interface PaymentRequestPayload {
     v: '1.0';
     type: 'payment_request';
     sender: string;
     content: {
       action: 'request';
       amount: number;
       currency: string;
       note?: string;
       requestId: string;
       status: PaymentRequestStatus;
       paidTxHash?: string;
     };
   }

   export interface SplitPaymentPayload {
     v: '1.0';
     type: 'payment_split';
     sender: string;
     content: {
       action: 'split';
       totalAmount: number;
       currency: string;
       note?: string;
       splitId: string;
       splitMethod: SplitMethod;
       participants: Record<string, {
         amount: number;
         status: PaymentRequestStatus;
         txHash?: string;
       }>;
     };
   }
   ```
8. Create `src/types/social.types.ts`:
   ```typescript
   export type SocialAction = 'follow' | 'unfollow' | 'block';

   export interface SocialGraphEvent {
     v: '1.0';
     type: SocialAction;
     actor: string;
     target: string;
   }

   export interface PublicPostPayload {
     v: '1.0';
     type: 'post';
     sender: string;
     content: {
       text: string;
       media?: Array<{
         type: 'image' | 'video';
         ref: string; // ipfs://CID
         mimeType: string;
         size: number;
         dimensions?: string;
         alt?: string;
       }>;
     };
   }
   ```
9. Create `src/types/notification.types.ts`:
   ```typescript
   export type NotificationCategory = 'message' | 'payment' | 'social' | 'system';
   export type NotificationEvent = 'new_message' | 'payment_received' | 'payment_request' | 'new_follower' | 'kyc_approved' | 'group_invite';

   export interface NotificationPayload {
     v: '1.0';
     type: 'notification';
     category: NotificationCategory;
     data: {
       event: NotificationEvent;
       from?: string;
       topicId?: string;
       preview?: string; // Only for non-E2E events (follower, payment amount). Message previews NOT available server-side.
       amount?: number;
       currency?: string;
       ts: number;
     };
   }
   ```
10. Create `src/types/api.types.ts` — all request/response DTOs from Section 5 of SPECIFICATION.md. This file should have types for every API endpoint's request and response shapes. Copy them directly from the spec.
11. Create `src/constants/hedera.constants.ts`:
    ```typescript
    export const HCS_MESSAGE_MAX_BYTES = 1024;
    export const HCS_MESSAGE_COST_USD = 0.0008;
    export const HCS_TOPIC_CREATE_COST_USD = 0.01;
    export const HTS_TRANSFER_COST_USD = 0.001;
    export const HTS_MINT_COST_USD = 0.05;
    export const HTS_FREEZE_COST_USD = 0.001;
    export const ACCOUNT_CREATE_COST_USD = 0.05;

    export const MAX_GROUP_MEMBERS_INDIVIDUAL = 256;
    export const MAX_GROUP_MEMBERS_BUSINESS = 1024;
    export const MAX_TEXT_LENGTH = 800;
    export const MAX_POST_MEDIA = 4;
    export const MAX_BIO_LENGTH = 256;
    export const MAX_DISPLAY_NAME_LENGTH = 64;

    export const OTP_EXPIRY_SECONDS = 300; // 5 minutes
    export const OTP_RESEND_COOLDOWN_SECONDS = 60;
    export const TYPING_INDICATOR_TIMEOUT_MS = 5000;
    ```
12. Create `src/constants/errors.ts` with error code enums.
13. Update `src/index.ts` to re-export everything.

**Output / Definition of Done:**
- [ ] `pnpm build` in `packages/shared` compiles without errors
- [ ] All types from SPECIFICATION.md Section 4 are represented
- [ ] All API DTOs from Section 5 are typed
- [ ] Importing `@hedera-social/shared` from another package works

**Files Created:**
- `packages/shared/src/types/user.types.ts`
- `packages/shared/src/types/message.types.ts`
- `packages/shared/src/types/payment.types.ts`
- `packages/shared/src/types/social.types.ts`
- `packages/shared/src/types/notification.types.ts`
- `packages/shared/src/types/api.types.ts`
- `packages/shared/src/constants/hedera.constants.ts`
- `packages/shared/src/constants/errors.ts`
- `packages/shared/src/index.ts`

---

### P0-T03: Setup `packages/crypto` — Encryption Library

**Depends On:** P0-T02
**Estimated Time:** 4 hours
**Reference:** SPECIFICATION.md Section 7 (Security), ARCHITECTURE.md Section 5 (Encryption)

**Steps:**

1. `cd packages/crypto && pnpm init` — name: `@hedera-social/crypto`.
2. Install: `pnpm add tweetnacl tweetnacl-util @hashgraph/sdk uuid` and `pnpm add -D typescript @types/uuid vitest`.
3. Create `src/aes.ts` — AES-256-GCM encryption/decryption:
   ```typescript
   /**
    * AES-256-GCM encryption module.
    *
    * All private messages are encrypted with a per-conversation symmetric key.
    * This module handles:
    * - Generating random 256-bit symmetric keys
    * - Encrypting plaintext with AES-256-GCM (96-bit nonce)
    * - Decrypting ciphertext with AES-256-GCM
    *
    * IMPORTANT: Use Web Crypto API (globalThis.crypto.subtle) — works in
    * both Node.js and browser environments.
    */

   export async function generateSymmetricKey(): Promise<CryptoKey> {
     return globalThis.crypto.subtle.generateKey(
       { name: 'AES-GCM', length: 256 },
       true, // extractable — needed for key exchange
       ['encrypt', 'decrypt']
     );
   }

   export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
     const raw = await globalThis.crypto.subtle.exportKey('raw', key);
     return new Uint8Array(raw);
   }

   export async function importKey(raw: Uint8Array): Promise<CryptoKey> {
     return globalThis.crypto.subtle.importKey(
       'raw',
       raw,
       { name: 'AES-GCM', length: 256 },
       true,
       ['encrypt', 'decrypt']
     );
   }

   export async function encrypt(
     key: CryptoKey,
     plaintext: string
   ): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
     const nonce = globalThis.crypto.getRandomValues(new Uint8Array(12)); // 96-bit
     const encoded = new TextEncoder().encode(plaintext);
     const ciphertext = new Uint8Array(
       await globalThis.crypto.subtle.encrypt(
         { name: 'AES-GCM', iv: nonce },
         key,
         encoded
       )
     );
     return { ciphertext, nonce };
   }

   export async function decrypt(
     key: CryptoKey,
     ciphertext: Uint8Array,
     nonce: Uint8Array
   ): Promise<string> {
     const decrypted = await globalThis.crypto.subtle.decrypt(
       { name: 'AES-GCM', iv: nonce },
       key,
       ciphertext
     );
     return new TextDecoder().decode(decrypted);
   }
   ```
4. Create `src/key-exchange.ts` — X25519/nacl.box key wrapping for E2E encryption:
   ```typescript
   /**
    * Key Exchange module (Layer 2 — Client-side E2E encryption).
    *
    * When a new conversation is created:
    * 1. Generate a symmetric key (AES-256-GCM)
    * 2. For each participant: encrypt the symmetric key with their X25519 public key (nacl.box)
    * 3. Package all encrypted key bundles into a KeyExchangePayload
    * 4. Submit as the first HCS message on the conversation topic
    *
    * When receiving a key exchange message:
    * 1. Find your encrypted key bundle (by your account ID)
    * 2. Decrypt it with your X25519 private key (nacl.box.open)
    * 3. Import the symmetric key
    * 4. Store it locally for this conversation
    *
    * KEY WRAPPING APPROACH:
    * Each user generates an X25519 keypair (separate from Hedera ECDSA keys).
    * We use nacl.box (X25519 + XSalsa20-Poly1305) for key wrapping:
    * - Sender uses ephemeral X25519 keypair + recipient's X25519 public key
    * - nacl.box handles ECDH, key derivation, and authenticated encryption
    * - Tamam MPC Custody is NOT used for message encryption (Layer 1 only)
    */

   import { KeyExchangePayload } from '@hedera-social/shared';
   import { v4 as uuidv4 } from 'uuid';
   import nacl from 'tweetnacl';
   import { exportKey, generateSymmetricKey } from './aes';

   export async function createKeyExchange(
     participantPublicKeys: Record<string, Uint8Array> // accountId -> X25519 publicKey
   ): Promise<{ keyExchangePayload: KeyExchangePayload; symmetricKey: CryptoKey }> {
     const symmetricKey = await generateSymmetricKey();
     const rawKey = await exportKey(symmetricKey);
     const keyId = uuidv4();

     const encryptedKeys: Record<string, string> = {};

     for (const [accountId, publicKey] of Object.entries(participantPublicKeys)) {
       const encrypted = encryptForRecipient(rawKey, publicKey);
       encryptedKeys[accountId] = Buffer.from(encrypted).toString('base64');
     }

     return {
       keyExchangePayload: {
         v: '1.0',
         type: 'key_exchange',
         keys: encryptedKeys,
         algorithm: 'AES-256-GCM',
         keyId,
         rotationIndex: 0,
       },
       symmetricKey,
     };
   }

   function encryptForRecipient(
     symmetricKeyRaw: Uint8Array,
     recipientPublicKey: Uint8Array // X25519 public key (32 bytes)
   ): Uint8Array {
     // Generate ephemeral X25519 keypair for this encryption
     const ephemeral = nacl.box.keyPair();
     const nonce = nacl.randomBytes(nacl.box.nonceLength);

     // nacl.box: X25519 ECDH + XSalsa20-Poly1305 authenticated encryption
     const encrypted = nacl.box(symmetricKeyRaw, nonce, recipientPublicKey, ephemeral.secretKey);

     // Return: ephemeralPublic (32) || nonce (24) || ciphertext
     return Buffer.concat([ephemeral.publicKey, nonce, encrypted]);
   }

   export async function decryptKeyBundle(
     encryptedKeyBase64: string,
     myPrivateKey: Uint8Array // X25519 private key (32 bytes)
   ): Promise<CryptoKey> {
     const data = Buffer.from(encryptedKeyBase64, 'base64');

     // Extract: ephemeralPublic (32) || nonce (24) || ciphertext
     const ephemeralPublic = data.subarray(0, 32);
     const nonce = data.subarray(32, 56);
     const ciphertext = data.subarray(56);

     const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPublic, myPrivateKey);
     if (!decrypted) {
       throw new Error('Failed to decrypt key bundle — invalid key or corrupted data');
     }

     // Import decrypted bytes as AES-256-GCM CryptoKey
     return crypto.subtle.importKey('raw', decrypted, 'AES-GCM', false, ['encrypt', 'decrypt']);
   }
   ```
5. Create `src/key-store.ts` — in-memory + localStorage key cache:
   ```typescript
   /**
    * Client-side key store.
    * Maps topicId -> { keyId, symmetricKey, rotationIndex }
    *
    * On the client, keys are stored in memory during the session.
    * Optionally persisted to encrypted localStorage for cross-session access.
    *
    * The server NEVER has access to symmetric keys.
    */

   interface StoredKey {
     keyId: string;
     key: CryptoKey;
     rotationIndex: number;
   }

   const keyCache = new Map<string, StoredKey>();

   export function storeKey(topicId: string, keyId: string, key: CryptoKey, rotationIndex: number): void {
     keyCache.set(topicId, { keyId, key, rotationIndex });
   }

   export function getKey(topicId: string): StoredKey | undefined {
     return keyCache.get(topicId);
   }

   export function removeKey(topicId: string): void {
     keyCache.delete(topicId);
   }

   export function hasKey(topicId: string): boolean {
     return keyCache.has(topicId);
   }
   ```
6. Create `src/index.ts` re-exporting everything.
7. Write tests in `src/__tests__/aes.test.ts`:
   - Test: generate key, encrypt "Hello World", decrypt, verify match
   - Test: wrong key fails decryption
   - Test: different nonces produce different ciphertexts
   - Test: empty string encryption/decryption
   - Test: large payload (~800 bytes) encryption/decryption

**Output / Definition of Done:**
- [ ] `pnpm test` passes all AES tests
- [ ] `encrypt("Hello World")` → `decrypt()` returns "Hello World"
- [ ] Wrong key throws an error on decrypt
- [ ] Key exchange types are defined (implementation can be stub for now)
- [ ] Package builds and exports correctly

**Files Created:**
- `packages/crypto/src/aes.ts`
- `packages/crypto/src/key-exchange.ts`
- `packages/crypto/src/key-store.ts`
- `packages/crypto/src/index.ts`
- `packages/crypto/src/__tests__/aes.test.ts`

---

### P0-T04: Setup `packages/api` — NestJS Backend

**Depends On:** P0-T01
**Estimated Time:** 3 hours

**Steps:**

1. `cd packages/api && npx @nestjs/cli new . --skip-git --package-manager pnpm`
2. Install additional dependencies:
   ```bash
   pnpm add @hashgraph/sdk @nestjs/config @nestjs/typeorm typeorm pg
   pnpm add @nestjs/jwt @nestjs/passport passport passport-jwt
   pnpm add @nestjs/websockets @nestjs/platform-socket.io socket.io
   pnpm add @nestjs/bull bull ioredis class-validator class-transformer
   pnpm add uuid pinata @pinata/sdk
   pnpm add -D @types/passport-jwt @types/uuid
   ```
3. Create `src/config/configuration.ts` — load all env vars from `.env`.
4. Create the following module structure (empty modules for now, we fill them in later phases):
   ```
   packages/api/src/
   ├── app.module.ts
   ├── main.ts
   ├── config/
   │   └── configuration.ts
   ├── modules/
   │   ├── auth/
   │   │   ├── auth.module.ts
   │   │   ├── auth.controller.ts
   │   │   ├── auth.service.ts
   │   │   ├── jwt.strategy.ts
   │   │   └── jwt-auth.guard.ts
   │   ├── identity/
   │   │   ├── identity.module.ts
   │   │   ├── identity.controller.ts
   │   │   └── identity.service.ts
   │   ├── messaging/
   │   │   ├── messaging.module.ts
   │   │   ├── messaging.controller.ts
   │   │   ├── messaging.service.ts
   │   │   └── messaging.gateway.ts    (WebSocket)
   │   ├── social/
   │   │   ├── social.module.ts
   │   │   ├── social.controller.ts
   │   │   └── social.service.ts
   │   ├── payments/
   │   │   ├── payments.module.ts
   │   │   ├── payments.controller.ts
   │   │   └── payments.service.ts
   │   └── notifications/
   │       ├── notifications.module.ts
   │       └── notifications.service.ts
   ├── hedera/
   │   ├── hedera.module.ts
   │   ├── hedera.service.ts          (core HCS/HTS operations)
   │   └── mirror-node.service.ts     (Mirror Node queries)
   ├── integrations/
   │   ├── mirsad-ai/
   │   │   └── mirsad-ai.service.ts
   │   ├── tamam-custody/
   │   │   └── tamam-custody.service.ts
   │   └── ipfs/
   │       └── ipfs.service.ts
   └── database/
       ├── entities/                   (TypeORM entities)
       └── migrations/
   ```
5. In `app.module.ts`, register: ConfigModule, TypeOrmModule, all feature modules (even if empty).
6. Make sure `pnpm start:dev` boots without errors (it's OK if database connection fails — we set that up next).

**Output / Definition of Done:**
- [ ] `pnpm start:dev` in `packages/api` starts NestJS without compile errors
- [ ] Module structure matches the tree above
- [ ] All modules are registered in AppModule
- [ ] ConfigModule reads from `.env`

---

### P0-T05: Database Schema — TypeORM Entities & Migrations

**Depends On:** P0-T04, P0-T02
**Estimated Time:** 4 hours
**Reference:** SPECIFICATION.md Section 4.2 (PostgreSQL Schema)

**Steps:**

1. Create TypeORM entities that match EXACTLY the PostgreSQL tables from Section 4.2 of the spec. One entity per file:

2. `src/database/entities/user.entity.ts`:
   ```typescript
   import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

   @Entity('users')
   export class UserEntity {
     @PrimaryGeneratedColumn('uuid')
     id: string;

     @Column({ type: 'varchar', length: 20, unique: true })
     @Index('idx_users_hedera_account')
     hederaAccountId: string;

     @Column({ type: 'varchar', length: 10 })
     accountType: string; // 'individual' | 'business'

     @Column({ type: 'varchar', length: 255, nullable: true })
     email: string;

     @Column({ type: 'varchar', length: 20, nullable: true })
     phone: string;

     @Column({ type: 'varchar', length: 64, nullable: true })
     @Index('idx_users_display_name')
     displayName: string;

     @Column({ type: 'varchar', length: 256, nullable: true })
     bio: string;

     @Column({ type: 'varchar', length: 100, nullable: true })
     avatarIpfsCid: string;

     @Column({ type: 'varchar', length: 20, default: 'pending_wallet' })
     @Index('idx_users_status')
     status: string;

     @Column({ type: 'varchar', length: 20, nullable: true })
     kycLevel: string;

     @Column({ type: 'bigint', nullable: true })
     didNftSerial: number;

     @Column({ type: 'varchar', length: 100, nullable: true })
     didNftMetadataCid: string;

     @Column({ type: 'varchar', length: 20, nullable: true })
     publicFeedTopic: string;

     @Column({ type: 'varchar', length: 20, nullable: true })
     notificationTopic: string;

     @Column({ type: 'varchar', length: 20, nullable: true })
     broadcastTopic: string;

     @Column({ type: 'text', nullable: true })
     publicKey: string;

     @CreateDateColumn()
     createdAt: Date;

     @UpdateDateColumn()
     updatedAt: Date;
   }
   ```

3. Create remaining entities following the same pattern — one file per table:
   - `business-profile.entity.ts` — matches `business_profiles` table
   - `conversation.entity.ts` — matches `conversations` table
   - `conversation-member.entity.ts` — matches `conversation_members` table (composite PK)
   - `message-index.entity.ts` — matches `messages_index` table
   - `social-follow.entity.ts` — matches `social_follows` table (composite PK)
   - `post-index.entity.ts` — matches `posts_index` table
   - `payment-index.entity.ts` — matches `payments_index` table
   - `platform-topic.entity.ts` — matches `platform_topics` table

4. For each entity, make sure:
   - Column types match the SQL exactly (varchar lengths, nullable flags)
   - All indexes from the SQL are defined with `@Index()`
   - Composite primary keys use `@PrimaryColumn()` on both fields

5. Create an initial migration:
   ```bash
   cd packages/api
   npx typeorm migration:generate src/database/migrations/InitialSchema -d src/database/data-source.ts
   ```

6. Run the migration against local Postgres:
   ```bash
   npx typeorm migration:run -d src/database/data-source.ts
   ```

7. Verify: connect to Postgres and check all 14 tables exist with correct columns and indexes.

**Output / Definition of Done:**
- [ ] All 14 entities created, one per table from spec (9 original + 5 business: organizations, organization_members, organization_invitations, payment_requests, transactions)
- [ ] Migration runs successfully
- [ ] All tables exist in Postgres with correct columns
- [ ] All indexes from the spec exist
- [ ] NestJS app starts and connects to database

---

### P0-T06: Hedera Service — Core SDK Integration

**Depends On:** P0-T04
**Estimated Time:** 5 hours
**Reference:** SPECIFICATION.md Section 6, ARCHITECTURE.md Section 3

This is the most critical service — it wraps all Hedera SDK operations.

**Steps:**

1. Create `src/hedera/hedera.service.ts`:
   ```typescript
   import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
   import { ConfigService } from '@nestjs/config';
   import {
     Client,
     AccountId,
     PrivateKey,
     TopicCreateTransaction,
     TopicMessageSubmitTransaction,
     TopicUpdateTransaction,
     TokenMintTransaction,
     TokenBurnTransaction,
     TransferTransaction,
     TokenFreezeTransaction,
     TopicId,
     TokenId,
     Hbar,
   } from '@hashgraph/sdk';

   @Injectable()
   export class HederaService implements OnModuleInit {
     private client: Client;
     private operatorId: AccountId;
     private operatorKey: PrivateKey;
     private readonly logger = new Logger(HederaService.name);

     constructor(private config: ConfigService) {}

     onModuleInit() {
       const network = this.config.get<string>('HEDERA_NETWORK');
       this.operatorId = AccountId.fromString(this.config.get<string>('HEDERA_OPERATOR_ID'));
       this.operatorKey = PrivateKey.fromString(this.config.get<string>('HEDERA_OPERATOR_KEY'));

       if (network === 'testnet') {
         this.client = Client.forTestnet();
       } else {
         this.client = Client.forMainnet();
       }
       this.client.setOperator(this.operatorId, this.operatorKey);
       this.logger.log(`Hedera client initialized on ${network} as ${this.operatorId}`);
     }

     // ---- HCS: Topic Operations ----

     /**
      * Create a new HCS topic.
      * @param submitKey - If provided, only this key can submit messages. If null, topic is open.
      * @param adminKey - If provided, topic can be updated/deleted. If null, topic is immutable.
      * @param memo - Short description stored on-chain.
      * @returns TopicId as string (e.g., "0.0.12345")
      */
     async createTopic(options: {
       submitKey?: string; // PublicKey DER hex
       adminKey?: string;
       memo?: string;
     }): Promise<string> {
       // IMPLEMENT:
       // 1. Build TopicCreateTransaction
       // 2. Set submitKey if provided (Key.fromString)
       // 3. Set adminKey if provided
       // 4. Set memo if provided
       // 5. Execute and get receipt
       // 6. Return topicId.toString()
       throw new Error('Not implemented');
     }

     /**
      * Submit a message to an HCS topic.
      * @param topicId - The topic to submit to (e.g., "0.0.12345")
      * @param message - The message bytes (already encrypted for private topics)
      * @returns { sequenceNumber, consensusTimestamp, transactionId }
      */
     async submitMessage(topicId: string, message: Buffer): Promise<{
       sequenceNumber: number;
       consensusTimestamp: string;
       transactionId: string;
     }> {
       // IMPLEMENT:
       // 1. Build TopicMessageSubmitTransaction
       // 2. Set topicId
       // 3. Set message (Buffer)
       // 4. Execute and get receipt
       // 5. Get record for sequenceNumber and consensusTimestamp
       // 6. Return { sequenceNumber, consensusTimestamp, transactionId }
       throw new Error('Not implemented');
     }

     /**
      * Update an HCS topic metadata (admin operations only — NOT for member changes, which use application-layer access control).
      */
     async updateTopic(topicId: string, options: {
       submitKey?: string;
     }): Promise<string> {
       // IMPLEMENT
       throw new Error('Not implemented');
     }

     // ---- HTS: NFT Operations (DID) ----

     /**
      * Mint a DID NFT to a user's account.
      * @param tokenId - The DID NFT token collection ID
      * @param metadataCid - IPFS CID of the NFT metadata JSON
      * @param recipientAccountId - User's Hedera account to receive the NFT
      * @returns { serial, transactionId }
      */
     async mintDIDNft(
       tokenId: string,
       metadataCid: string,
       recipientAccountId: string
     ): Promise<{ serial: number; transactionId: string }> {
       // IMPLEMENT:
       // 1. Build TokenMintTransaction for the NFT collection
       // 2. Set metadata to bytes of the IPFS CID
       // 3. Execute and get receipt → serial number
       // 4. Transfer NFT from treasury to user account
       // 5. Return { serial, transactionId }
       throw new Error('Not implemented');
     }

     /**
      * Freeze an NFT on a user's account (makes it soulbound — cannot be transferred).
      */
     async freezeToken(
       tokenId: string,
       accountId: string
     ): Promise<string> {
       // IMPLEMENT:
       // 1. Build TokenFreezeTransaction
       // 2. Set tokenId, accountId
       // 3. Execute and get receipt
       // 4. Return transactionId
       throw new Error('Not implemented');
     }

     /**
      * Wipe NFT from user's account (needed for profile updates — wipe old, mint new).
      */
     async wipeNft(
       tokenId: string,
       accountId: string,
       serial: number
     ): Promise<string> {
       // IMPLEMENT
       throw new Error('Not implemented');
     }

     // ---- HTS: Token Transfer (Payments) ----

     /**
      * Token transfers are signed via Tamam MPC Custody.
      * This method builds the transaction; signing is done through
      * the custody service's signTransaction method.
      */
     async transferHbar(
       fromAccountId: string,
       toAccountId: string,
       amount: number // in tinybars
     ): Promise<string> {
       // IMPLEMENT
       throw new Error('Not implemented');
     }
   }
   ```

2. Create `src/hedera/mirror-node.service.ts`:
   ```typescript
   import { Injectable, Logger } from '@nestjs/common';
   import { ConfigService } from '@nestjs/config';

   /**
    * Mirror Node REST API client.
    *
    * Base URLs:
    * - Testnet: https://testnet.mirrornode.hedera.com
    * - Mainnet: https://mainnet.mirrornode.hedera.com
    *
    * Used for:
    * - Reading topic messages (GET /api/v1/topics/{topicId}/messages)
    * - Reading account info (GET /api/v1/accounts/{accountId})
    * - Reading NFT info (GET /api/v1/tokens/{tokenId}/nfts/{serial})
    * - Reading transaction info (GET /api/v1/transactions/{transactionId})
    */

   @Injectable()
   export class MirrorNodeService {
     private baseUrl: string;
     private readonly logger = new Logger(MirrorNodeService.name);

     constructor(private config: ConfigService) {
       const network = this.config.get<string>('HEDERA_NETWORK');
       this.baseUrl = network === 'testnet'
         ? 'https://testnet.mirrornode.hedera.com'
         : 'https://mainnet-public.mirrornode.hedera.com';
     }

     /**
      * Get messages from an HCS topic.
      * @param topicId - e.g., "0.0.12345"
      * @param options - pagination: sequencenumber (gt/gte/lt/lte), limit, order
      * @returns Array of topic messages
      *
      * API: GET /api/v1/topics/{topicId}/messages?limit=50&order=desc
      * Response shape: { messages: [{ consensus_timestamp, message, payer_account_id, ... }] }
      * NOTE: message field is base64-encoded
      */
     async getTopicMessages(topicId: string, options?: {
       limit?: number;
       order?: 'asc' | 'desc';
       sequenceNumberGt?: number;
       sequenceNumberLt?: number;
     }): Promise<any[]> {
       // IMPLEMENT using fetch()
       throw new Error('Not implemented');
     }

     /**
      * Get account information (Hedera account public key, balance, etc.).
      * NOTE: X25519 encryption keys are in platform DB, NOT Mirror Node.
      *
      * API: GET /api/v1/accounts/{accountId}
      * Returns: { account, key: { _type, key }, balance, ... }
      */
     async getAccountInfo(accountId: string): Promise<any> {
       // IMPLEMENT
       throw new Error('Not implemented');
     }

     /**
      * Get NFT info by token ID and serial.
      *
      * API: GET /api/v1/tokens/{tokenId}/nfts/{serial}
      * Returns: { account_id, metadata (base64), serial_number, ... }
      */
     async getNftInfo(tokenId: string, serial: number): Promise<any> {
       // IMPLEMENT
       throw new Error('Not implemented');
     }

     /**
      * Subscribe to topic messages in real-time via gRPC.
      * Used for real-time message delivery.
      *
      * NOTE: For hackathon, polling Mirror Node REST API every 1-2 seconds
      * is acceptable. gRPC subscription is a stretch goal.
      */
     async subscribeToTopic(topicId: string, onMessage: (msg: any) => void): Promise<void> {
       // IMPLEMENT: Either gRPC subscription or REST polling
       throw new Error('Not implemented');
     }
   }
   ```

3. Create `src/hedera/hedera.module.ts` exporting both services.

4. Write integration test `src/hedera/__tests__/hedera.integration.test.ts`:
   - Connect to testnet
   - Create a topic
   - Submit a message
   - Read it back from Mirror Node
   - This test requires HEDERA_OPERATOR_ID and KEY in env

**Output / Definition of Done:**
- [ ] HederaService initializes and connects to testnet
- [ ] Can create an HCS topic on testnet
- [ ] Can submit a message to the topic
- [ ] MirrorNodeService can read the message back
- [ ] All method signatures match the spec's Hedera transaction requirements

---

### P0-T07: Setup `apps/web` — Next.js Frontend

**Depends On:** P0-T01
**Estimated Time:** 3 hours

**Steps:**

1. `cd apps/web && npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint`
2. Install additional dependencies:
   ```bash
   pnpm add socket.io-client zustand @tanstack/react-query
   pnpm add lucide-react date-fns
   ```
3. Create folder structure:
   ```
   apps/web/src/
   ├── app/
   │   ├── layout.tsx
   │   ├── page.tsx              (landing/login)
   │   ├── (auth)/
   │   │   ├── register/page.tsx
   │   │   ├── verify/page.tsx
   │   │   └── kyc/page.tsx
   │   ├── (app)/
   │   │   ├── layout.tsx        (sidebar + main area)
   │   │   ├── chat/
   │   │   │   ├── page.tsx      (conversation list)
   │   │   │   └── [topicId]/page.tsx (conversation view)
   │   │   ├── feed/page.tsx
   │   │   ├── profile/
   │   │   │   ├── page.tsx      (my profile)
   │   │   │   └── [accountId]/page.tsx
   │   │   └── settings/page.tsx
   ├── components/
   │   ├── ui/                   (base components: Button, Input, Avatar, etc.)
   │   ├── auth/                 (OTP form, KYC form)
   │   ├── chat/                 (MessageBubble, ChatInput, ConversationList)
   │   ├── feed/                 (PostCard, CreatePost, FeedList)
   │   ├── payments/             (SendMoney, RequestMoney, SplitPayment widgets)
   │   └── profile/              (ProfileCard, ProfileEdit)
   ├── lib/
   │   ├── api.ts               (API client using fetch, base URL config)
   │   ├── socket.ts            (Socket.io client singleton)
   │   └── crypto.ts            (imports from @hedera-social/crypto)
   ├── stores/
   │   ├── auth.store.ts        (Zustand: user, token, login/logout)
   │   ├── chat.store.ts        (Zustand: conversations, messages, keys)
   │   └── feed.store.ts        (Zustand: posts, following)
   └── hooks/
       ├── useAuth.ts
       ├── useConversation.ts
       └── useSocket.ts
   ```
4. Create `lib/api.ts` — API client:
   ```typescript
   const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

   export async function apiClient<T>(
     endpoint: string,
     options: RequestInit = {}
   ): Promise<T> {
     const token = localStorage.getItem('jwt_token');
     const res = await fetch(`${API_BASE}${endpoint}`, {
       ...options,
       headers: {
         'Content-Type': 'application/json',
         ...(token ? { Authorization: `Bearer ${token}` } : {}),
         ...options.headers,
       },
     });
     if (!res.ok) {
       const error = await res.json().catch(() => ({ message: res.statusText }));
       throw new Error(error.message || `API error: ${res.status}`);
     }
     return res.json();
   }
   ```
5. Create basic `stores/auth.store.ts` with Zustand.
6. Set up `app/layout.tsx` with QueryClientProvider, basic Tailwind styles.
7. Create placeholder pages that just show "Coming Soon" text.

**Output / Definition of Done:**
- [ ] `pnpm dev` starts Next.js at localhost:3000
- [ ] All route files exist (even if placeholder)
- [ ] API client is configured and exported
- [ ] Zustand stores are initialized
- [ ] Tailwind CSS is working

---

### P0-T08: Hedera Testnet Setup — One-Time Platform Configuration

**Depends On:** P0-T06
**Estimated Time:** 2 hours

This is a one-time setup task — create the platform-level Hedera resources on testnet.

**Steps:**

1. Create a script `scripts/setup-testnet.ts`:
   ```typescript
   /**
    * One-time testnet setup script.
    * Creates all platform-level Hedera resources.
    *
    * Run: npx ts-node scripts/setup-testnet.ts
    *
    * After running, update your .env with the output values.
    */
   ```
2. The script should:
   a. Connect to Hedera testnet with operator credentials.
   b. Create the DID NFT Token Collection:
      - Type: NON_FUNGIBLE_UNIQUE
      - Name: "HederaSocial DID"
      - Symbol: "HSDID"
      - Treasury: operator account
      - Supply key: operator key (platform mints DIDs)
      - Freeze key: operator key (to freeze/soulbound)
      - Wipe key: operator key (to update profiles)
      - NO admin key (immutable after creation)
   c. Create platform HCS topics:
      - Social Graph topic (submitKey = operator, no adminKey)
      - KYC Attestation topic (submitKey = operator, no adminKey)
      - Platform Announcements topic (submitKey = operator, no adminKey)
   d. Print all created IDs to console:
      ```
      DID Token ID: 0.0.XXXXX
      Social Graph Topic: 0.0.XXXXX
      KYC Attestation Topic: 0.0.XXXXX
      Announcements Topic: 0.0.XXXXX
      ```
   e. Also save to a `.env.testnet` file for easy copy.

3. Run the script and update `.env` with the real values.
4. Verify on [HashScan testnet](https://hashscan.io/testnet) that all resources exist.

**Output / Definition of Done:**
- [ ] Script runs successfully against testnet
- [ ] DID NFT token collection exists on HashScan
- [ ] 3 platform HCS topics exist on HashScan
- [ ] `.env` is updated with real testnet IDs
- [ ] Script is idempotent (running twice doesn't break anything — it just creates new resources)

---

# PHASE 1: IDENTITY & ONBOARDING
**Timeline: Days 2-4**
**Goal: User can register, get wallet, pass KYC, receive DID NFT**

---

### P0-T09: Auth Service — Registration & OTP

**Depends On:** P0-T04, P0-T05
**Estimated Time:** 4 hours
**Reference:** SPECIFICATION.md FR-ID-001, API Section 5.2.1

**Steps:**

1. Implement `auth.service.ts`:
   - `register(method: 'email' | 'phone', value: string)`:
     1. Validate email format (regex) or phone format (E.164).
     2. Check if user already exists in DB (query by email/phone).
     3. If exists and status = 'active': return 409 Conflict.
     4. Generate 6-digit OTP: `Math.floor(100000 + Math.random() * 900000).toString()`
     5. Store OTP in Redis with key `otp:{registrationId}` and TTL of 300 seconds.
     6. Store the registration details in Redis: `reg:{registrationId}` → `{ method, value, otp, createdAt }`.
     7. **For hackathon**: Log OTP to console (don't actually send email/SMS).
     8. **For production**: Call email/SMS service to send OTP.
     9. Return `{ registrationId, otpSent: true, expiresAt }`.

   - `verifyOtp(registrationId: string, otp: string)`:
     1. Get stored registration from Redis: `reg:{registrationId}`.
     2. If not found: return 410 Gone (expired).
     3. Compare OTP. If wrong: return 400 Bad Request, increment attempt counter.
     4. If 5+ failed attempts: delete registration, return 429.
     5. If correct: delete OTP from Redis.
     6. Create user in PostgreSQL with `status: 'pending_wallet'`.
     7. Call `identityService.createWallet(userId)` (next task).
     8. Generate JWT token with user info.
     9. Return `{ token, refreshToken, user }`.

2. Implement `auth.controller.ts`:
   - `POST /api/v1/auth/register` → calls `register()`
   - `POST /api/v1/auth/verify-otp` → calls `verifyOtp()`
   - `POST /api/v1/auth/refresh` → refreshes JWT from refresh token cookie
   - Add class-validator decorators on DTOs for input validation.

3. Implement `jwt.strategy.ts`:
   ```typescript
   // Standard Passport JWT strategy
   // Extract token from Authorization header
   // Validate: check user exists in DB, status is not 'kyc_rejected'
   // Attach user to request
   ```

4. Implement `jwt-auth.guard.ts` — standard NestJS auth guard.

**Testing Checklist:**
- [ ] `POST /register` with valid email returns registrationId and logs OTP
- [ ] `POST /verify-otp` with correct OTP returns JWT and creates user in DB
- [ ] `POST /verify-otp` with wrong OTP returns 400
- [ ] `POST /verify-otp` after 5 minutes returns 410
- [ ] JWT token allows access to protected routes
- [ ] Duplicate email returns 409

---

### P0-T10: Identity Service — Wallet Creation via Tamam MPC Custody

**Depends On:** P0-T09, P0-T06
**Estimated Time:** 4 hours
**Reference:** SPECIFICATION.md FR-ID-002, `.claude/skills/hedera-social-dev/references/custody-integration.md`

**Steps:**

1. Create `integrations/tamam-custody/tamam-custody.service.ts`:
   ```typescript
   /**
    * Tamam MPC Custody Integration.
    *
    * Tamam MPC Custody uses FROST threshold signing across 9 MPC nodes to secure user keys.
    * No single party holds the full private key.
    *
    * API Flow:
    * 1. POST /api/vaults → create vault for user
    * 2. POST /api/vaults/{vaultId}/keys → generate MPC key with createHederaAccount: true
    *    → Custody auto-creates Hedera account and returns accountId + publicKey
    * 3. POST /api/transactions → sign transactions via MPC threshold signing
    *
    * Auth: X-API-Key header with olara_{prefix}{secret}
    * Rate limits: 60/min, 1000/hr
    */

   @Injectable()
   export class TamamCustodyService {
     async createVaultAndKey(userId: string): Promise<{
       vaultId: string;
       publicKey: string;
       hederaAccountId: string;
     }> {
       // 1. POST /api/vaults → create vault
       // 2. POST /api/vaults/{vaultId}/keys with { createHederaAccount: true }
       // 3. Return { vaultId, publicKey, hederaAccountId }
     }

     async signTransaction(vaultId: string, transactionBytes: Uint8Array): Promise<Uint8Array> {
       // POST /api/transactions → submit for MPC signing
       // Poll status: PENDING_POLICY → PENDING_APPROVAL → APPROVED → SIGNING → COMPLETED
       // Return signed transaction bytes
     }
   }
   ```

2. Implement `identity.service.ts` — `createWallet(userId)`:
   1. Call `tamamCustodyService.createVaultAndKey(userId)` → get `{ vaultId, publicKey, hederaAccountId }`.
   2. Hedera account is already created by Custody API (via `createHederaAccount: true`).
   3. Client generates X25519 encryption keypair locally (Layer 2).
   4. Update user in DB: `hederaAccountId`, `publicKey`, `custodyVaultId`, `encryptionPublicKey`, `status = 'pending_kyc'`.
   5. Return the Hedera Account ID + vault ID.

3. Implement `identity.controller.ts`:
   - `GET /api/v1/auth/kyc-status` — returns current KYC status from DB.

**Testing Checklist:**
- [ ] After OTP verification, user has a Hedera Account ID in DB
- [ ] Account exists on testnet (verify on HashScan)
- [ ] User status is now `pending_kyc`
- [ ] Public key is stored in DB

---

### P0-T11: Identity Service — KYC via Mirsad AI + DID NFT Minting

**Depends On:** P0-T10, P0-T08
**Estimated Time:** 6 hours
**Reference:** SPECIFICATION.md FR-ID-003, FR-ID-004, FR-ID-005, `.claude/skills/hedera-social-dev/references/mirsad-ai-integration.md`

**Steps:**

1. Create `integrations/mirsad-ai/mirsad-ai.service.ts`:
   ```typescript
   /**
    * Mirsad AI KYC/AML Integration.
    *
    * API Flow:
    * 1. POST /api/v1/public/onboarding → submit user data for KYC screening
    *    - flow_type: "OnBoardingFlow"
    *    - blockchain_type: "HEDERA"
    *    - callback_url: our webhook endpoint
    * 2. Async callback: Mirsad AI POSTs to our callback_url with result
    *    - { request_id, status: "approved"|"rejected"|"on_hold" }
    * 3. GET /api/v1/private/ai/decision/{request_id} → check status (private endpoint)
    *
    * Staging: https://olara-api.var-meta.com
    * Production: https://dashboard-api.olara.io
    * Public endpoints require no auth header.
    */

   @Injectable()
   export class MirsadAiService {
     async submitKyc(data: {
       fullName: string;
       dateOfBirth: string;
       nationality: string;
       walletAddress: string;
       callbackUrl: string;
     }): Promise<{ requestId: string; status: string }> {
       // POST /api/v1/public/onboarding
       // with flow_type: "OnBoardingFlow", blockchain_type: "HEDERA"
     }

     async submitKyb(data: {
       companyName: string;
       registrationNumber: string;
       businessCategory: string;
       walletAddress: string;
       callbackUrl: string;
     }): Promise<{ requestId: string; status: string }> {
       // Same endpoint with business-specific payload
     }

     async getDecisionStatus(requestId: string): Promise<{
       status: 'approved' | 'rejected' | 'on_hold';
       reason?: string;
     }> {
       // GET /api/v1/private/ai/decision/{requestId}
       // Note: private endpoint auth mechanism TBD
     }
   }
   ```

2. Create `integrations/ipfs/ipfs.service.ts`:
   ```typescript
   /**
    * IPFS/Pinata Integration.
    * Uploads files and JSON to IPFS, returns CID.
    */
   import PinataSDK from '@pinata/sdk';

   @Injectable()
   export class IpfsService {
     private pinata: PinataSDK;

     constructor(private config: ConfigService) {
       this.pinata = new PinataSDK(
         this.config.get('PINATA_API_KEY'),
         this.config.get('PINATA_SECRET_KEY')
       );
     }

     async uploadJson(data: object, name: string): Promise<string> {
       // 1. Call pinata.pinJSONToIPFS(data, { pinataMetadata: { name } })
       // 2. Return IpfsHash (CID)
     }

     async uploadFile(fileBuffer: Buffer, filename: string): Promise<string> {
       // 1. Create readable stream from buffer
       // 2. Call pinata.pinFileToIPFS(stream, { pinataMetadata: { name: filename } })
       // 3. Return IpfsHash (CID)
     }

     getGatewayUrl(cid: string): string {
       return `${this.config.get('PINATA_GATEWAY_URL')}/${cid}`;
     }
   }
   ```

3. Implement DID NFT minting flow in `identity.service.ts` — `mintDIDNft(userId)`:
   1. Fetch user from DB.
   2. Construct NFT metadata JSON (see DM-ID-001 in spec).
   3. Upload metadata JSON to IPFS → get `metadataCid`.
   4. If user has avatar: upload avatar to IPFS → get `avatarCid`. Put in metadata.
   5. Call `hederaService.mintDIDNft(DID_TOKEN_ID, metadataCid, user.hederaAccountId)` → get `{ serial }`.
   6. Call `hederaService.freezeToken(DID_TOKEN_ID, user.hederaAccountId)` → soulbound.
   7. Submit KYC attestation to platform HCS topic:
      ```json
      { "type": "kyc_attestation", "accountId": "0.0.X", "level": "basic", "provider": "mirsad-ai", "timestamp": "ISO8601" }
      ```
   8. Create user's public feed HCS topic → store topicId.
   9. Create user's notification HCS topic → store topicId.
   10. If business: create broadcast HCS topic → store topicId.
   11. Update user: `status = 'active'`, `didNftSerial = serial`, `didNftMetadataCid = metadataCid`, topic IDs.

4. Implement `POST /api/v1/auth/kyc` endpoint:
   - Accepts multipart form data (see spec Section 5.2.1).
   - Calls `mirsadAiService.submitKyc()` or `submitKyb()`.
   - Sets user status to `kyc_submitted`.

5. Implement KYC webhook/callback endpoint `POST /api/v1/webhooks/mirsad-ai`:
   - Receives async callback from Mirsad AI when screening is complete.
   - If approved: calls `mintDIDNft(userId)`.
   - If rejected: updates user status to `kyc_rejected`.

**Testing Checklist (end-to-end flow):**
- [ ] Register with email → get OTP → verify → wallet created
- [ ] Submit KYC → status becomes `kyc_submitted`
- [ ] Auto-approve (hackathon mode) → DID NFT minted
- [ ] NFT visible on HashScan under user's account
- [ ] NFT is frozen (soulbound) — cannot be transferred
- [ ] KYC attestation message exists on attestation HCS topic
- [ ] User's public feed topic exists
- [ ] User's notification topic exists
- [ ] User status is `active`

---

### P0-T12: Identity Service — Profile View & Update

**Depends On:** P0-T11
**Estimated Time:** 3 hours
**Reference:** SPECIFICATION.md FR-ID-006, FR-ID-007

**Steps:**

1. Implement in `identity.service.ts`:
   - `getProfile(accountId)`:
     1. Query user from DB by hederaAccountId.
     2. If not found in DB: query Mirror Node for account info + NFT.
     3. Build profile response (see API spec GET /api/v1/profile/:accountId).
     4. Include stats: follower count, following count, post count from indexed tables.
     5. Return profile object.

   - `updateProfile(userId, updates)`:
     1. If avatar changed: upload new image to IPFS.
     2. Construct updated NFT metadata JSON.
     3. Upload metadata to IPFS → new CID.
     4. Wipe old DID NFT: `hederaService.wipeNft(...)`.
     5. Mint new DID NFT: `hederaService.mintDIDNft(...)`.
     6. Freeze new NFT: `hederaService.freezeToken(...)`.
     7. Update user record in DB.
     8. Return updated profile + Hedera transaction IDs.

2. Implement controller endpoints:
   - `GET /api/v1/profile/:accountId` — public, returns profile
   - `PUT /api/v1/profile/me` — authenticated, updates own profile

**Testing Checklist:**
- [ ] Can view any user's profile by account ID
- [ ] Can update display name → new NFT minted, old wiped
- [ ] Can update avatar → uploaded to IPFS, new NFT minted
- [ ] Profile stats (followers, posts) return correct counts

---

### P0-T13: Frontend — Registration & Onboarding Flow

**Depends On:** P0-T07, P0-T09, P0-T10, P0-T11
**Estimated Time:** 6 hours

**Steps:**

1. Build `app/(auth)/register/page.tsx`:
   - Input: email or phone number (toggle between the two)
   - "Continue" button calls `POST /api/v1/auth/register`
   - On success: redirect to `/verify?registrationId=X`
   - Show loading state during API call
   - Show error messages (duplicate account, invalid format)

2. Build `app/(auth)/verify/page.tsx`:
   - 6-digit OTP input (auto-focus, auto-advance between digits)
   - "Verify" button calls `POST /api/v1/auth/verify-otp`
   - Show countdown timer for OTP expiry (5 min)
   - "Resend OTP" button (disabled for 60 seconds)
   - On success: store JWT in Zustand + localStorage, redirect to `/kyc`
   - Show progress indicator: "Creating your Hedera wallet..."

3. Build `app/(auth)/kyc/page.tsx`:
   - Account type selector: "Individual" / "Business"
   - Individual form: full name, DOB, nationality, ID document upload, selfie
   - Business form: company name, registration number, category, company document
   - Submit calls `POST /api/v1/auth/kyc`
   - After submit: show "Verifying your identity..." screen
   - Poll `GET /api/v1/auth/kyc-status` every 3 seconds
   - On approved: show success animation → redirect to `/chat`
   - Show DID NFT details: "Your digital identity has been created! NFT Serial: #42"

4. Build the main app layout `app/(app)/layout.tsx`:
   - Sidebar with navigation: Chat, Feed, Profile, Settings
   - Show user's avatar, display name, Hedera Account ID in sidebar
   - Mobile-responsive (sidebar collapses to bottom nav)

**Output / Definition of Done:**
- [ ] Full registration flow works end-to-end in browser
- [ ] User sees their Hedera Account ID after wallet creation
- [ ] KYC submission works (even with mock auto-approve)
- [ ] User lands on main app after successful onboarding
- [ ] All form validations work (empty fields, invalid formats)

---

# PHASE 2: MESSAGING
**Timeline: Days 4-7**
**Goal: Users can send encrypted messages via HCS**

---

### P0-T14: Messaging Service — Create Conversation

**Depends On:** P0-T06, P0-T03, P0-T05
**Estimated Time:** 5 hours
**Reference:** SPECIFICATION.md FR-MSG-001, FR-MSG-002

**Steps:**

1. Implement in `messaging.service.ts`:
   - `createDirectConversation(senderAccountId, recipientAccountId)`:
     1. Check if conversation already exists: query `conversation_members` for both accounts in the same conversation with type='direct'.
     2. If exists: return existing conversation.
     3. Get recipient's X25519 encryption public key from DB (`users.encryption_public_key`).
     4. Get sender's X25519 encryption public key from DB.
     5. Create HCS topic with `submitKey = platform operator key` (access control enforced at application layer via JWT + DB permissions):
        - Platform signs HCS submissions on behalf of authenticated users.
        - Build using platform operator's `PublicKey`.
     6. Generate symmetric key and create key exchange payload (use `@hedera-social/crypto`).
     7. Submit key exchange message as first message on the topic.
     8. Store conversation in DB: insert into `conversations` + `conversation_members`.
     9. Return conversation object with topicId and Hedera transaction IDs.

   - `createGroupConversation(creatorAccountId, participantIds, groupName, groupAvatar?)`:
     1. Validate participant count (≤256 for individual, ≤1024 for business).
     2. Get all participants' X25519 encryption public keys from DB.
     3. Create HCS topic with `submitKey = platform operator key` (same as 1:1).
     4. Generate symmetric key + key exchange for all participants.
     5. Submit key exchange as first message.
     6. Submit group metadata as second message.
     7. Store in DB.
     8. Return conversation object.

2. Implement controller:
   - `POST /api/v1/conversations` → creates direct or group conversation
   - `GET /api/v1/conversations` → list user's conversations (paginated, sorted by last_message_at)

**Testing Checklist:**
- [ ] Creating a DM creates an HCS topic on testnet
- [ ] Key exchange message is the first message on the topic
- [ ] Both participants are stored as conversation members
- [ ] Creating a group creates topic + key exchange + group metadata
- [ ] Duplicate DM creation returns existing conversation
- [ ] Conversation list returns sorted by most recent activity

---

### P0-T15: Messaging Service — Send & Receive Messages

**Depends On:** P0-T14
**Estimated Time:** 6 hours
**Reference:** SPECIFICATION.md FR-MSG-003, FR-MSG-004, FR-MSG-005, FR-MSG-006

**Steps:**

1. Implement `messaging.service.ts` — `sendMessage(topicId, encryptedPayload, nonce, keyId)`:
   1. Validate user is a member of this conversation (query DB).
   2. Construct HCS message: the `encryptedPayload` comes pre-encrypted from the client.
   3. Submit to HCS: `hederaService.submitMessage(topicId, payload)`.
   4. Index in DB: insert into `messages_index` with type, sender, timestamp.
   5. Update conversation's `last_message_at` and `last_message_seq`.
   6. Return `{ sequenceNumber, consensusTimestamp, transactionId }`.

2. Implement message retrieval — `getMessages(topicId, options)`:
   1. Validate user is a member.
   2. Query `messages_index` for pagination metadata.
   3. Query Mirror Node for actual message content (base64 encoded, encrypted).
   4. Return encrypted messages — client decrypts them.

3. Implement the Mirror Node poller/subscriber (for real-time):
   ```typescript
   /**
    * MirrorNodePoller
    *
    * For each active conversation, poll Mirror Node every 2 seconds
    * for new messages. When found:
    * 1. Index in PostgreSQL
    * 2. Forward to connected WebSocket clients
    *
    * This runs as a background job (Bull queue or setInterval).
    *
    * For hackathon, a simple polling approach is fine.
    * For production, use gRPC topic subscription.
    */
   ```

4. Implement media messages — `uploadMedia(topicId, file)`:
   1. Upload file to IPFS via `ipfsService.uploadFile()`.
   2. Return `{ cid, gatewayUrl }`.
   3. Client constructs message payload with `mediaRef = ipfs://CID` and encrypts it.
   4. Client sends encrypted payload via `sendMessage()`.

**Testing Checklist:**
- [ ] Can send a text message → appears on HCS topic
- [ ] Can retrieve messages from a conversation
- [ ] Messages are encrypted (verify on HashScan — payload should be unreadable)
- [ ] Message index in DB is updated
- [ ] Conversation `last_message_at` is updated
- [ ] Media upload works → CID returned → message sent with media ref

---

### P0-T16: WebSocket Gateway — Real-Time Messaging

**Depends On:** P0-T15
**Estimated Time:** 4 hours
**Reference:** SPECIFICATION.md Section 5.3 (WebSocket Protocol)

**Steps:**

1. Implement `messaging.gateway.ts`:
   ```typescript
   @WebSocketGateway({ cors: true })
   export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {

     // On connection:
     // 1. Extract JWT from query params or auth header
     // 2. Validate JWT
     // 3. Load user's conversation list from DB
     // 4. Auto-subscribe to all conversation topics
     // 5. Store socket in a Map<accountId, Socket>

     // Handle 'subscribe' event:
     // 1. Verify user is member of requested topics
     // 2. Add socket to topic rooms

     // Handle 'typing' event:
     // 1. Broadcast to other members of the topic room
     // 2. Set auto-expire timer (5 seconds)

     // Handle 'read' event:
     // 1. Update last_read_seq in conversation_members
     // 2. Broadcast read receipt to other members

     // When Mirror Node poller detects a new message:
     // 1. Find all connected sockets in the topic room
     // 2. Emit 'message' event with encrypted payload
   }
   ```

2. Implement the connection between Mirror Node poller and WebSocket:
   - When poller finds a new message on any topic → emit to Gateway.
   - Gateway forwards to all connected clients in that topic's room.

3. Implement presence tracking:
   - On connect: mark user as online in Redis.
   - On disconnect: mark as offline.
   - Broadcast presence changes to contacts.

**Testing Checklist:**
- [ ] WebSocket connects with valid JWT
- [ ] Invalid JWT is rejected
- [ ] Subscribing to a topic room works
- [ ] Typing indicator broadcasts to other members
- [ ] Read receipts update in DB and broadcast
- [ ] New HCS message triggers WebSocket push to connected clients

---

### P0-T17: Frontend — Chat UI

**Depends On:** P0-T13, P0-T14, P0-T15, P0-T16
**Estimated Time:** 8 hours

**Steps:**

1. Build `components/chat/ConversationList.tsx`:
   - Fetch conversations from `GET /api/v1/conversations`
   - Show: avatar, name, timestamp, unread count (no message preview — messages are E2E encrypted, client decrypts locally)
   - Click to open conversation
   - "New Chat" button → user search → create conversation

2. Build `components/chat/ChatView.tsx`:
   - Message list with scroll (newest at bottom)
   - Each message bubble: sender avatar, text, timestamp, delivery status
   - Load older messages on scroll up (pagination)
   - Auto-scroll to bottom on new message

3. Build `components/chat/MessageBubble.tsx`:
   - Different styles for sent (right, blue) vs received (left, gray)
   - Support message types: text, image (inline preview), file (download link), voice (audio player)
   - Reply indicator (shows referenced message)
   - Payment receipt rendering (special card)

4. Build `components/chat/ChatInput.tsx`:
   - Text input with send button
   - Attachment button → file picker
   - Payment button → opens payment widget (Phase 3)
   - Typing indicator trigger (send 'typing' WS event on keystroke, debounced)

5. Build encryption integration in `lib/crypto.ts`:
   - On conversation open: check if symmetric key is in local store
   - If not: fetch key exchange message from conversation, decrypt your key bundle
   - On send: encrypt message payload with symmetric key → send encrypted to API
   - On receive: decrypt message payload with symmetric key → display

6. Wire up WebSocket in `hooks/useSocket.ts`:
   - Connect on auth
   - Subscribe to user's topics
   - Handle incoming messages → decrypt → update Zustand store
   - Handle typing indicators
   - Handle read receipts

**Output / Definition of Done:**
- [ ] Conversation list shows all chats with previews
- [ ] Opening a chat loads message history
- [ ] Sending a message → appears encrypted on HCS → decrypted for both users
- [ ] Real-time: message appears instantly for the recipient
- [ ] Typing indicator shows when the other user is typing
- [ ] Images display inline
- [ ] Files show as downloadable attachments

---

# PHASE 3: SOCIAL FEED
**Timeline: Days 7-9**
**Goal: Users can post public content and follow each other**

---

### P1-T18: Social Service — Posts

**Depends On:** P0-T06, P0-T05
**Estimated Time:** 4 hours
**Reference:** SPECIFICATION.md FR-SOCIAL-001, FR-SOCIAL-002

**Steps:**

1. Implement `social.service.ts`:
   - `createPost(authorAccountId, text, media?)`:
     1. Validate text length (≤800 chars).
     2. Validate media count (≤4).
     3. If media: they should already be uploaded to IPFS (CIDs provided).
     4. Construct PublicPostPayload (DM-SOCIAL-001 from spec).
     5. Submit to user's public feed HCS topic (plaintext — public posts are not encrypted).
     6. Index in `posts_index` table.
     7. Fan-out to followers: for each follower, update their feed cache (or query at read time).
     8. Return `{ sequenceNumber, consensusTimestamp, transactionId }`.

   - `getHomeFeed(accountId, cursor, limit)`:
     1. Get user's following list from `social_follows`.
     2. Query `posts_index` for posts by followed accounts, ordered by `consensus_timestamp DESC`.
     3. Return paginated posts with author info.

   - `getUserPosts(accountId, cursor, limit)`:
     1. Query `posts_index` filtered by `author_account_id`.
     2. Return paginated posts.

2. Controller:
   - `POST /api/v1/posts` → create post
   - `GET /api/v1/feed` → home feed
   - `GET /api/v1/profile/:accountId/posts` → user's posts

---

### P1-T19: Social Service — Follow/Unfollow & Social Graph

**Depends On:** P0-T06, P0-T08
**Estimated Time:** 3 hours
**Reference:** SPECIFICATION.md FR-SOCIAL-003, FR-SOCIAL-004

**Steps:**

1. Implement in `social.service.ts`:
   - `follow(actorAccountId, targetAccountId)`:
     1. Check not already following (query `social_follows`).
     2. Construct SocialGraphEvent: `{ type: 'follow', actor, target }`.
     3. Submit to platform Social Graph HCS topic.
     4. Insert into `social_follows` table.
     5. Send notification to target (FR-NOTIF-002).
     6. Return `{ following: true, hcsSequenceNumber, transactionId }`.

   - `unfollow(actorAccountId, targetAccountId)`:
     1. Check currently following.
     2. Submit unfollow event to Social Graph topic.
     3. Delete from `social_follows` table.

   - `getFollowers(accountId, cursor, limit)` — paginated follower list.
   - `getFollowing(accountId, cursor, limit)` — paginated following list.

2. Controller:
   - `POST /api/v1/social/follow/:accountId` → follow
   - `DELETE /api/v1/social/follow/:accountId` → unfollow
   - `GET /api/v1/social/:accountId/followers` → follower list
   - `GET /api/v1/social/:accountId/following` → following list

---

### P1-T20: Frontend — Feed & Social UI

**Depends On:** P1-T18, P1-T19, P0-T13
**Estimated Time:** 6 hours

**Steps:**

1. Build `app/(app)/feed/page.tsx` — Home Feed:
   - Fetch from `GET /api/v1/feed`
   - Infinite scroll with `@tanstack/react-query` + `useInfiniteQuery`
   - Pull-to-refresh
   - Empty state: "Follow people to see their posts"

2. Build `components/feed/PostCard.tsx`:
   - Author avatar + name + verified badge
   - Post text
   - Media grid (1-4 images)
   - Timestamp (from Hedera consensus)
   - "View on Hedera" link → opens HashScan transaction

3. Build `components/feed/CreatePost.tsx`:
   - Text input (character counter, max 800)
   - Image attach button
   - "Post" button → calls API → shows in feed

4. Build `app/(app)/profile/[accountId]/page.tsx`:
   - Profile header: avatar, name, bio, Hedera Account ID
   - Stats: followers, following, posts
   - DID NFT badge (with HashScan link)
   - Follow/Unfollow button
   - Posts tab: user's posts in chronological order

---

# PHASE 4: IN-CHAT PAYMENTS
**Timeline: Days 9-11**
**Goal: Users can send money, request money, and split payments inside chats**

---

### P0-T21: Payments Service — MPC Custody + HTS Transfers

**Depends On:** P0-T06, P0-T14
**Estimated Time:** 5 hours
**Reference:** SPECIFICATION.md FR-PAY-001, FR-PAY-002, FR-PAY-003, `.claude/skills/hedera-social-dev/references/custody-integration.md`

**Steps:**

1. Payments use the existing `TamamCustodyService` (created in T10) for transaction signing. No separate "payment rails" integration — payments are standard HTS `CryptoTransferTransaction` operations signed through MPC Custody.

   Payment flow:
   - Build `CryptoTransferTransaction` (sender → recipient, HTS token)
   - Sign via `tamamCustodyService.signTransaction(senderVaultId, txBytes)`
   - Submit signed transaction to Hedera
   - On confirmation: post receipt to conversation HCS topic

2. Implement `payments.service.ts`:
   - `sendMoney(senderAccountId, recipientAccountId, amount, currency, note, topicId)`:
     1. Validate sender has sufficient token balance (query Mirror Node).
     2. Build `CryptoTransferTransaction`.
     3. Sign via `tamamCustodyService.signTransaction(senderVaultId, txBytes)`.
     4. Submit signed transaction to Hedera network.
     5. If transfer fails: return error, do NOT post to HCS.
     6. Construct PaymentReceiptPayload (DM-PAY-001).
     7. Encrypt receipt with conversation key.
     8. Submit encrypted receipt as HCS message on conversation topic.
     9. Index in `payments_index`.
     10. Send notification to recipient.
     11. Return payment confirmation.

   - `requestMoney(requesterAccountId, amount, currency, note, topicId)`:
     1. Construct PaymentRequestPayload (DM-PAY-002) with `status: 'pending'`.
     2. Encrypt and submit to HCS.
     3. Return request details.

   - `fulfillRequest(payerAccountId, requestId, topicId)`:
     1. Find the request message in the conversation.
     2. Execute transfer via MPC Custody-signed HTS transfer.
     3. Submit updated request with `status: 'paid'` and txHash.
     4. Return confirmation.

   - `createSplit(initiatorAccountId, totalAmount, currency, note, splitMethod, participantIds, topicId)`:
     1. Calculate per-participant amounts.
     2. Construct SplitPaymentPayload (DM-PAY-003).
     3. Encrypt and submit to HCS.
     4. Return split details.

   - `paySplit(payerAccountId, splitId, topicId)`:
     1. Find split message.
     2. Execute MPC Custody-signed HTS transfer for payer's share.
     3. Submit HCS update with payer's status = 'paid'.
     4. If all paid: submit completion message.

3. Controller:
   - `POST /api/v1/payments/send`
   - `POST /api/v1/payments/request`
   - `POST /api/v1/payments/split`
   - `POST /api/v1/payments/split/:splitId/pay`

---

### P0-T22: Frontend — Payment Widgets

**Depends On:** P0-T21, P0-T17
**Estimated Time:** 6 hours

**Steps:**

1. Build `components/payments/SendMoneyWidget.tsx`:
   - Amount input with currency selector
   - Optional note field
   - Confirmation screen: "Send $50.00 to Bob?"
   - Loading state during MPC signing + HTS transfer
   - Success: show receipt card in chat

2. Build `components/payments/RequestMoneyWidget.tsx`:
   - Amount input, note (reason)
   - Shows as structured message with "Pay" button for recipient
   - Status updates: pending → paid

3. Build `components/payments/SplitPaymentWidget.tsx`:
   - Total amount input
   - Split method: equal / custom per-person amounts
   - Shows each participant's share and status
   - "Pay My Share" button for each participant
   - Progress bar showing how many have paid

4. Build `components/chat/PaymentReceipt.tsx`:
   - Special message card for payment receipts
   - Shows: amount, currency, sender → recipient
   - Status badge: confirmed (green) / failed (red)
   - "View on Hedera" link → HashScan transaction

5. Integrate payment widgets into ChatInput:
   - "$" button in chat input bar → opens payment action sheet
   - Options: Send Money, Request Money, Split Payment

---

# PHASE 5: NOTIFICATIONS & POLISH
**Timeline: Days 11-12**
**Goal: Notifications work, everything is polished**

---

### P1-T23: Notification Service

**Depends On:** P0-T06, P0-T16
**Estimated Time:** 4 hours
**Reference:** SPECIFICATION.md FR-NOTIF-001, FR-NOTIF-002, FR-NOTIF-003

**Steps:**

1. Implement `notifications.service.ts`:
   - `sendNotification(recipientAccountId, notification)`:
     1. Construct NotificationPayload (DM-NOTIF-001).
     2. Submit to recipient's notification HCS topic.
     3. If recipient is online (WebSocket connected): push via WebSocket.
     4. Future: push via FCM/APNs for mobile.

   - `getNotifications(accountId, cursor, limit)`:
     1. Query Mirror Node for user's notification topic messages.
     2. Return paginated notifications.

2. Add notification triggers in existing services:
   - `messaging.service.ts`: notify on new message
   - `social.service.ts`: notify on new follower
   - `payments.service.ts`: notify on payment received, payment request

---

### P1-T24: Frontend — Notifications UI & Profile Page

**Depends On:** P1-T23, P0-T13
**Estimated Time:** 4 hours

**Steps:**

1. Build notification bell icon in sidebar with unread count badge.
2. Build notification dropdown/panel listing recent notifications.
3. Build `app/(app)/profile/page.tsx` — My Profile:
   - Display all profile fields from DID NFT
   - Edit button → edit form → calls PUT /api/v1/profile/me
   - Show Hedera Account ID with copy button
   - Show DID NFT details with HashScan link
   - Show on-chain stats
4. Build `app/(app)/settings/page.tsx` — basic settings placeholder.

---

# PHASE 6: HACKATHON SUBMISSION PREPARATION
**Timeline: Days 12-13 (March 21-23)**
**Goal: Everything needed to submit**

---

### P0-T25: Demo Data & Happy Path Script

**Depends On:** All previous phases
**Estimated Time:** 3 hours

**Steps:**

1. Create `scripts/seed-demo.ts`:
   - Creates 3-5 demo users on testnet with complete onboarding.
   - Creates conversations between them.
   - Sends some messages.
   - Executes some payments.
   - Creates follow relationships.
   - Creates some public posts.
2. This script should produce a visually appealing demo state for the pitch video.

---

### P0-T26: README & GitHub Repository

**Depends On:** All code complete
**Estimated Time:** 2 hours

**Steps:**

1. Write `README.md` with:
   - Project overview (1 paragraph)
   - Architecture diagram (paste from ARCHITECTURE.md)
   - Tech stack list
   - Setup instructions (step by step)
   - Environment variables table
   - Hackathon track: Open Track
   - Team members
   - Screenshots
2. Ensure GitHub repo is public with proper `.gitignore`.
3. All environment variables use `.env.example` (no secrets committed).

---

### P0-T27: Pitch Deck

**Depends On:** Working demo
**Estimated Time:** 4 hours

**Steps:**

1. Create 10-12 slide pitch deck covering:
   - Slide 1: Title + tagline ("Your wallet is your digital self")
   - Slide 2: Problem — current social platforms own your data
   - Slide 3: Solution — blockchain-native social identity
   - Slide 4: How it works — user flow diagram
   - Slide 5: Hedera integration depth — show all HCS/HTS/Mirror Node usage
   - Slide 6: Security — E2E encryption architecture
   - Slide 7: Live demo highlights
   - Slide 8: Ecosystem integration — Mirsad AI KYC + Tamam MPC Custody + Tamam Consortium
   - Slide 9: On-chain metrics (transactions generated, topics created, NFTs minted)
   - Slide 10: Market opportunity
   - Slide 11: Roadmap (what's built vs. future)
   - Slide 12: Team + ask

---

### P0-T28: Demo Video Recording

**Depends On:** P0-T25 (demo data), P0-T27 (deck)
**Estimated Time:** 3 hours

**Steps:**

1. Record a 3-5 minute demo video showing:
   - User registration → wallet creation → KYC → DID NFT minting
   - Opening HashScan to show the on-chain NFT
   - Starting a conversation → sending encrypted messages
   - Showing messages on HashScan (encrypted, unreadable)
   - Sending a payment via chat → showing HTS transfer on HashScan
   - Creating a public post → showing HCS message on HashScan
   - Following a user → showing social graph event on HashScan
2. Use screen recording tool (OBS, Loom, or built-in OS recorder).
3. Add voiceover explaining each step.

---

# PHASE 7: BUSINESS FEATURES
**Timeline: Days 10-12 (March 19-21) — parallel with Phases 5-6**
**Goal: Organization tenancy, RBAC, verified badges, payment requests, transaction history**

---

### P1-T29: Organization Tenancy & RBAC Backend

**Depends On:** P0-T05 (DB Schema), P0-T09 (Auth), P0-T11 (KYC/KYB)
**Estimated Time:** 8 hours
**Priority:** P1 (high business value for hackathon judges)

**Steps:**

1. Run DB migrations to create tables: `organizations`, `organization_members`, `organization_invitations`.
2. Create NestJS module: `OrganizationModule` (`organization.controller.ts`, `organization.service.ts`, `organization.entity.ts`).
3. Implement auto-org creation hook: when KYB is approved (FR-ID-004 webhook handler), auto-create organization + set Owner role + migrate business_profiles data.
4. Implement RBAC:
   - Create `OrgPermissionGuard` (NestJS guard) that validates caller's role against required permission.
   - Create `@RequiresOrgRole('admin', 'owner')` decorator for role-based endpoint access.
   - Org context resolved from `X-Org-Context` header, validated against `organization_members` table.
5. Implement invitation flow:
   - POST endpoint to create invitation (generate 128-bit token, 7-day expiry).
   - POST endpoint to accept invitation (link user to org, assign role).
   - Record role grants on social graph HCS topic (DM-ORG-001 format).
6. Implement role management:
   - PUT endpoint to change member role (Owner only).
   - DELETE endpoint to remove member (Owner/Admin).
   - Record changes on HCS.
7. Implement org profile CRUD:
   - GET org details, PUT profile updates.
   - IPFS upload for org logo.

---

### P1-T30: Verified Business Badges

**Depends On:** P1-T29 (Organization), P0-T11 (KYC/KYB), P0-T07 (Next.js)
**Estimated Time:** 4 hours
**Priority:** P1

**Steps:**

1. Add `badge_tier` computed field to org/profile API responses (derived from `kyb_status`):
   - `pending` → gray badge (basic)
   - `verified` → blue badge (verified)
   - `certified` → gold badge (future)
2. Create `<VerifiedBadge />` React component:
   - Accepts `tier` prop, renders appropriate checkmark icon + color.
   - Tooltip on hover: "Verified by Mirsad AI on [date]" with link to HCS attestation.
3. Integrate badge into:
   - User/business profile page (next to company name).
   - Chat conversation header (when chatting with a business).
   - Search results (inline next to business name).
   - Broadcast channel listings.
4. Server-side enforcement: badge tier is NEVER set by client. Derived from `organizations.kyb_status` column only.

---

### P1-T31: Enhanced Payment Requests

**Depends On:** P0-T21 (Payment Service), P0-T14 (Conversations), P0-T22 (Payment UI)
**Estimated Time:** 6 hours
**Priority:** P1

**Steps:**

1. Run DB migration to create `payment_requests` table.
2. Enhance `PaymentService`:
   - Create payment request with unique requestId, amount, currency, description, expiry.
   - Store in `payment_requests` table + submit to HCS (DM-PAY-002 format).
   - Handle payment fulfillment: when FR-PAY-001 completes, link to requestId, submit status update HCS message (DM-PAY-004), update `payment_requests.status`.
   - Handle expiry: background job (or on-query check) to mark expired requests.
   - Handle decline: endpoint for recipient to decline.
3. Org context support: payment requests from org context use org identity and record in org transaction history.
4. Create `<PaymentRequestCard />` React component:
   - Renders: amount, description, "Pay" button, expiry countdown.
   - Status states: pending (actionable), paid (with tx link), expired, declined.
   - "Pay" button triggers pre-filled FR-PAY-001 flow.
5. Update chat message renderer to detect `payment_request` type and render card.
6. Update WebSocket to broadcast payment request status updates.

---

### P1-T32: Transaction History

**Depends On:** P0-T21 (Payment Service), P1-T29 (Organization), P1-T31 (Payment Requests)
**Estimated Time:** 6 hours
**Priority:** P1

**Steps:**

1. Run DB migration to create `transactions` table.
2. Implement `TransactionService`:
   - Record all payments (send, receive, request fulfillment, split) in `transactions` table.
   - Support personal and org context queries.
   - Implement filters: date range, direction, status, counterparty search.
   - Include on-chain proof references (HCS message seq, Hedera tx ID).
3. Create API endpoints:
   - GET `/api/v1/transactions` — paginated history with filters.
   - GET `/api/v1/transactions/:id` — full detail with on-chain proof links.
   - Org context via `X-Org-Context` header for org-level aggregation.
4. Create frontend `TransactionHistoryPage`:
   - Chronological list with filter bar (date range, direction, status).
   - Search by counterparty name or transaction ID.
   - Each row: date, counterparty (name + avatar), amount, direction icon, status badge.
   - Tap row → detail view with full metadata + "View on HashScan" link.
5. Org view: toggle personal/org in context switcher, org view aggregates across all org members.
6. Add "Transaction History" item to main navigation.

---

# TASK DEPENDENCY GRAPH

```
P0-T01 (Monorepo Setup)
├── P0-T02 (Shared Types) ──────┐
│   └── P0-T03 (Crypto Lib)     │
├── P0-T04 (NestJS Setup) ──────┤
│   ├── P0-T05 (DB Schema) ─────┤
│   └── P0-T06 (Hedera Svc) ────┤
│       └── P0-T08 (Testnet) ───┤
├── P0-T07 (Next.js Setup) ─────┤
│                                │
├── PHASE 1: IDENTITY ───────────┘
│   ├── P0-T09 (Auth/OTP)
│   ├── P0-T10 (Wallet Creation) ← depends on T09, T06
│   ├── P0-T11 (KYC + DID NFT)  ← depends on T10, T08
│   ├── P0-T12 (Profile)        ← depends on T11
│   └── P0-T13 (Frontend Auth)  ← depends on T07, T09-T11
│
├── PHASE 2: MESSAGING
│   ├── P0-T14 (Create Conv)    ← depends on T06, T03, T05
│   ├── P0-T15 (Send/Receive)   ← depends on T14
│   ├── P0-T16 (WebSocket)      ← depends on T15
│   └── P0-T17 (Frontend Chat)  ← depends on T13, T14-T16
│
├── PHASE 3: SOCIAL FEED
│   ├── P1-T18 (Posts)           ← depends on T06, T05
│   ├── P1-T19 (Follow/Unfollow)← depends on T06, T08
│   └── P1-T20 (Frontend Feed)  ← depends on T18, T19, T13
│
├── PHASE 4: PAYMENTS
│   ├── P0-T21 (Payment Svc)    ← depends on T06, T14
│   └── P0-T22 (Payment UI)     ← depends on T21, T17
│
├── PHASE 5: NOTIFICATIONS
│   ├── P1-T23 (Notif Service)  ← depends on T06, T16
│   └── P1-T24 (Notif UI)       ← depends on T23, T13
│
├── PHASE 7: BUSINESS FEATURES (parallel with Phases 5-6)
│   ├── P1-T29 (Org + RBAC)     ← depends on T05, T09, T11
│   ├── P1-T30 (Badges)         ← depends on T29, T11, T07
│   ├── P1-T31 (Pay Requests)   ← depends on T21, T14, T22
│   └── P1-T32 (Tx History)     ← depends on T21, T29, T31
│
└── PHASE 6: SUBMISSION
    ├── P0-T25 (Demo Data)       ← depends on all code incl. Phase 7
    ├── P0-T26 (README)          ← depends on all code
    ├── P0-T27 (Pitch Deck)      ← depends on working demo
    └── P0-T28 (Demo Video)      ← depends on T25, T27
```

---

# PARALLEL WORK STRATEGY

If you have multiple developers, here's how to parallelize:

| Developer A (Backend) | Developer B (Frontend) | Developer C (Hedera/Crypto) |
|----------------------|----------------------|---------------------------|
| P0-T01 (together) | P0-T01 (together) | P0-T01 (together) |
| P0-T04 (NestJS) | P0-T07 (Next.js) | P0-T02 (Shared Types) |
| P0-T05 (DB Schema) | — (wait for types) | P0-T03 (Crypto Lib) |
| P0-T09 (Auth) | P0-T13 (Auth UI) | P0-T06 (Hedera Svc) |
| P0-T10 (Wallet) | — (connect to API) | P0-T08 (Testnet Setup) |
| P0-T11 (KYC+NFT) | — (connect to API) | Help with T11 (NFT) |
| P0-T14 (Conv Svc) | P0-T17 (Chat UI) | P0-T03 cont. (Key Exchange) |
| P0-T15 (Messages) | — (connect to API) | Help with T15 (Encryption) |
| P0-T16 (WebSocket) | — (connect to WS) | P1-T18 (Social/Posts) |
| P0-T21 (Payments) | P0-T22 (Payment UI) | P1-T19 (Follow/Unfollow) |
| P1-T29 (Org+RBAC) | P1-T30 (Badges UI) | P1-T31 (Pay Requests) |
| P1-T23 (Notifs) | P1-T32 (Tx History UI) | P1-T31 cont. (Pay Request Card) |
| P1-T32 (Tx History API) | P1-T20 + T24 (Feed+Notif UI) | P0-T25 (Demo Data) |
| P0-T26 (README) | P0-T27 (Pitch Deck) | P0-T28 (Demo Video) |

---

# ESTIMATED TOTAL EFFORT

| Phase | Tasks | Estimated Hours |
|-------|-------|----------------|
| Phase 0: Setup | T01-T08 | 26 hours |
| Phase 1: Identity | T09-T13 | 23 hours |
| Phase 2: Messaging | T14-T17 | 23 hours |
| Phase 3: Social | T18-T20 | 13 hours |
| Phase 4: Payments | T21-T22 | 11 hours |
| Phase 5: Notifications | T23-T24 | 8 hours |
| Phase 7: Business Features | T29-T32 | 24 hours |
| Phase 6: Submission | T25-T28 | 12 hours |
| **TOTAL** | **32 tasks** | **~140 hours** |

With 2 developers working full-time: ~9-10 working days.
With 3 developers: ~6-7 working days.
Deadline is March 23 — start no later than March 13 to be safe.
Phase 7 runs in parallel with Phases 5-6 (T29/T31 can be built alongside notification work).

---

# CRITICAL PATH (SHORTEST PATH TO DEMO)

If time is tight, these are the absolute minimum tasks for a functioning demo:

1. P0-T01 → T02 → T04 → T05 → T06 → T08 (infrastructure)
2. P0-T09 → T10 → T11 (onboarding flow)
3. P0-T03 → T14 → T15 (encrypted messaging)
4. P0-T07 → T13 → T17 (frontend)
5. P0-T21 → T22 (payments)
6. P1-T29 → T30 (org + badges — high demo impact)
7. P1-T31 (payment requests — high demo impact)
8. P0-T25 → T28 (demo)

This critical path is ~104 hours and covers: onboarding, messaging, payments, org tenancy, badges, payment requests, and demo — the core Hedera-heavy features plus business differentiators that score highest.

**If even tighter on time**, drop T32 (transaction history) and T30 (badges are a smaller UI task that can be added last). Minimum viable business demo: T29 (org) + T31 (payment requests).
