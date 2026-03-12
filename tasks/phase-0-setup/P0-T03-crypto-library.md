# P0-T03: Encryption Library (packages/crypto)

| Field | Value |
|-------|-------|
| Task ID | P0-T03 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 4 hours |
| Depends On | P0-T02 (Shared Types & Constants) |
| Phase | 0 — Project Setup |
| Assignee | Any developer |

---

## Objective

Create the `@hedera-social/crypto` package that provides end-to-end encrypted messaging for the platform. This package handles:

1. **AES-256-GCM encryption/decryption** — all chat messages are encrypted with this symmetric algorithm
2. **X25519/nacl.box key exchange** — users securely distribute AES keys using X25519 keypairs (Layer 2, client-side)
3. **Client-side key storage** — securely store conversation keys indexed by topic
4. **High-level message crypto** — convenience functions combining encryption + message formatting

This is a **critical path dependency** — without it, no encrypted messaging works.

---

## Why This Matters

Hedera Social is **privacy-by-design**: all private messages are encrypted with AES-256-GCM. The platform servers never see plaintext. Only the intended recipients can decrypt.

The encryption flow:
1. Alice creates a conversation with Bob
2. She generates a random AES-256 key and encrypts it for Bob's X25519 public key (nacl.box)
3. Alice sends the encrypted key in the first "key_exchange" message on the HCS topic
4. Bob receives it, decrypts with his private key, and stores the AES key locally
5. All subsequent messages are encrypted with that AES key
6. When the group changes (member added/removed), the AES key is rotated

This package implements steps 2–5.

---

## Pre-requisites

- P0-T02 complete (packages/shared exists with types)
- Node.js 20+ with pnpm
- Working terminal in the repo root
- Familiarity with Web Crypto API and TypeScript

---

## Step-by-Step Instructions

### Step 1: Initialize the package

Navigate to the crypto package directory:

```bash
cd packages/crypto
```

Replace `package.json` with:

```json
{
  "name": "@hedera-social/crypto",
  "version": "0.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest",
    "test:ui": "vitest --ui",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@hedera-social/shared": "workspace:*",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.2.0"
  }
}
```

Create `tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "lib": ["ES2020", "DOM"]
  },
  "include": ["src/**/*"]
}
```

Install dependencies:

```bash
pnpm install
```

### Step 2: Create directory structure

```bash
mkdir -p src/__tests__
```

### Step 3: Create AES encryption module

Create `src/aes.ts`:

