// =============================================================================
// AES-256-GCM ENCRYPTION
// =============================================================================
// Web Crypto API implementation of AES-256-GCM encryption.
// Used for all message encryption on conversation topics.
// Reference: docs/SPECIFICATION.md Section 7.1 (Security Specification)
// =============================================================================

/**
 * Convert a Uint8Array to an ArrayBuffer.
 *
 * Required for Web Crypto API compatibility with TypeScript 5.9+,
 * where Uint8Array.buffer is typed as ArrayBufferLike (which includes SharedArrayBuffer).
 * Web Crypto API requires a strict ArrayBuffer.
 *
 * @param arr - The Uint8Array to convert
 * @returns A new ArrayBuffer containing the same bytes
 */
function toArrayBuffer(arr: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(arr.byteLength);
  new Uint8Array(buf).set(arr);
  return buf;
}

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
    toArrayBuffer(raw),
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
      iv: toArrayBuffer(nonce),
    },
    key,
    toArrayBuffer(encoded)
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
      iv: toArrayBuffer(nonce),
    },
    key,
    toArrayBuffer(ciphertext)
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
