// =============================================================================
// KEY EXCHANGE TESTS
// =============================================================================
// Test the X25519 key exchange and AES key distribution functions.
// Uses real tweetnacl and real Web Crypto API — no mocking, no faking.
// =============================================================================

import { describe, it, expect } from 'vitest';
import {
  generateEncryptionKeyPair,
  createKeyExchange,
  decryptKeyBundle,
} from '../key-exchange';
import { encrypt, decrypt } from '../aes';
import { CryptoError } from '../errors';

describe('Key Exchange (X25519 / nacl.box)', () => {
  // ---------------------------------------------------------------------------
  // generateEncryptionKeyPair
  // ---------------------------------------------------------------------------

  describe('generateEncryptionKeyPair', () => {
    it('should return a keypair with 32-byte public and secret keys', () => {
      const kp = generateEncryptionKeyPair();

      expect(kp.publicKey).toBeInstanceOf(Uint8Array);
      expect(kp.secretKey).toBeInstanceOf(Uint8Array);
      expect(kp.publicKey.length).toBe(32);
      expect(kp.secretKey.length).toBe(32);
    });

    it('should generate different keypairs on each call', () => {
      const kp1 = generateEncryptionKeyPair();
      const kp2 = generateEncryptionKeyPair();

      expect(kp1.publicKey).not.toEqual(kp2.publicKey);
      expect(kp1.secretKey).not.toEqual(kp2.secretKey);
    });
  });

  // ---------------------------------------------------------------------------
  // createKeyExchange
  // ---------------------------------------------------------------------------

  describe('createKeyExchange', () => {
    it('should create a valid payload for a single participant', async () => {
      const alice = generateEncryptionKeyPair();

      const { payload, cryptoKey } = await createKeyExchange({
        '0.0.1001': alice.publicKey,
      });

      // Verify payload structure
      expect(payload.v).toBe('1.0');
      expect(payload.type).toBe('key_exchange');
      expect(payload.algorithm).toBe('AES-256-GCM');
      expect(payload.rotationIndex).toBe(0);
      expect(typeof payload.keyId).toBe('string');
      expect(payload.keyId.length).toBeGreaterThan(0);

      // Should have exactly one key entry
      expect(Object.keys(payload.keys)).toHaveLength(1);
      expect(payload.keys['0.0.1001']).toBeDefined();
      expect(typeof payload.keys['0.0.1001']).toBe('string');

      // cryptoKey should be a valid AES CryptoKey
      expect(cryptoKey).toBeDefined();
      expect(cryptoKey.type).toBe('secret');
    });

    it('should create key entries for all participants', async () => {
      const alice = generateEncryptionKeyPair();
      const bob = generateEncryptionKeyPair();
      const carol = generateEncryptionKeyPair();

      const { payload } = await createKeyExchange({
        '0.0.1001': alice.publicKey,
        '0.0.1002': bob.publicKey,
        '0.0.1003': carol.publicKey,
      });

      expect(Object.keys(payload.keys)).toHaveLength(3);
      expect(payload.keys['0.0.1001']).toBeDefined();
      expect(payload.keys['0.0.1002']).toBeDefined();
      expect(payload.keys['0.0.1003']).toBeDefined();
    });

    it('should produce a payload with correct structure fields', async () => {
      const alice = generateEncryptionKeyPair();

      const { payload } = await createKeyExchange({
        '0.0.1001': alice.publicKey,
      });

      // UUID v4 format check (8-4-4-4-12 hex)
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(payload.keyId).toMatch(uuidRegex);

      expect(payload.v).toBe('1.0');
      expect(payload.type).toBe('key_exchange');
      expect(payload.algorithm).toBe('AES-256-GCM');
      expect(payload.rotationIndex).toBe(0);
      expect(typeof payload.keys).toBe('object');
    });

    it('should generate a unique keyId for each call', async () => {
      const alice = generateEncryptionKeyPair();
      const participants = { '0.0.1001': alice.publicKey };

      const { payload: p1 } = await createKeyExchange(participants);
      const { payload: p2 } = await createKeyExchange(participants);

      expect(p1.keyId).not.toBe(p2.keyId);
    });

    it('should generate a different symmetric key for each call', async () => {
      const alice = generateEncryptionKeyPair();
      const participants = { '0.0.1001': alice.publicKey };

      const { cryptoKey: key1 } = await createKeyExchange(participants);
      const { cryptoKey: key2 } = await createKeyExchange(participants);

      // Export both keys and compare raw bytes
      const raw1 = await globalThis.crypto.subtle.exportKey('raw', key1);
      const raw2 = await globalThis.crypto.subtle.exportKey('raw', key2);

      expect(new Uint8Array(raw1)).not.toEqual(new Uint8Array(raw2));
    });
  });

  // ---------------------------------------------------------------------------
  // decryptKeyBundle — round-trip
  // ---------------------------------------------------------------------------

  describe('decryptKeyBundle (round-trip)', () => {
    it('should allow a participant to decrypt their key bundle', async () => {
      const alice = generateEncryptionKeyPair();

      const { payload, cryptoKey: originalKey } = await createKeyExchange({
        '0.0.1001': alice.publicKey,
      });

      // Alice decrypts her key bundle
      const recoveredKey = await decryptKeyBundle(
        payload.keys['0.0.1001'],
        alice.secretKey,
      );

      // Both keys should produce the same raw bytes
      const originalRaw = await globalThis.crypto.subtle.exportKey('raw', originalKey);
      const recoveredRaw = await globalThis.crypto.subtle.exportKey('raw', recoveredKey);

      expect(new Uint8Array(recoveredRaw)).toEqual(new Uint8Array(originalRaw));
    });

    it('should allow two participants to independently decrypt to the same key', async () => {
      const alice = generateEncryptionKeyPair();
      const bob = generateEncryptionKeyPair();

      const { payload } = await createKeyExchange({
        '0.0.1001': alice.publicKey,
        '0.0.1002': bob.publicKey,
      });

      const aliceKey = await decryptKeyBundle(
        payload.keys['0.0.1001'],
        alice.secretKey,
      );
      const bobKey = await decryptKeyBundle(
        payload.keys['0.0.1002'],
        bob.secretKey,
      );

      const aliceRaw = await globalThis.crypto.subtle.exportKey('raw', aliceKey);
      const bobRaw = await globalThis.crypto.subtle.exportKey('raw', bobKey);

      // Both should recover the same symmetric key
      expect(new Uint8Array(aliceRaw)).toEqual(new Uint8Array(bobRaw));
    });

    it('should produce a key that works for AES encrypt/decrypt', async () => {
      const alice = generateEncryptionKeyPair();

      const { payload } = await createKeyExchange({
        '0.0.1001': alice.publicKey,
      });

      const recoveredKey = await decryptKeyBundle(
        payload.keys['0.0.1001'],
        alice.secretKey,
      );

      // Use the recovered key for AES encryption
      const plaintext = 'End-to-end encrypted message';
      const { ciphertext, nonce } = await encrypt(recoveredKey, plaintext);
      const decrypted = await decrypt(recoveredKey, ciphertext, nonce);

      expect(decrypted).toBe(plaintext);
    });
  });

  // ---------------------------------------------------------------------------
  // decryptKeyBundle — error cases
  // ---------------------------------------------------------------------------

  describe('decryptKeyBundle (error cases)', () => {
    it('should throw CryptoError with BOX_OPEN_FAILED for wrong secret key', async () => {
      const alice = generateEncryptionKeyPair();
      const eve = generateEncryptionKeyPair(); // attacker

      const { payload } = await createKeyExchange({
        '0.0.1001': alice.publicKey,
      });

      // Eve tries to decrypt Alice's key bundle with her own secret key
      let caughtError: CryptoError | undefined;
      try {
        await decryptKeyBundle(payload.keys['0.0.1001'], eve.secretKey);
      } catch (err) {
        caughtError = err as CryptoError;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError).toBeInstanceOf(CryptoError);
      expect(caughtError!.code).toBe('BOX_OPEN_FAILED');
    });

    it('should throw CryptoError with BOX_OPEN_FAILED for corrupted data', async () => {
      const alice = generateEncryptionKeyPair();

      // Create corrupted base64 data (valid base64 but meaningless bytes)
      const garbageBytes = globalThis.crypto.getRandomValues(new Uint8Array(80));
      const corruptedBase64 = Buffer.from(garbageBytes).toString('base64');

      let caughtError: CryptoError | undefined;
      try {
        await decryptKeyBundle(corruptedBase64, alice.secretKey);
      } catch (err) {
        caughtError = err as CryptoError;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError).toBeInstanceOf(CryptoError);
      expect(caughtError!.code).toBe('BOX_OPEN_FAILED');
    });
  });
});