```typescript
// =============================================================================
// AES-256-GCM ENCRYPTION
// =============================================================================
// Web Crypto API implementation of AES-256-GCM encryption.
// Used for all message encryption on conversation topics.
// Reference: docs/SPECIFICATION.md Section 7.1 (Security Specification)
// =============================================================================

/**
 * Generate a new AES-256-GCM symmetric key.
 *
 * This key is used to encrypt all messages in a conversation.
 * It is then encrypted with each recipient's X25519 public key (nacl.box) and distributed.
 *
 * @returns A CryptoKey object suitable for AES-GCM encryption
 */
export async function generateSymmetricKey(): Promise<CryptoKey> {
  return await globalThis.crypto.subtle.generateKey(
    {
      name: 'AES-GCM',
      length: 256, // 256-bit AES
    },
    true, // extractable — we need to export it for key exchange
    ['encrypt', 'decrypt']
  );
}

/**
 * Export a CryptoKey to raw bytes (Uint8Array).
 *
 * After key exchange, we store the key locally. This function
 * converts the CryptoKey to raw bytes so it can be serialized
 * (if needed) or transmitted.
 *
 * @param key - The CryptoKey to export
 * @returns 32-byte Uint8Array (256-bit key)
 */
export async function exportKey(key: CryptoKey): Promise<Uint8Array> {
  const rawKey = await globalThis.crypto.subtle.exportKey('raw', key);
  return new Uint8Array(rawKey);
}

/**
 * Import raw bytes (Uint8Array) into a CryptoKey.
 *
 * When a key is decrypted from key exchange and stored as bytes,
 * we need to convert it back to a CryptoKey for use with encryption.
 *
 * @param raw - 32-byte Uint8Array (256-bit key)
 * @returns A CryptoKey suitable for AES-GCM encryption/decryption
 */
export async function importKey(raw: Uint8Array): Promise<CryptoKey> {
  return await globalThis.crypto.subtle.importKey(
    'raw',
    raw,
    {
      name: 'AES-GCM',
      length: 256,
    },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a cryptographically secure random nonce for AES-GCM.
 *
 * AES-GCM requires a unique nonce (number used once) for each encryption.
 * We use 96 bits (12 bytes) — the recommended size for GCM.
 *
 * CRITICAL: Each message MUST have a unique nonce. Reusing a nonce with
 * the same key breaks the security of GCM. We generate random nonces.
 *
 * @returns 12-byte Uint8Array (96-bit nonce)
 */
function generateNonce(): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(12));
}

/**
 * Encrypt plaintext with AES-256-GCM.
 *
 * The output is the ciphertext (encrypted data) + the 96-bit nonce used.
 * Both must be stored/transmitted together to allow decryption.
 *
 * Example:
 *   const key = await generateSymmetricKey();
 *   const plaintext = "Hello, World!";
 *   const { ciphertext, nonce } = await encrypt(key, plaintext);
 *   // ciphertext and nonce can be transmitted to recipients
 *
 * @param key - AES-256 CryptoKey
 * @param plaintext - String to encrypt (UTF-8 encoded)
 * @returns Object with ciphertext and nonce as Uint8Arrays
 */
export async function encrypt(
  key: CryptoKey,
  plaintext: string
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const nonce = generateNonce();
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await globalThis.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: nonce, // initialization vector = nonce in Web Crypto API
    },
    key,
    encoded
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce,
  };
}

/**
 * Decrypt AES-256-GCM ciphertext.
 *
 * Example:
 *   const plaintext = await decrypt(key, ciphertext, nonce);
 *
 * @param key - AES-256 CryptoKey
 * @param ciphertext - Encrypted data (Uint8Array)
 * @param nonce - 96-bit nonce used for encryption (Uint8Array)
 * @returns Decrypted string (UTF-8)
 * @throws If the ciphertext is corrupted or the key is wrong
 */
export async function decrypt(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array
): Promise<string> {
  const decrypted = await globalThis.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: nonce,
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

/**
 * Encrypt a JSON object with AES-256-GCM.
 *
 * Convenience function that serializes the object to JSON first,
 * then encrypts. Useful for encrypting structured data like ChatMessagePayload.
 *
 * Example:
 *   const payload: ChatMessagePayload = { ... };
 *   const { ciphertext, nonce } = await encryptJson(key, payload);
 *
 * @param key - AES-256 CryptoKey
 * @param obj - Object to serialize and encrypt
 * @returns Object with ciphertext and nonce as Uint8Arrays
 */
export async function encryptJson<T>(
  key: CryptoKey,
  obj: T
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const json = JSON.stringify(obj);
  return encrypt(key, json);
}

/**
 * Decrypt AES-256-GCM ciphertext and parse JSON.
 *
 * Inverse of encryptJson. Decrypts the ciphertext, then parses the result as JSON.
 *
 * Example:
 *   const payload = await decryptJson<ChatMessagePayload>(key, ciphertext, nonce);
 *
 * @param key - AES-256 CryptoKey
 * @param ciphertext - Encrypted data (Uint8Array)
 * @param nonce - 96-bit nonce used for encryption (Uint8Array)
 * @returns Parsed object of type T
 * @throws If the ciphertext is corrupted, key is wrong, or JSON is invalid
 */
export async function decryptJson<T>(
  key: CryptoKey,
  ciphertext: Uint8Array,
  nonce: Uint8Array
): Promise<T> {
  const json = await decrypt(key, ciphertext, nonce);
  return JSON.parse(json) as T;
}
```

### Step 4: Create key exchange module

Create `src/key-exchange.ts`:

