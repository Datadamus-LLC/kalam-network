# Custody Rewrite — Align TamamCustodyService with Real API

## Purpose

Rewrite `packages/api/src/modules/integrations/tamam-custody/tamam-custody.service.ts` to use the **real** Tamam Custody backend API endpoints (verified from `olara-mobile-app` source code), replacing the fictional endpoints that were built from incorrect integration docs.

## Problem

The current TamamCustodyService calls endpoints that **DO NOT EXIST** on the real backend:

| Current (WRONG)                                           | Real Backend              |
|----------------------------------------------------------|---------------------------|
| `POST /api/custody/mpc/keys`                             | `POST /api/custody/onboard` |
| `POST /api/custody/mpc/keys/:keyShareId/sign-transaction`| Two-step: `POST /api/custody/transactions` + `POST /api/custody/transactions/:txId/sign-raw` |
| `POST /api/custody/mpc/keys/:keyShareId/sign-message`    | `POST /api/custody/sign-message` |

This causes HTTP 404 on every custody operation, blocking all HBAR payment transfers (BUG-003).

---

## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use `any` type or `@ts-ignore`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars via ConfigService
- NEVER throw generic Error — use typed exception classes
- NEVER use setTimeout for async — use proper async/await
- Every error typed, logged, propagated
- Follow NestJS module structure

---

## REAL API ENDPOINTS (from olara-mobile-app source)

All routes are mounted at `/api/custody/...` on the custody backend.

### 1. Onboarding (replaces `generateKeypair`)

**`POST /api/custody/onboard`**

Creates org + vault + API key in one call. The vault gets an MPC key automatically if `enableMpc: true`.

Request body (Zod schema from real backend):
```json
{
  "organizationName": "string (1-200 chars, required)",
  "displayName": "string (optional, max 200)",
  "primaryEmail": "string (email, required)",
  "vaultName": "string (1-200 chars, required)",
  "vaultType": "GENERAL | TREASURY | COLD_STORAGE | TRADING | OMNIBUS (default: GENERAL)",
  "chain": "string (optional)",
  "curveType": "ed25519 | secp256k1 (optional)",
  "enableMpc": "boolean (default: true)",
  "mpcThreshold": "integer 1-9 (default: 2)",
  "mpcTotalShares": "integer 1-9 (default: 3)",
  "apiKeyName": "string (1-200 chars, required)",
  "apiKeyScopes": "['read', 'write'] (default)"
}
```

Response (201):
```json
{
  "success": true,
  "data": {
    "organization": { "id": "uuid", "name": "...", "slug": "..." },
    "vault": {
      "id": "uuid",
      "name": "...",
      "type": "...",
      "mpcKeyId": "uuid or null",
      "mpcKey": { "id": "...", "publicKey": "hex", ... } or null
    },
    "apiKey": "olara_...",
    "signingSecret": "hex-string",
    "apiKeyPrefix": "..."
  },
  "warning": "Save the API key and signing secret now."
}
```

**Authentication**: Bearer token (user JWT), NOT API key.

**Key mapping for our platform**:
- `vault.id` → store as user's `keyId` (it's now a vault ID, not a key share ID)
- `vault.mpcKey.publicKey` (or `vault.mpcKey?.id`) → public key info
- `vault.mpcKeyId` → the MPC key ID within the vault

### 2. Transaction Creation + Raw Signing (replaces `signTransaction`)

This is a **two-step** process:

**Step 1: `POST /api/custody/transactions`**

Creates a transaction request in the custody system.

Request body:
```json
{
  "sourceVaultId": "uuid (required)",
  "type": "TRANSFER",
  "chain": "hedera",
  "assetSymbol": "HBAR",
  "amount": "string (e.g. '10')",
  "destinationAddress": "0.0.xxxxx (Hedera account ID)",
  "destinationType": "EXTERNAL"
}
```

Response (201):
```json
{
  "success": true,
  "data": {
    "id": "uuid (transaction ID)",
    "status": "PENDING_SIGNING | PENDING_APPROVAL",
    "type": "TRANSFER",
    "chain": "hedera",
    "amount": "10",
    ...
  }
}
```

**Authentication**: API key (`X-API-Key` header) with `write` or `admin` scope. Also needs `X-Request-Timestamp` and `X-Request-Signature` (HMAC).

**Step 2: `POST /api/custody/transactions/:txId/sign-raw`**

Signs the raw transaction bytes via MPC.

Request body:
```json
{
  "unsignedTransaction": "hex-encoded-transaction-bytes (required, regex: /^[0-9a-fA-F]+$/)",
  "broadcast": true
}
```

Response (200):
```json
{
  "success": true,
  "data": {
    "signedTransaction": "hex-encoded-signed-tx",
    "txHash": "string (if broadcast=true)",
    "explorerUrl": "string (if broadcast=true)"
  }
}
```

