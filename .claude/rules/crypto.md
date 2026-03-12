---
paths:
  - "packages/crypto/**/*.ts"
---

# Crypto Package Rules

## Two-Layer Crypto Model

This package implements two distinct encryption layers:

- **Layer 1 (Message Encryption)**: AES-256-GCM via Web Crypto API (SubtleCrypto) — encrypts message content with a per-conversation symmetric key
- **Layer 2 (Key Exchange)**: X25519/nacl.box via `tweetnacl` npm package — encrypts conversation symmetric keys for each participant using their X25519 public key

### Allowed Libraries
- **Web Crypto API (SubtleCrypto)**: Layer 1 ONLY — AES-256-GCM encryption/decryption, random IV/key generation
- **`tweetnacl` (npm)**: Layer 2 ONLY — X25519 key pairs, nacl.box/nacl.box.open for asymmetric encryption (XSalsa20-Poly1305)
- **No other crypto libraries** — no libsodium, no crypto-js, no Node.js `crypto` module

---

## Layer 1: AES-256-GCM (Message Encryption)

### Cipher Requirement
- **AES-256-GCM only** — no other cipher, no exceptions
- No mode switching: always GCM (provides both confidentiality and authenticity)
- Block size: 128 bits, key size: 256 bits (32 bytes)

### Implementation
- Use **Web Crypto API (SubtleCrypto)** — standard browser API
- **NOT** Node.js `crypto` module — this must work in browser/client context

### Encryption Output Format
Every Layer 1 encryption operation produces a typed object:
```typescript
interface EncryptedData {
  ciphertext: string;  // base64 encoded
  iv: string;          // base64 encoded, 12 bytes
  tag: string;         // base64 encoded, 16 bytes (GCM authentication tag)
}
```

- All components base64 encoded for JSON serialization
- IV and tag are non-optional — GCM requires authentication
- Tag verified during decryption — tampering detected

### Initialization Vector (IV)
- **IV must be random 12 bytes per message** — cryptographic quality randomness
- **NEVER reuse IVs** — each message gets a fresh IV
- Generate with `crypto.getRandomValues(new Uint8Array(12))`
- IV is public (not secret) — stored/transmitted alongside ciphertext
- IV reuse breaks security — implement checks to prevent accidental reuse

### Symmetric Key Generation
- Key size: 256 bits (32 bytes) for AES-256
- Generate with `crypto.getRandomValues(new Uint8Array(32))`
- One symmetric key per conversation, shared among all participants
- Store generation timestamp for rotation tracking

---

## Layer 2: X25519 Key Exchange (nacl.box)

### Purpose
Layer 2 encrypts conversation symmetric keys so they can be safely shared with each participant. Each participant has an X25519 key pair. The conversation's symmetric key is encrypted separately for each participant using nacl.box.

### Implementation — `tweetnacl` IS allowed and REQUIRED for Layer 2
```typescript
import nacl from 'tweetnacl';

// Generate X25519 key pair
const keyPair = nacl.box.keyPair();
// keyPair.publicKey: Uint8Array(32)
// keyPair.secretKey: Uint8Array(32)

// Encrypt conversation key for a recipient
const nonce = nacl.randomBytes(nacl.box.nonceLength); // 24 bytes
const encrypted = nacl.box(
  conversationKey,       // plaintext: the AES-256 symmetric key (32 bytes)
  nonce,                 // 24-byte nonce
  recipientPublicKey,    // recipient's X25519 public key
  senderSecretKey        // sender's X25519 secret key
);

// Decrypt conversation key
const decrypted = nacl.box.open(
  encrypted,             // ciphertext
  nonce,                 // same nonce used during encryption
  senderPublicKey,       // sender's X25519 public key
  recipientSecretKey     // recipient's X25519 secret key
);
```

### Wire Format for Layer 2 (Key Exchange)
```
senderPublicKey (32 bytes) || nonce (24 bytes) || ciphertext
```
- Total overhead: 56 bytes + nacl.box.overheadLength (16 bytes) = 72 bytes + payload
- All components concatenated as Uint8Array, then base64 encoded for JSON transport

---

## Key Storage

### Client-Side (IndexedDB / Memory)
- **X25519 private keys**: stored encrypted in IndexedDB, NEVER sent to server
- **Conversation symmetric keys**: cached in memory or IndexedDB after first decryption
- Keys wrapped with secondary key (from user passphrase or device key)
- Access: decrypt only when needed, clear from memory after use
- Session keys: ephemeral, cleared on logout
- Long-term keys: encrypted at rest, accessed on demand

### Server-Side (PostgreSQL)
- **X25519 public keys ONLY**: stored in `users.encryption_public_key` column
- **NEVER store private keys or symmetric keys on the server**
- **NEVER cache encryption keys in Redis** — this breaks E2E guarantee

### Key Backup
- Encrypted key blob stored on IPFS, CID referenced in DID NFT metadata
- Recovery: user authenticates, retrieves CID from NFT, downloads and decrypts blob

---

## Functions

### Pure and Stateless
- Every function has no side effects (except web crypto / nacl operations)
- No global state, no mutable closures
- Same input always produces same type of output (though IV/nonce is random)
- Testable against real Web Crypto API and real tweetnacl (no mocking)

### Input Validation
Before any cryptographic operation:
- Key length: must be 32 bytes for AES-256 and X25519
- IV length: must be 12 bytes (Layer 1) or nonce 24 bytes (Layer 2)
- Ciphertext format: valid base64, decodable
- AAD (additional authenticated data): valid if provided
- Type checks: ensure Uint8Array where needed
- Throw `CryptoError` on validation failure