```typescript
// =============================================================================
// KEY EXCHANGE (X25519 / nacl.box)
// =============================================================================
// Key distribution using X25519 keypairs (Layer 2 — client-side E2E encryption).
//
// Each user generates an X25519 keypair separate from their Hedera ECDSA keys.
// We use nacl.box (X25519 + XSalsa20-Poly1305) for authenticated key wrapping.
// Tamam MPC Custody is NOT involved here — it handles Layer 1 (Hedera tx signing) only.
//
// Reference: docs/SPECIFICATION.md Section 7.1 (Security Specification)
// =============================================================================

import nacl from 'tweetnacl';
import { v4 as uuidv4 } from 'uuid';
import {
  generateSymmetricKey,
  exportKey,
  importKey,
} from './aes';

/**
 * Payload returned from createKeyExchange.
 * This is the "plaintext" key exchange message submitted to HCS.
 */
export interface KeyExchangePayload {
  v: '1.0';
  type: 'key_exchange';
  keys: Record<string, string>; // { "0.0.ACCOUNT_ID": "base64(encrypted_key)" }
  algorithm: 'AES-256-GCM';
  keyId: string; // UUID v4 — identifies this key version
  rotationIndex: number; // 0 for initial, increments on rotation
}

/**
 * Generate an X25519 keypair for E2E message encryption.
 *
 * This is SEPARATE from Hedera ECDSA keys:
 * - Hedera keys (Layer 1): Transaction signing via Tamam MPC Custody
 * - X25519 keys (Layer 2): E2E message encryption, client-side only
 *
 * @returns { publicKey, secretKey } — 32 bytes each
 */
export function generateEncryptionKeyPair(): nacl.BoxKeyPair {
  return nacl.box.keyPair();
}

/**
 * Create a key exchange payload for multiple participants.
 *
 * Call this when initiating a new conversation or rotating keys:
 * 1. Generate a fresh AES-256 key
 * 2. Encrypt it for each participant's X25519 public key (nacl.box)
 * 3. Return the payload + the generated key
 *
 * The returned key should be stored locally.
 * The returned payload should be submitted as the first message to the HCS topic.
 *
 * @param participantPublicKeys - Map of accountId -> X25519 public key (32 bytes)
 * @returns { payload, cryptoKey } — submit payload to HCS, store cryptoKey locally
 */
export async function createKeyExchange(
  participantPublicKeys: Record<string, Uint8Array>
): Promise<{
  payload: KeyExchangePayload;
  cryptoKey: CryptoKey;
}> {
  const symmetricKey = await generateSymmetricKey();
  const symmetricKeyBytes = await exportKey(symmetricKey);

  const keyId = uuidv4();
  const rotationIndex = 0;

  const keys: Record<string, string> = {};

  for (const [accountId, publicKey] of Object.entries(participantPublicKeys)) {
    const wrapped = encryptForRecipient(symmetricKeyBytes, publicKey);
    keys[accountId] = Buffer.from(wrapped).toString('base64');
  }

  const payload: KeyExchangePayload = {
    v: '1.0',
    type: 'key_exchange',
    keys,
    algorithm: 'AES-256-GCM',
    keyId,
    rotationIndex,
  };

  return {
    payload,
    cryptoKey: symmetricKey,
  };
}

/**
 * Encrypt a symmetric key for a specific recipient using nacl.box.
 *
 * Uses X25519 Diffie-Hellman + XSalsa20-Poly1305 authenticated encryption:
 * 1. Generate ephemeral X25519 keypair
 * 2. nacl.box handles ECDH + encryption + authentication
 * 3. Return: ephemeralPublic (32) || nonce (24) || ciphertext
 *
 * @param symmetricKeyBytes - 32-byte AES key to wrap
 * @param recipientPublicKey - Recipient's X25519 public key (32 bytes)
 * @returns Encrypted bytes: ephemeralPublic || nonce || ciphertext
 */
function encryptForRecipient(
  symmetricKeyBytes: Uint8Array,
  recipientPublicKey: Uint8Array
): Uint8Array {
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes

  const encrypted = nacl.box(
    symmetricKeyBytes,
    nonce,
    recipientPublicKey,
    ephemeral.secretKey,
  );

  // Concatenate: ephemeralPublic (32) || nonce (24) || ciphertext
  const result = new Uint8Array(32 + 24 + encrypted.length);
  result.set(ephemeral.publicKey, 0);
  result.set(nonce, 32);
  result.set(encrypted, 56);

  return result;
}

/**
 * Decrypt a key bundle to retrieve the AES key.
 *
 * Call this when you receive a key_exchange message:
 * 1. Find your account ID in the keys object
 * 2. Get the base64 string
 * 3. Call this function with your X25519 secret key
 * 4. Returns the CryptoKey for use with encrypt/decrypt
 *
 * @param encryptedKeyBase64 - Base64 string from key_exchange.keys[yourAccountId]
 * @param mySecretKey - Your X25519 secret key (32 bytes)
 * @returns The AES-256 CryptoKey for this conversation
 *
 * @throws If the key cannot be decrypted (wrong key or corrupted data)
 */
export async function decryptKeyBundle(
  encryptedKeyBase64: string,
  mySecretKey: Uint8Array
): Promise<CryptoKey> {
  const data = Buffer.from(encryptedKeyBase64, 'base64');

  // Extract: ephemeralPublic (32) || nonce (24) || ciphertext
  const ephemeralPublic = data.subarray(0, 32);
  const nonce = data.subarray(32, 56);
  const ciphertext = data.subarray(56);

  const decrypted = nacl.box.open(ciphertext, nonce, ephemeralPublic, mySecretKey);

  if (!decrypted) {
    throw new Error('Failed to decrypt key bundle — invalid key or corrupted data');
  }

  return importKey(decrypted);
}
```