**Authentication**: Same as step 1 — API key + HMAC signing.

### 3. Message Signing (replaces `signMessage`)

**`POST /api/custody/sign-message`**

Signs an arbitrary 32-byte hash. No transaction lifecycle.

Request body:
```json
{
  "vaultId": "uuid (required)",
  "chain": "hedera",
  "messageHash": "64-char hex string (32 bytes, required, regex: /^[0-9a-fA-F]{64}$/)",
  "note": "string (optional, max 500 chars)"
}
```

Response (200):
```json
{
  "success": true,
  "data": {
    "signature": "hex-encoded-signature",
    "publicKey": "hex-encoded-public-key"
  }
}
```

**Authentication**: API key + HMAC signing.

---

## HMAC SIGNING FORMAT (already correct in our codebase)

The HMAC signing in `signedRequest()` is already correct:
- Timestamp: Unix seconds as integer string
- Canonical: `METHOD + PATH + TIMESTAMP + SHA256(body).hex()` (direct concatenation, no separators)
- Body hash: always SHA256 even for empty body (hash empty string)
- Headers: `X-API-Key`, `X-Request-Timestamp`, `X-Request-Signature`

**DO NOT modify the HMAC signing logic. It is correct.**

---

## REWRITE INSTRUCTIONS

### Step 1: Update Response Interfaces

Replace the fictional interfaces at the top of `tamam-custody.service.ts` with ones matching the real API:

```typescript
/** Onboarding response from POST /api/custody/onboard */
interface OnboardApiResponse {
  success: true;
  data: {
    organization: { id: string; name: string; slug: string };
    vault: {
      id: string;
      name: string;
      type: string;
      mpcKeyId: string | null;
      mpcKey: { id: string; publicKey: string } | null;
    };
    apiKey: string;
    signingSecret: string;
    apiKeyPrefix: string;
  };
  warning: string;
}

/** Transaction creation response from POST /api/custody/transactions */
interface CreateTransactionApiResponse {
  success: true;
  data: {
    id: string;
    status: string;
    type: string;
    chain: string;
    amount: string;
    assetSymbol: string;
    sourceVaultId: string;
    destinationAddress: string | null;
    [key: string]: unknown;
  };
}

/** Raw signing response from POST /api/custody/transactions/:txId/sign-raw */
interface SignRawApiResponse {
  success: true;
  data: {
    signedTransaction: string;
    txHash?: string;
    explorerUrl?: string;
  };
}

/** Message signing response from POST /api/custody/sign-message */
interface SignMessageApiResponse {
  success: true;
  data: {
    signature: string;
    publicKey: string;
  };
}
```

### Step 2: Rewrite `generateKeypair()` → `onboardUser()`

The method should:
1. Call `POST /api/custody/onboard` using `authenticatedRequest` (Bearer token, NOT HMAC-signed)
2. Extract `vault.id` as the vault identifier (stored as `keyId` on user entity)
3. Extract `vault.mpcKey.publicKey` or `vault.mpcKey.id` for public key info
4. Return compatible structure: `{ publicKey, keyShareId (now vaultId), hederaAccountId? }`

**IMPORTANT**: The onboard endpoint uses Bearer auth (`authenticate` middleware), not API key auth. But our service uses API key auth. For the hackathon, we have two options:
- Option A: Use `authenticatedRequest` with the API key (the backend may accept it through `authenticateAny`)
- Option B: Add a user JWT token parameter

For simplicity, try with API key first. The `authenticateAny` middleware accepts both Bearer and API key.

### Step 3: Rewrite `signTransaction()` → Two-step process

The method should:
1. **Create a custody transaction**: `POST /api/custody/transactions` with:
   - `sourceVaultId`: the user's vault ID (stored as `keyId` on user entity)
   - `type`: "TRANSFER"
   - `chain`: "hedera"
   - `assetSymbol`: "HBAR"
   - `amount`: string amount
   - `destinationAddress`: recipient Hedera account ID
2. **Sign the raw bytes**: `POST /api/custody/transactions/:txId/sign-raw` with:
   - `unsignedTransaction`: hex-encoded Hedera transaction bytes
   - `broadcast`: false (we handle broadcast ourselves via Hedera SDK)

Both calls use `signedRequest` (HMAC-authenticated).

**Method signature change**: The method needs MORE parameters than before:
```typescript
async signAndExecuteTransfer(
  vaultId: string,            // user's vault ID (was keyShareId)
  transactionBytes: Buffer,    // frozen Hedera TransferTransaction bytes
  amount: number,              // transfer amount for custody record
  destinationAddress: string,  // recipient Hedera account ID
): Promise<{ signedTransaction: string; txHash?: string }>
```

