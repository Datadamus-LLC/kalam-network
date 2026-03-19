// =============================================================================
// MESSAGE CRYPTO TESTS
// =============================================================================
// Test high-level message encryption/decryption functions.
// Uses real AES-256-GCM, real key store, and real Web Crypto API.
// No mocking, no faking.
// =============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import type { ChatMessagePayload } from '@hedera-social/shared';
import { encryptMessage, decryptMessage } from '../message-crypto';
import { generateSymmetricKey } from '../aes';
import { storeKey, getAllTopicIds, removeKey } from '../key-store';
import { CryptoError } from '../errors';

/**
 * Clear the in-memory key store between tests so state does not leak.
 */
async function clearKeyStore(): Promise<void> {
  const topicIds = await getAllTopicIds();
  for (const topicId of topicIds) {
    await removeKey(topicId);
  }
}

/**
 * Build a minimal valid ChatMessagePayload for text messages.
 */
function makeTextPayload(text: string): ChatMessagePayload {
  return {
    v: '1.0',
    type: 'message',
    sender: '0.0.12345',
    ts: Date.now(),
    content: {
      type: 'text',
      text,
    },
    nonce: '', // placeholder — the real nonce is added by encryptMessage
  };
}

describe('Message Crypto (encryptMessage / decryptMessage)', () => {
  beforeEach(async () => {
    await clearKeyStore();
  });

  // ---------------------------------------------------------------------------
  // encryptMessage — error cases
  // ---------------------------------------------------------------------------

  describe('encryptMessage errors', () => {
    it('should throw CryptoError KEY_NOT_FOUND when no key stored for topic', async () => {
      const payload = makeTextPayload('Hello');

      let caughtError: CryptoError | undefined;
      try {
        await encryptMessage('0.0.99999', payload);
      } catch (err) {
        caughtError = err as CryptoError;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError).toBeInstanceOf(CryptoError);
      expect(caughtError!.code).toBe('KEY_NOT_FOUND');
    });
  });

  // ---------------------------------------------------------------------------
  // decryptMessage — error cases
  // ---------------------------------------------------------------------------

  describe('decryptMessage errors', () => {
    it('should throw CryptoError KEY_NOT_FOUND when no key stored for topic', async () => {
      let caughtError: CryptoError | undefined;
      try {
        await decryptMessage('0.0.99999', 'dummyPayload', 'dummyNonce', 'some-key-id');
      } catch (err) {
        caughtError = err as CryptoError;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError).toBeInstanceOf(CryptoError);
      expect(caughtError!.code).toBe('KEY_NOT_FOUND');
    });

    it('should throw CryptoError KEY_ID_MISMATCH when keyId does not match', async () => {
      const topicId = '0.0.50001';
      const key = await generateSymmetricKey();
      await storeKey(topicId, { keyId: 'correct-key-id', key, rotationIndex: 0 });

      // Encrypt with the correct key so we have valid ciphertext
      const payload = makeTextPayload('Hello');
      const encrypted = await encryptMessage(topicId, payload);

      // Attempt to decrypt with wrong keyId
      let caughtError: CryptoError | undefined;
      try {
        await decryptMessage(
          topicId,
          encrypted.encryptedPayload,
          encrypted.nonce,
          'wrong-key-id',
        );
      } catch (err) {
        caughtError = err as CryptoError;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError).toBeInstanceOf(CryptoError);
      expect(caughtError!.code).toBe('KEY_ID_MISMATCH');
    });
  });

  // ---------------------------------------------------------------------------
  // Round-trip: encryptMessage → decryptMessage
  // ---------------------------------------------------------------------------

  describe('round-trip encryption', () => {
    it('should encrypt and decrypt a text message payload', async () => {
      const topicId = '0.0.60001';
      const keyId = 'test-key-001';
      const key = await generateSymmetricKey();
      await storeKey(topicId, { keyId, key, rotationIndex: 0 });

      const originalPayload = makeTextPayload('Hello, Hedera!');

      const encrypted = await encryptMessage(topicId, originalPayload);
      const decrypted = await decryptMessage(
        topicId,
        encrypted.encryptedPayload,
        encrypted.nonce,
        encrypted.keyId,
      );

      expect(decrypted).toEqual(originalPayload);
    });

    it('should return base64-encoded encryptedPayload and nonce', async () => {
      const topicId = '0.0.60002';
      const keyId = 'test-key-002';
      const key = await generateSymmetricKey();
      await storeKey(topicId, { keyId, key, rotationIndex: 0 });

      const payload = makeTextPayload('Test base64 output');
      const encrypted = await encryptMessage(topicId, payload);

      // Verify they are valid base64 strings
      expect(typeof encrypted.encryptedPayload).toBe('string');
      expect(typeof encrypted.nonce).toBe('string');
      expect(typeof encrypted.keyId).toBe('string');
      expect(encrypted.keyId).toBe(keyId);

      // Base64 decode should not throw
      const payloadBytes = atob(encrypted.encryptedPayload);
      const nonceBytes = atob(encrypted.nonce);

      expect(payloadBytes.length).toBeGreaterThan(0);
      expect(nonceBytes.length).toBe(12); // 96-bit AES-GCM nonce
    });

    it('should produce different ciphertext for the same message (unique nonce)', async () => {
      const topicId = '0.0.60003';
      const keyId = 'test-key-003';
      const key = await generateSymmetricKey();
      await storeKey(topicId, { keyId, key, rotationIndex: 0 });

      const payload = makeTextPayload('Same message twice');

      const encrypted1 = await encryptMessage(topicId, payload);
      const encrypted2 = await encryptMessage(topicId, payload);

      // Nonces must differ (random each time)
      expect(encrypted1.nonce).not.toBe(encrypted2.nonce);

      // Ciphertexts must differ (because nonces differ)
      expect(encrypted1.encryptedPayload).not.toBe(encrypted2.encryptedPayload);

      // But both must decrypt to the same payload
      const decrypted1 = await decryptMessage(
        topicId,
        encrypted1.encryptedPayload,
        encrypted1.nonce,
        encrypted1.keyId,
      );
      const decrypted2 = await decryptMessage(
        topicId,
        encrypted2.encryptedPayload,
        encrypted2.nonce,
        encrypted2.keyId,
      );

      expect(decrypted1).toEqual(payload);
      expect(decrypted2).toEqual(payload);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-topic isolation
  // ---------------------------------------------------------------------------

  describe('cross-topic isolation', () => {
    it('should not decrypt a message with a different topic key', async () => {
      const topicA = '0.0.70001';
      const topicB = '0.0.70002';

      const keyA = await generateSymmetricKey();
      const keyB = await generateSymmetricKey();

      await storeKey(topicA, { keyId: 'key-a', key: keyA, rotationIndex: 0 });
      await storeKey(topicB, { keyId: 'key-b', key: keyB, rotationIndex: 0 });

      const payload = makeTextPayload('Secret for topic A');
      const encrypted = await encryptMessage(topicA, payload);

      // Try to decrypt topic A's message using topic B's key
      // First, the keyId will mismatch
      let caughtError: CryptoError | undefined;
      try {
        await decryptMessage(
          topicB,
          encrypted.encryptedPayload,
          encrypted.nonce,
          'key-b', // topic B's key ID
        );
      } catch (err) {
        caughtError = err as CryptoError;
      }

      // This should fail — either KEY_ID_MISMATCH or decryption failure
      expect(caughtError).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Realistic payloads
  // ---------------------------------------------------------------------------

  describe('realistic payloads', () => {
    it('should encrypt/decrypt a full text ChatMessagePayload', async () => {
      const topicId = '0.0.80001';
      const keyId = 'text-msg-key';
      const key = await generateSymmetricKey();
      await storeKey(topicId, { keyId, key, rotationIndex: 0 });

      const payload: ChatMessagePayload = {
        v: '1.0',
        type: 'message',
        sender: '0.0.54321',
        ts: 1710000000000,
        content: {
          type: 'text',
          text: 'This is a complete test message with all the fields set correctly.',
        },
        replyTo: 42,
        nonce: 'YWJjZGVmZ2hpamts', // base64 placeholder
      };

      const encrypted = await encryptMessage(topicId, payload);
      const decrypted = await decryptMessage(
        topicId,
        encrypted.encryptedPayload,
        encrypted.nonce,
        encrypted.keyId,
      );

      expect(decrypted).toEqual(payload);
      expect(decrypted.v).toBe('1.0');
      expect(decrypted.type).toBe('message');
      expect(decrypted.sender).toBe('0.0.54321');
      expect(decrypted.ts).toBe(1710000000000);
      expect(decrypted.content.type).toBe('text');
      expect(decrypted.content.text).toBe(
        'This is a complete test message with all the fields set correctly.',
      );
      expect(decrypted.replyTo).toBe(42);
    });

    it('should encrypt/decrypt a media (image) ChatMessagePayload', async () => {
      const topicId = '0.0.80002';
      const keyId = 'media-msg-key';
      const key = await generateSymmetricKey();
      await storeKey(topicId, { keyId, key, rotationIndex: 0 });

      const payload: ChatMessagePayload = {
        v: '1.0',
        type: 'message',
        sender: '0.0.99887',
        ts: 1710000060000,
        content: {
          type: 'image',
          mediaRef: 'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
          mediaMeta: {
            filename: 'sunset-photo.jpg',
            mimeType: 'image/jpeg',
            size: 245760,
            dimensions: '1920x1080',
          },
        },
        nonce: 'bm9uY2VfZm9yX3Rlc3Q=',
      };

      const encrypted = await encryptMessage(topicId, payload);
      const decrypted = await decryptMessage(
        topicId,
        encrypted.encryptedPayload,
        encrypted.nonce,
        encrypted.keyId,
      );

      expect(decrypted).toEqual(payload);
      expect(decrypted.content.type).toBe('image');
      expect(decrypted.content.mediaRef).toBe(
        'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
      );
      expect(decrypted.content.mediaMeta).toBeDefined();
      expect(decrypted.content.mediaMeta!.filename).toBe('sunset-photo.jpg');
      expect(decrypted.content.mediaMeta!.mimeType).toBe('image/jpeg');
      expect(decrypted.content.mediaMeta!.size).toBe(245760);
      expect(decrypted.content.mediaMeta!.dimensions).toBe('1920x1080');
    });
  });
});