### Step 5: Create key storage module

Create `src/key-store.ts`:

```typescript
// =============================================================================
// CLIENT-SIDE KEY STORAGE
// =============================================================================
// In-memory store of conversation AES keys, indexed by topic ID.
// On a real app, this would use encrypted local storage (Web Crypto API storage).
// For hackathon, we use in-memory Map (keys lost on page refresh).
//
// Reference: docs/SPECIFICATION.md Section 7.1 (Key storage - client)
// =============================================================================

/**
 * Metadata for a stored key.
 */
export interface StoredKeyMetadata {
  keyId: string; // UUID v4 from key exchange
  key: CryptoKey; // The actual AES-256 CryptoKey
  rotationIndex: number; // Current rotation count
}

/**
 * In-memory store of conversation keys.
 * Maps: topicId -> { keyId, key, rotationIndex }
 */
const keyStore = new Map<string, StoredKeyMetadata>();

/**
 * Store an AES key for a conversation topic.
 *
 * Example:
 *   await storeKey('0.0.12345', { keyId: 'uuid...', key: cryptoKey, rotationIndex: 0 });
 *
 * @param topicId - HCS Topic ID, e.g., "0.0.12345"
 * @param metadata - Key metadata including the CryptoKey
 */
export async function storeKey(
  topicId: string,
  metadata: StoredKeyMetadata
): Promise<void> {
  keyStore.set(topicId, metadata);
}

/**
 * Retrieve the AES key for a conversation topic.
 *
 * Example:
 *   const metadata = await getKey('0.0.12345');
 *   if (metadata) {
 *     const plaintext = await decrypt(metadata.key, ciphertext, nonce);
 *   }
 *
 * @param topicId - HCS Topic ID
 * @returns Key metadata if found, undefined otherwise
 */
export async function getKey(topicId: string): Promise<StoredKeyMetadata | undefined> {
  return keyStore.get(topicId);
}

/**
 * Remove a key from storage.
 *
 * Used when leaving a conversation or when a key is rotated out.
 *
 * @param topicId - HCS Topic ID
 */
export async function removeKey(topicId: string): Promise<void> {
  keyStore.delete(topicId);
}

/**
 * Check if a key exists for a topic.
 *
 * @param topicId - HCS Topic ID
 * @returns true if the key exists, false otherwise
 */
export async function hasKey(topicId: string): Promise<boolean> {
  return keyStore.has(topicId);
}

/**
 * Get all topic IDs that have stored keys.
 *
 * Useful for listing all conversations the user is in.
 *
 * @returns Array of topic IDs
 */
export async function getAllTopicIds(): Promise<string[]> {
  return Array.from(keyStore.keys());
}
```

### Step 6: Create high-level message crypto module

Create `src/message-crypto.ts`:

