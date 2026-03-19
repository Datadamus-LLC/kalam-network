/**
 * Key Exchange Integration Tests
 *
 * Exercises createKeyExchangePayload() with REAL tweetnacl X25519 key pairs.
 * Verifies that encrypted keys produced by the function can be decrypted
 * back to the original symmetric key using nacl.box.open.
 *
 * No infrastructure dependencies -- pure cryptographic operations.
 *
 * NO MOCKS. NO FAKES. NO STUBS.
 */

import nacl from "tweetnacl";
import {
  createKeyExchangePayload,
  KeyExchangePayload,
} from "../crypto/key-exchange";

/**
 * Decrypt a key exchange entry for a specific recipient.
 *
 * Wire format (base64-decoded):
 *   ephemeralPublicKey (32 bytes) || nonce (24 bytes) || ciphertext
 *
 * Uses nacl.box.open with the recipient's secret key and the ephemeral
 * public key embedded in the wire format.
 */
function decryptKeyForRecipient(
  encryptedBase64: string,
  recipientSecretKey: Uint8Array,
): Uint8Array | null {
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const ephemeralPublicKey = encrypted.subarray(0, 32);
  const nonce = encrypted.subarray(32, 56);
  const ciphertext = encrypted.subarray(56);

  return nacl.box.open(
    ciphertext,
    nonce,
    ephemeralPublicKey,
    recipientSecretKey,
  );
}