Example:
```typescript
function validateKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array)) {
    throw new CryptoError('INVALID_KEY_TYPE', 'Key must be Uint8Array');
  }
  if (key.length !== 32) {
    throw new CryptoError('INVALID_KEY_LENGTH', 'Key must be 32 bytes');
  }
}
```

### Error Handling
- All functions throw `CryptoError` (custom class)
- Error codes: `INVALID_KEY`, `INVALID_IV`, `DECRYPTION_FAILED`, `KEY_DERIVATION_FAILED`, `INVALID_NONCE`, `BOX_OPEN_FAILED`, etc.
- Error messages: descriptive but not revealing internals
- No generic errors — clients can handle specific codes
- Stack traces preserved for debugging

Example:
```typescript
export class CryptoError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}
```

## Function Signatures

### Layer 1 (AES-256-GCM)

#### encrypt(plaintext: Uint8Array, key: Uint8Array): Promise<EncryptedData>
- Takes plaintext bytes and AES-256 symmetric key
- Returns encrypted data with IV and tag
- Generates fresh random IV
- Throws CryptoError on validation failure

#### decrypt(encryptedData: EncryptedData, key: Uint8Array): Promise<Uint8Array>
- Takes encrypted data object and AES-256 symmetric key
- Verifies authentication tag (GCM)
- Returns plaintext bytes
- Throws CryptoError if tag verification fails (tampering detected)

### Layer 2 (X25519/nacl.box)

#### generateX25519KeyPair(): nacl.BoxKeyPair
- Generates X25519 key pair via `nacl.box.keyPair()`
- Returns `{ publicKey: Uint8Array(32), secretKey: Uint8Array(32) }`
- Public key stored in PostgreSQL, secret key stored client-side only

#### encryptForRecipient(plaintext: Uint8Array, recipientPublicKey: Uint8Array, senderSecretKey: Uint8Array): Uint8Array
- Encrypts data (typically a conversation symmetric key) for a specific recipient
- Generates random 24-byte nonce
- Returns wire format: `senderPublicKey || nonce || ciphertext`
- Throws CryptoError on validation failure

#### decryptFromSender(payload: Uint8Array, senderPublicKey: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array
- Parses wire format to extract nonce and ciphertext
- Decrypts using nacl.box.open
- Returns plaintext bytes
- Throws CryptoError if authentication fails

### Shared

#### generateConversationKey(): Uint8Array
- Generates random 256-bit symmetric key for AES-256-GCM
- Returns Uint8Array(32) via `crypto.getRandomValues`
- Used as the per-conversation encryption key

## Memory Safety
- Clear sensitive data after use (keys, plaintexts)
- Use `crypto.subtle` operations for Layer 1 (don't expose raw keys in JavaScript)
- Avoid converting to strings — stay in Uint8Array
- Example:
  ```typescript
  // Good: keep as Uint8Array
  const plaintext = new Uint8Array([...]);
  const encrypted = await encrypt(plaintext, key);

  // Bad: converts to string, harder to clear
  const plaintextString = new TextDecoder().decode(plaintext);
  ```

## Export API
Only export these public functions:
- `encrypt(plaintext, key): Promise<EncryptedData>` — Layer 1
- `decrypt(encryptedData, key): Promise<Uint8Array>` — Layer 1
- `generateX25519KeyPair(): nacl.BoxKeyPair` — Layer 2
- `encryptForRecipient(plaintext, recipientPubKey, senderSecKey): Uint8Array` — Layer 2
- `decryptFromSender(payload, senderPubKey, recipientSecKey): Uint8Array` — Layer 2
- `generateConversationKey(): Uint8Array` — Shared
- `CryptoError` class
- `EncryptedData` type

**DO NOT export:**
- Internal helper functions
- Raw SubtleCrypto operations
- Raw nacl.box/nacl.box.open calls
- Key generation internals

## Testing

### Coverage
- **100% code coverage required** — every line tested
- No mocking of Web Crypto API or tweetnacl — use real implementations
- Deterministic testing: real encryption/decryption round-trips

### Layer 1 Test Cases (AES-256-GCM)
- Valid encryption/decryption round-trip
- Invalid key length raises error
- Invalid IV length raises error
- Tampering with ciphertext detected (tag verification fails)
- Different keys produce different ciphertexts (even with same plaintext)
- Same plaintext + same key = different ciphertexts (different IVs)

### Layer 2 Test Cases (X25519/nacl.box)
- Generate key pair produces valid 32-byte public and secret keys
- Encrypt for recipient → decrypt by recipient round-trip succeeds
- Decrypt with wrong secret key fails
- Wire format correctly concatenates senderPublicKey + nonce + ciphertext
- Cross-pair encryption: Alice encrypts for Bob, Bob decrypts successfully

## Integration
- Client-side encryption: use `encrypt()` (Layer 1) before sending messages to API
- Client-side decryption: use `decrypt()` (Layer 1) when receiving messages from HCS
- Key exchange: use `generateX25519KeyPair()` + `encryptForRecipient()` for E2E setup
- Backend handles encrypted blobs but NEVER decrypts message content
- Backend stores only encrypted data — server never sees plaintext messages or conversation keys
- Conversation keys cached CLIENT-SIDE (IndexedDB/memory), never in server-side Redis