```typescript
// =============================================================================
// HIGH-LEVEL MESSAGE ENCRYPTION
// =============================================================================
// Convenience functions that combine AES encryption with message formatting.
// These are the main API that chat code calls.
//
// Reference: docs/SPECIFICATION.md Section 4.1 (Message Payloads)
// =============================================================================

import { ChatMessagePayload } from '@hedera-social/shared';
import { encryptJson, decryptJson } from './aes';
import { getKey } from './key-store';

/**
 * Encrypt a chat message payload and return base64-encoded ciphertext + nonce.
 *
 * Example:
 *   const result = await encryptMessage('0.0.12345', {
 *     v: '1.0',
 *     type: 'message',
 *     sender: '0.0.99999',
 *     ts: Date.now(),
 *     content: {
 *       type: 'text',
 *       text: 'Hello, World!'
 *     }
 *   });
 *   // result = {
 *   //   encryptedPayload: 'f7d8a9c...', // base64
 *   //   nonce: '3k2h5m8...', // base64
 *   //   keyId: 'uuid...'
 *   // }
 *
 * Submit `encryptedPayload` and `nonce` and `keyId` to HCS.
 *
 * @param topicId - HCS Topic ID for the conversation
 * @param payload - ChatMessagePayload to encrypt (should include nonce field)
 * @returns Object with base64-encoded encryptedPayload, nonce, and keyId
 * @throws If the key is not found for this topic
 */
export async function encryptMessage(
  topicId: string,
  payload: ChatMessagePayload
): Promise<{
  encryptedPayload: string; // base64
  nonce: string; // base64
  keyId: string;
}> {
  // Retrieve the stored key for this conversation
  const metadata = await getKey(topicId);
  if (!metadata) {
    throw new Error(
      `No encryption key found for topic ${topicId}. ` +
      `Did you receive the key_exchange message?`
    );
  }

  // Encrypt the payload
  const { ciphertext, nonce } = await encryptJson(metadata.key, payload);

  // Convert to base64 for transmission
  const encryptedPayloadB64 = btoa(String.fromCharCode(...ciphertext));
  const nonceB64 = btoa(String.fromCharCode(...nonce));

  return {
    encryptedPayload: encryptedPayloadB64,
    nonce: nonceB64,
    keyId: metadata.keyId,
  };
}

/**
 * Decrypt an encrypted chat message and return the payload.
 *
 * Example:
 *   const plaintext = await decryptMessage(
 *     '0.0.12345',
 *     'f7d8a9c...', // base64 ciphertext
 *     '3k2h5m8...', // base64 nonce
 *     'uuid...'  // keyId
 *   );
 *
 * @param topicId - HCS Topic ID for the conversation
 * @param encryptedPayload - Base64-encoded ciphertext
 * @param nonce - Base64-encoded nonce
 * @param keyId - Key ID (for future key rotation support)
 * @returns Decrypted ChatMessagePayload
 * @throws If decryption fails (wrong key, corrupted data, etc.)
 */
export async function decryptMessage(
  topicId: string,
  encryptedPayload: string,
  nonce: string,
  keyId: string
): Promise<ChatMessagePayload> {
  // Retrieve the stored key for this conversation
  const metadata = await getKey(topicId);
  if (!metadata) {
    throw new Error(
      `No encryption key found for topic ${topicId}. ` +
      `Cannot decrypt message.`
    );
  }

  // Verify the key ID matches (for rotation support)
  if (metadata.keyId !== keyId) {
    throw new Error(
      `Key ID mismatch. Expected ${metadata.keyId}, got ${keyId}. ` +
      `This message may have been encrypted with an old key. Key rotation not yet implemented.`
    );
  }

  // Decode base64 to bytes
  const binaryString = atob(encryptedPayload);
  const ciphertext = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    ciphertext[i] = binaryString.charCodeAt(i);
  }

  const nonceBinaryString = atob(nonce);
  const nonceBytes = new Uint8Array(nonceBinaryString.length);
  for (let i = 0; i < nonceBinaryString.length; i++) {
    nonceBytes[i] = nonceBinaryString.charCodeAt(i);
  }

  // Decrypt
  const payload = await decryptJson<ChatMessagePayload>(
    metadata.key,
    ciphertext,
    nonceBytes
  );

  return payload;
}
```

### Step 7: Create tests for AES encryption

Create `src/__tests__/aes.test.ts`:

