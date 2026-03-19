/**
 * Server-side key exchange utility for conversation creation.
 *
 * Generates a fresh AES-256 symmetric key for each conversation and
 * encrypts it for each participant using their X25519 public key via
 * nacl.box (XSalsa20-Poly1305 authenticated encryption).
 *
 * The server briefly handles the plaintext symmetric key in memory during
 * conversation creation but NEVER persists it. Only the encrypted forms
 * (one per participant) are stored in the database and submitted to HCS.
 *
 * Architecture note: In a production system, this would be done client-side.
 * For the hackathon prototype, the platform acts as a trusted key
 * distribution facilitator during conversation creation.
 */

import nacl from "tweetnacl";
import { v4 as uuidv4 } from "uuid";

/**
 * Key exchange payload submitted to HCS as the first message on a topic.
 *
 * Each entry in `keys` is the conversation symmetric key encrypted
 * specifically for that participant using their X25519 public key.
 */
export interface KeyExchangePayload {
  v: "1.0";
  type: "key_exchange";
  keys: Record<string, string>; // { "0.0.ACCOUNT_ID": "base64(encrypted_key)" }
  algorithm: "AES-256-GCM";
  keyId: string; // UUID v4 identifying this key version
  rotationIndex: number; // 0 for initial, increments on rotation
}

/**
 * Create a key exchange payload for a set of conversation participants.
 *
 * 1. Generates a random 256-bit AES symmetric key
 * 2. For each participant, encrypts the key using nacl.box with an
 *    ephemeral X25519 keypair and the participant's public key
 * 3. Returns the payload (for HCS submission) and the key ID
 *
 * Wire format per participant:
 *   ephemeralPublicKey (32 bytes) || nonce (24 bytes) || ciphertext
 *   All base64-encoded for JSON transport.
 *
 * @param participantPublicKeys - Map of accountId -> X25519 public key (32 bytes)
 * @returns The KeyExchangePayload to submit to HCS
 */
export function createKeyExchangePayload(
  participantPublicKeys: Record<string, Uint8Array>,
): KeyExchangePayload {
  // Generate random 256-bit symmetric key
  const symmetricKey = nacl.randomBytes(32);
  const keyId = uuidv4();

  const keys: Record<string, string> = {};

  for (const [accountId, publicKey] of Object.entries(participantPublicKeys)) {
    const encrypted = encryptKeyForRecipient(symmetricKey, publicKey);
    keys[accountId] = Buffer.from(encrypted).toString("base64");
  }

  return {
    v: "1.0",
    type: "key_exchange",
    keys,
    algorithm: "AES-256-GCM",
    keyId,
    rotationIndex: 0,
  };
}

/**
 * Encrypt a symmetric key for a specific recipient using nacl.box.
 *
 * Uses an ephemeral X25519 keypair so the server's long-term keys
 * are not involved in the key exchange.
 *
 * @param symmetricKey - 32-byte AES key to encrypt
 * @param recipientPublicKey - Recipient's X25519 public key (32 bytes)
 * @returns Concatenated bytes: ephemeralPublic (32) || nonce (24) || ciphertext
 */
function encryptKeyForRecipient(
  symmetricKey: Uint8Array,
  recipientPublicKey: Uint8Array,
): Uint8Array {
  const ephemeral = nacl.box.keyPair();
  const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes

  const encrypted = nacl.box(
    symmetricKey,
    nonce,
    recipientPublicKey,
    ephemeral.secretKey,
  );

  // Wire format: ephemeralPublic (32) || nonce (24) || ciphertext
  const result = new Uint8Array(32 + 24 + encrypted.length);
  result.set(ephemeral.publicKey, 0);
  result.set(nonce, 32);
  result.set(encrypted, 56);

  return result;
}
