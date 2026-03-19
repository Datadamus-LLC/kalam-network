/**
 * Client-side AES-256-GCM encryption/decryption utilities for chat messages.
 *
 * Uses the Web Crypto API (SubtleCrypto) as specified by the project crypto rules.
 * This module provides message-level encryption (Layer 1) for the chat UI.
 *
 * NOTE: The full @hedera-social/crypto package is not yet implemented (P0-T03).
 * These utilities follow the same EncryptedData interface and conventions
 * that the crypto package will use, so migration will be straightforward.
 */

/** Encrypted message payload structure — matches @hedera-social/crypto EncryptedData */
export interface EncryptedData {
  ciphertext: string; // base64 encoded
  iv: string; // base64 encoded, 12 bytes
  tag: string; // base64 encoded, 16 bytes (GCM authentication tag)
}

export class ChatCryptoError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatCryptoError';
    this.code = code;
  }
}

/** Convert a Uint8Array to a base64 string */
function toBase64(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.byteLength; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary);
}

/** Convert a base64 string to a Uint8Array */
function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Copy a Uint8Array into a fresh ArrayBuffer.
 * Required because TypeScript 5.9+ distinguishes ArrayBufferLike (includes
 * SharedArrayBuffer) from ArrayBuffer, and the Web Crypto API requires
 * a strict ArrayBuffer.
 */
function toArrayBuffer(data: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(data.byteLength);
  new Uint8Array(buf).set(data);
  return buf;
}

/** Import a raw 32-byte key as a CryptoKey for AES-GCM */
async function importRawKey(rawKey: Uint8Array): Promise<CryptoKey> {
  if (rawKey.length !== 32) {
    throw new ChatCryptoError(
      'INVALID_KEY_LENGTH',
      'Key must be 32 bytes for AES-256',
    );
  }
  return crypto.subtle.importKey(
    'raw',
    toArrayBuffer(rawKey),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 *
 * @param plaintext - The message text to encrypt
 * @param rawKey - 32-byte AES-256 key as Uint8Array
 * @returns EncryptedData with base64-encoded ciphertext, iv, and tag
 */
export async function encryptMessage(
  plaintext: string,
  rawKey: Uint8Array,
): Promise<EncryptedData> {
  if (!plaintext) {
    throw new ChatCryptoError(
      'INVALID_PLAINTEXT',
      'Plaintext must not be empty',
    );
  }

  const key = await importRawKey(rawKey);

  // Fresh random 12-byte IV per message — NEVER reuse
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();
  const plaintextBytes = encoder.encode(plaintext);

  // AES-GCM with 128-bit tag
  const ivBuffer = toArrayBuffer(iv);
  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: ivBuffer, tagLength: 128 },
    key,
    toArrayBuffer(plaintextBytes),
  );

  const fullBuffer = new Uint8Array(ciphertextWithTag);

  // GCM appends the 16-byte auth tag to the ciphertext
  const ciphertext = fullBuffer.slice(0, fullBuffer.length - 16);
  const tag = fullBuffer.slice(fullBuffer.length - 16);

  return {
    ciphertext: toBase64(ciphertext),
    iv: toBase64(iv),
    tag: toBase64(tag),
  };
}

/**
 * Decrypt an AES-256-GCM encrypted message.
 *
 * @param encryptedData - The EncryptedData object with ciphertext, iv, and tag
 * @param rawKey - 32-byte AES-256 key as Uint8Array
 * @returns Decrypted plaintext string
 */
export async function decryptMessage(
  encryptedData: EncryptedData,
  rawKey: Uint8Array,
): Promise<string> {
  const key = await importRawKey(rawKey);

  const iv = fromBase64(encryptedData.iv);
  const ciphertext = fromBase64(encryptedData.ciphertext);
  const tag = fromBase64(encryptedData.tag);

  if (iv.length !== 12) {
    throw new ChatCryptoError('INVALID_IV', 'IV must be 12 bytes');
  }
  if (tag.length !== 16) {
    throw new ChatCryptoError('INVALID_TAG', 'Tag must be 16 bytes');
  }

  // Reconstruct ciphertext+tag for AES-GCM
  const ciphertextWithTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextWithTag.set(ciphertext, 0);
  ciphertextWithTag.set(tag, ciphertext.length);

  try {
    const ivBuffer = toArrayBuffer(iv);
    const plaintextBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer, tagLength: 128 },
      key,
      toArrayBuffer(ciphertextWithTag),
    );

    const decoder = new TextDecoder();
    return decoder.decode(plaintextBuffer);
  } catch {
    throw new ChatCryptoError(
      'DECRYPTION_FAILED',
      'Failed to decrypt message — authentication tag verification failed',
    );
  }
}

/**
 * Generate a random 256-bit conversation key.
 * Used when creating a new conversation to establish the shared symmetric key.
 */
export function generateConversationKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ─── Layer 2: X25519 Private Key Storage + Conversation Key Decryption ──────

// ─── PIN-derived key wrapping ────────────────────────────────────────────────

/**
 * Derive a 256-bit AES wrapping key from a user PIN using PBKDF2.
 * 100,000 iterations of SHA-256 — brute-force resistant.
 */