```typescript
// =============================================================================
// AES ENCRYPTION TESTS
// =============================================================================
// Test the core AES-256-GCM encryption/decryption functions.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  generateSymmetricKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
} from '../aes';

describe('AES-256-GCM Encryption', () => {
  it('should generate a valid symmetric key', async () => {
    const key = await generateSymmetricKey();
    expect(key).toBeDefined();
    expect(key.type).toBe('secret');
    expect(key.algorithm).toEqual({ name: 'AES-GCM', length: 256 });
  });

  it('should export and import a key', async () => {
    const key1 = await generateSymmetricKey();
    const exported = await exportKey(key1);

    expect(exported).toBeInstanceOf(Uint8Array);
    expect(exported.length).toBe(32); // 256 bits = 32 bytes

    const key2 = await importKey(exported);
    expect(key2).toBeDefined();
    expect(key2.type).toBe('secret');
  });

  it('should encrypt and decrypt "Hello World"', async () => {
    const key = await generateSymmetricKey();
    const plaintext = 'Hello World';

    const { ciphertext, nonce } = await encrypt(key, plaintext);

    expect(ciphertext).toBeInstanceOf(Uint8Array);
    expect(nonce).toBeInstanceOf(Uint8Array);
    expect(nonce.length).toBe(12); // 96-bit nonce

    const decrypted = await decrypt(key, ciphertext, nonce);
    expect(decrypted).toBe(plaintext);
  });

  it('should encrypt and decrypt an empty string', async () => {
    const key = await generateSymmetricKey();
    const plaintext = '';

    const { ciphertext, nonce } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, ciphertext, nonce);

    expect(decrypted).toBe('');
  });

  it('should encrypt and decrypt a large payload (~800 bytes)', async () => {
    const key = await generateSymmetricKey();
    // Simulate a large message payload
    const plaintext = 'x'.repeat(800);

    const { ciphertext, nonce } = await encrypt(key, plaintext);
    const decrypted = await decrypt(key, ciphertext, nonce);

    expect(decrypted).toBe(plaintext);
  });

  it('should throw an error when decrypting with the wrong key', async () => {
    const key1 = await generateSymmetricKey();
    const key2 = await generateSymmetricKey();
    const plaintext = 'Secret Message';

    const { ciphertext, nonce } = await encrypt(key1, plaintext);

    // Attempt to decrypt with wrong key
    let decryptFailed = false;
    try {
      await decrypt(key2, ciphertext, nonce);
    } catch {
      decryptFailed = true;
    }

    expect(decryptFailed).toBe(true);
  });

  it('should produce different ciphertexts with different nonces', async () => {
    const key = await generateSymmetricKey();
    const plaintext = 'Same Message';

    const { ciphertext: ct1, nonce: nonce1 } = await encrypt(key, plaintext);
    const { ciphertext: ct2, nonce: nonce2 } = await encrypt(key, plaintext);

    // Nonces should be different (random)
    expect(nonce1).not.toEqual(nonce2);

    // Ciphertexts should be different (because nonces differ)
    expect(ct1).not.toEqual(ct2);

    // But both should decrypt to the same plaintext
    const decrypted1 = await decrypt(key, ct1, nonce1);
    const decrypted2 = await decrypt(key, ct2, nonce2);
    expect(decrypted1).toBe(plaintext);
    expect(decrypted2).toBe(plaintext);
  });

  it('should encrypt and decrypt JSON', async () => {
    const key = await generateSymmetricKey();
    const obj = {
      v: '1.0',
      type: 'message',
      sender: '0.0.12345',
      ts: 1234567890,
      content: {
        type: 'text',
        text: 'Hello from JSON',
      },
    };

    const { ciphertext, nonce } = await encryptJson(key, obj);
    const decrypted = await decryptJson<typeof obj>(key, ciphertext, nonce);

    expect(decrypted).toEqual(obj);
  });

  it('should not encrypt to plaintext (ciphertext differs from input)', async () => {
    const key = await generateSymmetricKey();
    const plaintext = 'Secret Message';
    const encoded = new TextEncoder().encode(plaintext);

    const { ciphertext } = await encrypt(key, plaintext);

    // Ciphertext should be completely different from plaintext bytes
    expect(ciphertext).not.toEqual(encoded);
  });
});
```

### Step 8: Create tests for key storage

Create `src/__tests__/key-store.test.ts`:

```typescript
// =============================================================================
// KEY STORE TESTS
// =============================================================================
// Test the client-side key storage functions.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import {
  storeKey,
  getKey,
  removeKey,
  hasKey,
  getAllTopicIds,
} from '../key-store';
import { generateSymmetricKey } from '../aes';

describe('Key Store', () => {
  beforeEach(async () => {
    // Clear the store before each test
    const topicIds = await getAllTopicIds();
    for (const topicId of topicIds) {
      await removeKey(topicId);
    }
  });

  it('should store and retrieve a key', async () => {
    const topicId = '0.0.12345';
    const key = await generateSymmetricKey();
    const metadata = {
      keyId: 'test-key-id-123',
      key,
      rotationIndex: 0,
    };

    await storeKey(topicId, metadata);
    const retrieved = await getKey(topicId);

    expect(retrieved).toBeDefined();
    expect(retrieved?.keyId).toBe('test-key-id-123');
    expect(retrieved?.rotationIndex).toBe(0);
    expect(retrieved?.key).toBe(key);
  });

  it('should remove a key', async () => {
    const topicId = '0.0.12345';
    const key = await generateSymmetricKey();

    await storeKey(topicId, {
      keyId: 'test-key-id',
      key,
      rotationIndex: 0,
    });

    // Verify key exists
    expect(await hasKey(topicId)).toBe(true);

    // Remove it
    await removeKey(topicId);

    // Verify it's gone
    expect(await hasKey(topicId)).toBe(false);
  });

  it('should return undefined for non-existent key', async () => {
    const retrieved = await getKey('0.0.99999');
    expect(retrieved).toBeUndefined();
  });

  it('should check key existence with hasKey', async () => {
    const topicId = '0.0.54321';
    const key = await generateSymmetricKey();

    // Should not exist yet
    expect(await hasKey(topicId)).toBe(false);

    // Store it
    await storeKey(topicId, {
      keyId: 'test-id',
      key,
      rotationIndex: 0,
    });

    // Should exist now
    expect(await hasKey(topicId)).toBe(true);
  });

  it('should return all topic IDs', async () => {
    const topicIds = ['0.0.100', '0.0.101', '0.0.102'];
    const key = await generateSymmetricKey();

    for (const topicId of topicIds) {
      await storeKey(topicId, {
        keyId: `key-${topicId}`,
        key,
        rotationIndex: 0,
      });
    }

    const retrieved = await getAllTopicIds();

    expect(retrieved).toHaveLength(3);
    expect(retrieved).toEqual(expect.arrayContaining(topicIds));
  });

  it('should store multiple keys for different topics', async () => {
    const key1 = await generateSymmetricKey();
    const key2 = await generateSymmetricKey();

    await storeKey('0.0.200', {
      keyId: 'key1',
      key: key1,
      rotationIndex: 0,
    });

    await storeKey('0.0.201', {
      keyId: 'key2',
      key: key2,
      rotationIndex: 0,
    });

    const retrieved1 = await getKey('0.0.200');
    const retrieved2 = await getKey('0.0.201');

    expect(retrieved1?.keyId).toBe('key1');
    expect(retrieved2?.keyId).toBe('key2');
    expect(retrieved1?.key).not.toBe(retrieved2?.key);
  });
});
```

