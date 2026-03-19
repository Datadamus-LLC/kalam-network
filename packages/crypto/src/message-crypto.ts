// =============================================================================
// HIGH-LEVEL MESSAGE ENCRYPTION
// =============================================================================
// Convenience functions that combine AES encryption with message formatting.
// These are the main API that chat code calls.
//
// Reference: docs/SPECIFICATION.md Section 4.1 (Message Payloads)
// =============================================================================

import { ChatMessagePayload } from '@hedera-social/shared';
import { CryptoError } from './errors';
import { encryptJson, decryptJson } from './aes';
import { getKey } from './key-store';

/**
 * Encrypt a chat message payload and return base64-encoded ciphertext + nonce.
 *
 * Example:
 *   const result = await encryptMessage(topicId, {
 *     v: '1.0',
 *     type: 'message',
 *     sender: senderAccountId,
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
 * @throws CryptoError if the key is not found for this topic
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
    throw new CryptoError(
      'KEY_NOT_FOUND',
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
 *     topicId,
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
 * @throws CryptoError if decryption fails (wrong key, corrupted data, etc.)
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
    throw new CryptoError(
      'KEY_NOT_FOUND',
      `No encryption key found for topic ${topicId}. ` +
      `Cannot decrypt message.`
    );
  }

  // Verify the key ID matches (for rotation support)
  if (metadata.keyId !== keyId) {
    throw new CryptoError(
      'KEY_ID_MISMATCH',
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
