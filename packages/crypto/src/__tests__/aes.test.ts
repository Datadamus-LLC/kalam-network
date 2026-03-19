// =============================================================================
// AES ENCRYPTION TESTS
// =============================================================================
// Test the core AES-256-GCM encryption/decryption functions.
// Uses real Web Crypto API — no mocking, no faking.
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