### Step 9: Create barrel export

Create `src/index.ts`:

```typescript
// AES Encryption
export {
  generateSymmetricKey,
  exportKey,
  importKey,
  encrypt,
  decrypt,
  encryptJson,
  decryptJson,
} from './aes';

// Key Exchange
export { createKeyExchange, decryptKeyBundle, type KeyExchangePayload } from './key-exchange';

// Key Store
export {
  storeKey,
  getKey,
  removeKey,
  hasKey,
  getAllTopicIds,
  type StoredKeyMetadata,
} from './key-store';

// Message Crypto
export { encryptMessage, decryptMessage } from './message-crypto';
```

### Step 10: Build and test

```bash
cd packages/crypto
```

Build the package:

```bash
pnpm build
```

Expected output: `dist/` folder with `.js` and `.d.ts` files, no errors.

Run the tests:

```bash
pnpm test
```

Expected: All tests pass.

Watch mode for development:

```bash
pnpm dev
```

---

## Verification Steps

| # | Check | How to Verify |
|---|-------|---------------|
| 1 | Package builds | `cd packages/crypto && pnpm build` — no errors, `dist/` folder exists |
| 2 | Tests pass | `pnpm test` — all tests pass (11 total: 7 AES + 6 key-store) |
| 3 | AES encryption works | `pnpm test aes.test.ts` — roundtrip encrypt/decrypt works |
| 4 | Different nonces produce different ciphertexts | Test passes |
| 5 | Wrong key throws error on decrypt | Test passes |
| 6 | JSON encryption works | Test passes |
| 7 | Key storage works | `pnpm test key-store.test.ts` — all operations work |
| 8 | Barrel export works | `import { generateSymmetricKey } from '@hedera-social/crypto'` — no errors |
| 9 | No TypeScript errors | `pnpm lint` — no errors |
| 10 | Types are exported | Can import `KeyExchangePayload`, `StoredKeyMetadata` from the package |

---

## Definition of Done

- [ ] `pnpm build` succeeds in `packages/crypto` with no errors
- [ ] `dist/` folder exists with `.js` and `.d.ts` files
- [ ] All 13 tests pass (7 AES + 6 key-store)
- [ ] `src/aes.ts` implements full AES-256-GCM encrypt/decrypt with nonce generation
- [ ] `src/key-exchange.ts` implements key wrapping using X25519/nacl.box
- [ ] `src/key-store.ts` provides Map-based storage for conversation keys
- [ ] `src/message-crypto.ts` provides high-level `encryptMessage` / `decryptMessage` functions
- [ ] All tests in `src/__tests__/` pass
- [ ] Barrel export in `src/index.ts` re-exports all public APIs
- [ ] No TypeScript errors (`pnpm lint` passes)
- [ ] Code includes detailed comments explaining Web Crypto API usage
- [ ] Key exchange module uses nacl.box (X25519 + XSalsa20-Poly1305) for authenticated key wrapping

---

## Troubleshooting

### Issue: "crypto is not defined"

**Problem:** The code tries to use `globalThis.crypto` but it's not available.