export async function deriveWrappingKey(
  pin: string,
  accountId: string,
  saltBase64: string,
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(pin + accountId),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const salt = Uint8Array.from(Buffer.from(saltBase64, 'base64'));
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Wrap (encrypt) a private key with a PIN-derived AES key.
 * Returns base64-encoded JSON: { salt, iv, ciphertext, tag }.
 */
export async function wrapPrivateKeyWithPin(
  privateKeyBase64: string,
  pin: string,
  accountId: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const saltBase64 = Buffer.from(salt).toString('base64');
  const wrappingKey = await deriveWrappingKey(pin, accountId, saltBase64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertextWithTag = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    enc.encode(privateKeyBase64),
  );
  const data = new Uint8Array(ciphertextWithTag);
  const ciphertext = data.slice(0, data.length - 16);
  const tag = data.slice(data.length - 16);
  return JSON.stringify({
    v: '2', // v2 = PIN-derived (v1 = server-wrapped)
    salt: saltBase64,
    iv: Buffer.from(iv).toString('base64'),
    ciphertext: Buffer.from(ciphertext).toString('base64'),
    tag: Buffer.from(tag).toString('base64'),
  });
}

/**
 * Unwrap (decrypt) a PIN-wrapped private key backup.
 * Returns the private key base64 string, or throws if PIN is wrong.
 */
export async function unwrapPrivateKeyWithPin(
  wrappedJson: string,
  pin: string,
  accountId: string,
): Promise<string> {
  const { v, salt, iv, ciphertext, tag } = JSON.parse(wrappedJson) as {
    v: string; salt: string; iv: string; ciphertext: string; tag: string;
  };
  if (v !== '2') throw new Error('Not a PIN-wrapped backup (v' + v + ')');
  const wrappingKey = await deriveWrappingKey(pin, accountId, salt);
  const ct = fromBase64(ciphertext);
  const t = fromBase64(tag);
  const combined = new Uint8Array(ct.length + t.length);
  combined.set(ct, 0);
  combined.set(t, ct.length);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(fromBase64(iv)) },
      wrappingKey,
      toArrayBuffer(combined),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error('Wrong PIN — cannot decrypt private key backup');
  }
}

const PRIVATE_KEY_PREFIX = 'kalam-e2e-pk:';

/** Get the localStorage key for a specific user's private key */
function privateKeyStorageKey(accountId: string): string {
  return `${PRIVATE_KEY_PREFIX}${accountId}`;
}

/** Store the X25519 private key for a specific user in localStorage. */
export function storePrivateKey(privateKeyBase64: string, accountId?: string): void {
  if (typeof window === 'undefined') return;
  // Derive key from Zustand auth store if accountId not provided
  const userId = accountId ?? (() => {
    try {
      const auth = JSON.parse(localStorage.getItem('hedera-social-auth') || '{}');
      return auth?.state?.user?.hederaAccountId as string | undefined;
    } catch { return undefined; }
  })();
  if (!userId) return;
  localStorage.setItem(privateKeyStorageKey(userId), privateKeyBase64);
}

/** Retrieve the stored X25519 private key for a specific user. Returns null if not found. */
export function getStoredPrivateKey(accountId?: string): Uint8Array | null {
  if (typeof window === 'undefined') return null;
  const userId = accountId ?? (() => {
    try {
      const auth = JSON.parse(localStorage.getItem('hedera-social-auth') || '{}');
      return auth?.state?.user?.hederaAccountId as string | undefined;
    } catch { return undefined; }
  })();
  if (!userId) return null;
  const stored = localStorage.getItem(privateKeyStorageKey(userId));
  if (!stored) return null;
  try {
    const bytes = fromBase64(stored);
    return bytes.length === 32 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * Decrypt the conversation's AES-256 symmetric key using the X25519 private key.
 *
 * Wire format (packages/crypto key-exchange.ts):
 *   senderPublicKey (32 bytes) || nonce (24 bytes) || ciphertext
 * Stored base64-encoded in encryptedKeys[accountId].
 *
 * @param encryptedKeys  Map of { accountId → base64(senderPubKey+nonce+ciphertext) }
 * @param myAccountId    Current user's Hedera account ID
 * @param myPrivateKey   X25519 private key (32 bytes)
 */
export async function decryptConversationKey(
  encryptedKeys: Record<string, string>,
  myAccountId: string,
  myPrivateKey: Uint8Array,
): Promise<Uint8Array | null> {
  const entry = encryptedKeys[myAccountId];
  if (!entry) return null;
  try {
    const nacl = (await import('tweetnacl')).default;
    const payload = fromBase64(entry);
    if (payload.length < 56) return null; // minimum: 32 + 24
    const senderPublicKey = payload.slice(0, 32);
    const nonce = payload.slice(32, 56);
    const ciphertext = payload.slice(56);
    const decrypted = nacl.box.open(ciphertext, nonce, senderPublicKey, myPrivateKey);
    return decrypted ?? null;
  } catch {
    return null;
  }
}

/**
 * Try to decrypt a message's encrypted content.
 * Returns null (silently) if decryption fails — message shows as unavailable.
 */
export async function tryDecryptMessageContent(
  encryptedContent: string,
  symmetricKey: Uint8Array,
): Promise<string | null> {
  try {
    const parsed: EncryptedData = JSON.parse(encryptedContent) as EncryptedData;
    return await decryptMessage(parsed, symmetricKey);
  } catch {
    return null;
  }
}