**OR** keep it simpler and return the signature buffer for the existing flow:
```typescript
async signTransaction(
  vaultId: string,
  transactionBytes: Buffer,
  amount: number,
  destinationAddress: string,
): Promise<{ signature: Buffer }>
```

The second option is better for compatibility. The `sign-raw` endpoint returns `signedTransaction` as hex. We can:
- Convert it back to bytes
- Extract the signature from the signed transaction
- OR: if `broadcast: false`, we get the signed bytes and can submit them ourselves

**Recommended approach**: Use `broadcast: false` to get the signed transaction hex back, then convert to Buffer and use `Transaction.fromBytes()` to get the signed transaction, then execute it with the Hedera client.

### Step 4: Rewrite `signMessage()`

Change from key-share-based path to vault-based body:

```typescript
async signMessage(
  vaultId: string,    // was keyShareId
  message: Buffer,
): Promise<{ signature: Buffer }>
```

Call `POST /api/custody/sign-message` with:
```json
{
  "vaultId": "the-vault-uuid",
  "chain": "hedera",
  "messageHash": "SHA256(message).hex() padded to 64 chars",
  "note": "Hedera Social Platform message signing"
}
```

The response has `data.signature` as hex-encoded (not base64). Convert: `Buffer.from(response.data.signature, 'hex')`.

### Step 5: Update `payments.service.ts` → `executeCustodyTransfer()`

The `executeCustodyTransfer()` method in `payments.service.ts` calls:
1. `hederaService.buildTransferTransaction()` → gets `transactionBytes`
2. `tamamCustodyService.signTransaction(sender.keyId, transactionBytes)` → gets `signature`
3. `hederaService.executeSignedTransaction(transactionBytes, signature, sender.publicKey)` → gets `txId`

After the rewrite, update the call to pass the new parameters:
```typescript
const { signature } = await this.tamamCustodyService.signTransaction(
  sender.keyId,           // now a vault ID
  transactionBytes,
  amount,
  toAccountId,
);
```

The rest (executeSignedTransaction) stays the same IF we return a signature Buffer.

**Alternative**: If custody's `sign-raw` returns the full signed transaction, skip the manual signature addition:
```typescript
const { signedTransactionBytes } = await this.tamamCustodyService.signTransaction(
  sender.keyId, transactionBytes, amount, toAccountId,
);
// Execute the already-signed transaction directly
return this.hederaService.executePreSignedTransaction(signedTransactionBytes);
```

This would need a new method on `hedera.service.ts`:
```typescript
async executePreSignedTransaction(signedBytes: Buffer): Promise<string> {
  const client = this.ensureClient();
  const transaction = Transaction.fromBytes(signedBytes);
  const response = await transaction.execute(client);
  await response.getReceipt(client);
  return response.transactionId.toString();
}
```

### Step 6: Update `wallet.service.ts` (if needed)

If `generateKeypair()` return type changes, update `wallet.service.ts` line ~159 to use the new property names. Currently it stores:
- `keypairResult.keyShareId` → user.keyId
- `keypairResult.publicKey` → user.publicKey

After rewrite, ensure these still map correctly. The `keyShareId` should now be the vault ID from onboarding.

### Step 7: Add New Exception Classes (if needed)

If new failure modes are introduced (e.g., transaction creation fails separately from signing), add exceptions to `tamam-custody.exceptions.ts`:
- `TamamCustodyTransactionCreationException`
- Keep existing exceptions for other cases

---

## VALIDATION CHECKLIST

After implementing:

1. `pnpm build` — zero errors
2. `pnpm lint` — zero errors
3. `pnpm test` — zero regressions
4. Start the app and smoke test:
   - Register a user (triggers wallet creation → onboard)
   - Send a payment (triggers custody transfer → transactions + sign-raw)
   - Check the response — should NOT be 404 anymore
5. If custody staging is unreachable: that's OK, the 404 should change to a connection/auth error

---

## ENVIRONMENT

- Test PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Test Redis: localhost:6380
- Hedera credentials: in .env file
- Tamam Custody staging: TAMAM_CUSTODY_* env vars in .env
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/

## KEY FILES TO MODIFY

1. `packages/api/src/modules/integrations/tamam-custody/tamam-custody.service.ts` — MAIN REWRITE
2. `packages/api/src/modules/payments/payments.service.ts` — update `executeCustodyTransfer()`
3. `packages/api/src/modules/hedera/hedera.service.ts` — possibly add `executePreSignedTransaction()`
4. `packages/api/src/modules/identity/services/wallet.service.ts` — update if generateKeypair return changes
5. `packages/api/src/modules/integrations/tamam-custody/tamam-custody.exceptions.ts` — add new exception types if needed
