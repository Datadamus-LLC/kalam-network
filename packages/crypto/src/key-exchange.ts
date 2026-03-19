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
import { CryptoError } from './errors';
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
 * @throws CryptoError if the key cannot be decrypted (wrong key or corrupted data)
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
    throw new CryptoError(
      'BOX_OPEN_FAILED',
      'Failed to decrypt key bundle — invalid key or corrupted data'
    );
  }

  return importKey(decrypted);
}