describe("Key Exchange Integration Tests", () => {
  // ---------------------------------------------------------------------------
  // Payload structure validation
  // ---------------------------------------------------------------------------

  describe("createKeyExchangePayload() — structure", () => {
    it("should return a valid KeyExchangePayload for a single participant", () => {
      const alice = nacl.box.keyPair();

      const payload: KeyExchangePayload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      expect(payload.v).toBe("1.0");
      expect(payload.type).toBe("key_exchange");
      expect(payload.algorithm).toBe("AES-256-GCM");
      expect(payload.rotationIndex).toBe(0);
      expect(typeof payload.keyId).toBe("string");
      expect(payload.keyId.length).toBeGreaterThan(0);

      // UUID v4 format: 8-4-4-4-12 hex characters
      const uuidV4Regex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(payload.keyId).toMatch(uuidV4Regex);

      // Keys map should have exactly one entry
      expect(Object.keys(payload.keys)).toHaveLength(1);
      expect(payload.keys["0.0.1001"]).toBeDefined();
      expect(typeof payload.keys["0.0.1001"]).toBe("string");
    });

    it("should return encrypted keys for every participant", () => {
      const alice = nacl.box.keyPair();
      const bob = nacl.box.keyPair();
      const carol = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
        "0.0.1002": bob.publicKey,
        "0.0.1003": carol.publicKey,
      });

      expect(Object.keys(payload.keys)).toHaveLength(3);
      expect(payload.keys["0.0.1001"]).toBeDefined();
      expect(payload.keys["0.0.1002"]).toBeDefined();
      expect(payload.keys["0.0.1003"]).toBeDefined();
    });

    it("should produce valid base64 strings in the keys map", () => {
      const alice = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      const encoded = payload.keys["0.0.1001"];

      // Verify it is valid base64 by round-tripping
      const decoded = Buffer.from(encoded, "base64");
      const reEncoded = decoded.toString("base64");
      expect(reEncoded).toBe(encoded);

      // Wire format: ephemeralPublic (32) + nonce (24) + ciphertext (32 + 16 poly1305 tag)
      // nacl.box adds a 16-byte Poly1305 authentication tag to the 32-byte plaintext
      const expectedMinLength = 32 + 24 + 32 + 16; // = 104 bytes
      expect(decoded.length).toBe(expectedMinLength);
    });

    it("should generate a unique keyId for each invocation", () => {
      const alice = nacl.box.keyPair();

      const payload1 = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });
      const payload2 = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      expect(payload1.keyId).not.toBe(payload2.keyId);
    });

    it("should produce different encrypted keys per invocation (fresh ephemeral keys)", () => {
      const alice = nacl.box.keyPair();

      const payload1 = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });
      const payload2 = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      // Different symmetric keys and different ephemeral keypairs each time
      expect(payload1.keys["0.0.1001"]).not.toBe(payload2.keys["0.0.1001"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Decryption round-trip — verifies that encrypted keys are actually usable
  // ---------------------------------------------------------------------------

  describe("createKeyExchangePayload() — decryption round-trip", () => {
    it("should produce an encrypted key that the recipient can decrypt", () => {
      const alice = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      const decrypted = decryptKeyForRecipient(
        payload.keys["0.0.1001"],
        alice.secretKey,
      );

      expect(decrypted).not.toBeNull();
      expect(decrypted!.length).toBe(32); // AES-256 key = 32 bytes
    });

    it("should encrypt the same symmetric key for all participants in a single call", () => {
      const alice = nacl.box.keyPair();
      const bob = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
        "0.0.1002": bob.publicKey,
      });

      const aliceKey = decryptKeyForRecipient(
        payload.keys["0.0.1001"],
        alice.secretKey,
      );
      const bobKey = decryptKeyForRecipient(
        payload.keys["0.0.1002"],
        bob.secretKey,
      );

      expect(aliceKey).not.toBeNull();
      expect(bobKey).not.toBeNull();

      // Both participants must recover the exact same symmetric key
      expect(Buffer.from(aliceKey!).toString("hex")).toBe(
        Buffer.from(bobKey!).toString("hex"),
      );
    });

    it("should fail decryption with the wrong secret key", () => {
      const alice = nacl.box.keyPair();
      const eve = nacl.box.keyPair(); // attacker

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      // Eve tries to decrypt Alice's key using her own secret key
      const decrypted = decryptKeyForRecipient(
        payload.keys["0.0.1001"],
        eve.secretKey,
      );

      // nacl.box.open returns null when authentication fails
      expect(decrypted).toBeNull();
    });

    it("should produce a 32-byte random symmetric key (not zeros or repeated)", () => {
      const alice = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      const symmetricKey = decryptKeyForRecipient(
        payload.keys["0.0.1001"],
        alice.secretKey,
      );

      expect(symmetricKey).not.toBeNull();
      expect(symmetricKey!.length).toBe(32);

      // Verify the key is not all zeros
      const allZero = symmetricKey!.every((byte) => byte === 0);
      expect(allZero).toBe(false);

      // Verify the key has reasonable entropy (at least 8 distinct byte values
      // out of 32 bytes -- extremely conservative; a truly random key will have
      // far more distinct values)
      const distinctValues = new Set(symmetricKey!);
      expect(distinctValues.size).toBeGreaterThanOrEqual(8);
    });

    it("should produce unique symmetric keys per createKeyExchangePayload call", () => {
      const alice = nacl.box.keyPair();

      const payload1 = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });
      const payload2 = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      const key1 = decryptKeyForRecipient(
        payload1.keys["0.0.1001"],
        alice.secretKey,
      );
      const key2 = decryptKeyForRecipient(
        payload2.keys["0.0.1001"],
        alice.secretKey,
      );

      expect(key1).not.toBeNull();
      expect(key2).not.toBeNull();

      // Each call generates a fresh nacl.randomBytes(32) — keys must differ
      expect(Buffer.from(key1!).toString("hex")).not.toBe(
        Buffer.from(key2!).toString("hex"),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // Multi-participant scenarios
  // ---------------------------------------------------------------------------

  describe("createKeyExchangePayload() — multi-participant", () => {
    it("should handle a 5-participant group conversation", () => {
      const participants: Record<string, nacl.BoxKeyPair> = {};
      const publicKeys: Record<string, Uint8Array> = {};

      for (let i = 0; i < 5; i++) {
        const accountId = `0.0.${2000 + i}`;
        participants[accountId] = nacl.box.keyPair();
        publicKeys[accountId] = participants[accountId].publicKey;
      }

      const payload = createKeyExchangePayload(publicKeys);

      expect(Object.keys(payload.keys)).toHaveLength(5);

      // Every participant should be able to decrypt to the same symmetric key
      let referenceKey: string | null = null;

      for (const [accountId, keyPair] of Object.entries(participants)) {
        const decrypted = decryptKeyForRecipient(
          payload.keys[accountId],
          keyPair.secretKey,
        );

        expect(decrypted).not.toBeNull();
        expect(decrypted!.length).toBe(32);

        const hex = Buffer.from(decrypted!).toString("hex");
        if (referenceKey === null) {
          referenceKey = hex;
        } else {
          expect(hex).toBe(referenceKey);
        }
      }
    });

    it("should use different ephemeral keys per participant (different ciphertext)", () => {
      const alice = nacl.box.keyPair();
      const bob = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
        "0.0.1002": bob.publicKey,
      });

      // The raw encrypted blobs must differ because each uses a fresh ephemeral keypair
      expect(payload.keys["0.0.1001"]).not.toBe(payload.keys["0.0.1002"]);

      // Extract ephemeral public keys from the wire format
      const aliceBlob = Buffer.from(payload.keys["0.0.1001"], "base64");
      const bobBlob = Buffer.from(payload.keys["0.0.1002"], "base64");

      const aliceEphemeral = aliceBlob.subarray(0, 32);
      const bobEphemeral = bobBlob.subarray(0, 32);

      // Each participant gets a unique ephemeral public key
      expect(Buffer.compare(aliceEphemeral, bobEphemeral)).not.toBe(0);
    });

    it("should use different nonces per participant", () => {
      const alice = nacl.box.keyPair();
      const bob = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
        "0.0.1002": bob.publicKey,
      });

      const aliceBlob = Buffer.from(payload.keys["0.0.1001"], "base64");
      const bobBlob = Buffer.from(payload.keys["0.0.1002"], "base64");

      const aliceNonce = aliceBlob.subarray(32, 56);
      const bobNonce = bobBlob.subarray(32, 56);

      // Fresh nacl.randomBytes(24) per participant -- nonces should differ
      expect(Buffer.compare(aliceNonce, bobNonce)).not.toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Wire format validation
  // ---------------------------------------------------------------------------

  describe("createKeyExchangePayload() — wire format", () => {
    it("should produce wire format: ephemeralPub(32) || nonce(24) || ciphertext", () => {
      const alice = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      const raw = Buffer.from(payload.keys["0.0.1001"], "base64");

      // Total = 32 (ephemeral pub) + 24 (nonce) + 48 (32 plaintext + 16 auth tag)
      expect(raw.length).toBe(32 + 24 + 48);

      // Ephemeral public key should be a valid 32-byte X25519 public key
      // (not all zeros, not all ones)
      const ephemeralPub = raw.subarray(0, 32);
      expect(ephemeralPub.every((b) => b === 0)).toBe(false);

      // Nonce should be 24 bytes of random data (not all zeros)
      const nonce = raw.subarray(32, 56);
      expect(nonce.every((b) => b === 0)).toBe(false);

      // Ciphertext should be 48 bytes (32 AES key + 16 Poly1305 tag)
      const ciphertext = raw.subarray(56);
      expect(ciphertext.length).toBe(48);
    });

    it("should produce ciphertext that nacl.box can authenticate and decrypt", () => {
      const alice = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      const raw = Buffer.from(payload.keys["0.0.1001"], "base64");
      const ephemeralPub = new Uint8Array(raw.subarray(0, 32));
      const nonce = new Uint8Array(raw.subarray(32, 56));
      const ciphertext = new Uint8Array(raw.subarray(56));

      // Manual decryption using nacl.box.open with extracted components
      const plaintext = nacl.box.open(
        ciphertext,
        nonce,
        ephemeralPub,
        alice.secretKey,
      );

      expect(plaintext).not.toBeNull();
      expect(plaintext!.length).toBe(32);
    });

    it("should fail authentication if any byte of the ciphertext is tampered", () => {
      const alice = nacl.box.keyPair();

      const payload = createKeyExchangePayload({
        "0.0.1001": alice.publicKey,
      });

      const raw = Buffer.from(payload.keys["0.0.1001"], "base64");
      const ephemeralPub = new Uint8Array(raw.subarray(0, 32));
      const nonce = new Uint8Array(raw.subarray(32, 56));
      const ciphertext = new Uint8Array(raw.subarray(56));

      // Tamper with a byte in the ciphertext
      const tampered = new Uint8Array(ciphertext);
      tampered[0] = tampered[0] ^ 0xff;

      const plaintext = nacl.box.open(
        tampered,
        nonce,
        ephemeralPub,
        alice.secretKey,
      );

      // Poly1305 authentication should reject the tampered data
      expect(plaintext).toBeNull();
    });
  });
});