**Solution:** This library requires the Web Crypto API. Make sure:
- Node.js version is 20+ (crypto.subtle is available)
- In browsers, HTTPS is required (crypto.getRandomValues is unavailable on HTTP)
- If running in Node.js tests, vitest should provide the crypto global. If not, use polyfill:
  ```bash
  npm install --save-dev @vitest/coverage-v8
  ```

### Issue: "Key is not extractable"

**Problem:** An imported key cannot be exported.

**Solution:** When importing a key with `importKey()`, the `extractable` parameter must be `true`. The code already does this.

### Issue: Tests fail with "wrong key" error

**Problem:** `decryptJson` throws an error even with the correct key.

**Solution:** Ensure:
1. The key used for encryption is the same key used for decryption (don't generate multiple keys)
2. The nonce is correct (not corrupted or modified)
3. The ciphertext is correct (not corrupted or modified)

### Issue: Key exchange returns encrypted key but decryption fails

**Problem:** `decryptKeyBundle()` returns a key, but decrypt fails with "operationError".

**Solution:** This is expected behavior in the hackathon version. The key wrapping is simplified. Ensure:
1. The public key format matches what's sent to `createKeyExchange()`
2. The private key format matches what's sent to `decryptKeyBundle()`
3. Both use the same key material

**Note:** Key wrapping uses nacl.box (X25519 + XSalsa20-Poly1305) which provides authenticated encryption.

### Issue: "Type not found" when importing from @hedera-social/shared

**Problem:** TypeScript can't find types like `ChatMessagePayload`.

**Solution:** Ensure P0-T02 (Shared Types) is complete and built:
```bash
cd packages/shared && pnpm build
```

Then rebuild crypto:
```bash
cd packages/crypto && pnpm build
```

### Issue: vitest not found

**Problem:** `pnpm test` fails with "vitest not found".

**Solution:** Ensure vitest is installed:
```bash
pnpm install --save-dev vitest
```

---

## Files Created

```
packages/crypto/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    (barrel export)
│   ├── aes.ts                      (AES-256-GCM encryption)
│   ├── key-exchange.ts             (X25519/nacl.box key distribution)
│   ├── key-store.ts                (client-side key storage)
│   ├── message-crypto.ts           (high-level message encryption)
│   └── __tests__/
│       ├── aes.test.ts             (7 tests for AES encryption)
│       └── key-store.test.ts       (6 tests for key storage)
└── dist/                           (generated by build)
```

---

## Implementation Notes

### Web Crypto API

This implementation uses the **Web Crypto API** (`globalThis.crypto.subtle`), which is available in:
- All modern browsers (Chrome, Firefox, Safari, Edge)
- Node.js 15+
- Workers and Service Workers

**Why Web Crypto API?**
- Minimal external dependency: `tweetnacl` for X25519/nacl.box key exchange only
- Cryptographic operations run in the browser's crypto hardware when available
- Official W3C standard

### Nonce Management

AES-GCM requires a unique nonce for each encryption with the same key. This implementation:
1. Generates a new random 96-bit nonce for each encryption
2. Returns the nonce alongside the ciphertext
3. The nonce must be transmitted alongside the ciphertext (it's not secret)
4. On decryption, both the nonce and ciphertext are needed

**Security:** Do NOT reuse a nonce with the same key. Our random generation ensures uniqueness.

### Key Exchange (X25519/nacl.box)

The key exchange uses **nacl.box** (X25519 + XSalsa20-Poly1305):
1. Generate an ephemeral X25519 keypair
2. Use nacl.box to perform ECDH + authenticated encryption
3. Transmit: ephemeralPublic (32) || nonce (24) || ciphertext (base64)

Key wrapping uses nacl.box (X25519 + XSalsa20-Poly1305), which provides proper authenticated encryption via `tweetnacl`.

### Key Storage

Keys are stored in-memory in a `Map<topicId, keyMetadata>`. This means:
- Keys are lost on page refresh (browser) or process exit (Node.js)
- No persistent storage is implemented
- For a real app, encrypt keys with `IndexedDB` or device keychain

---

## Next Steps (P0-T04+)

Once this task is complete:
- **P0-T04**: Backend API setup (Express, WebSocket, HCS integration)
- **P0-T05**: Frontend web setup (React, authentication, chat UI)
- **P0-T06**: Hedera SDK integration (account creation, HCS submission)
- **P0-T07**: End-to-end test (E2E encrypted message flow)

This crypto library is the foundation for all secure messaging in the platform.
