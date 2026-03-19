CUSTODY REWRITE COMPLETE

# Custody Rewrite Report — BUG-003 Fix

## Summary

Rewrote `TamamCustodyService` to use the **real** Tamam Custody backend API endpoints (verified from `olara-mobile-app` source code), replacing the fictional endpoints that caused HTTP 404 on every custody operation.

## Problem

The service was calling endpoints that **DO NOT EXIST** on the real backend:

| Old (WRONG)                                              | New (CORRECT)                        |
|----------------------------------------------------------|--------------------------------------|
| `POST /api/custody/mpc/keys`                             | `POST /api/custody/onboard`          |
| `POST /api/custody/mpc/keys/:id/sign-transaction`       | Two-step: `POST /api/custody/transactions` + `POST /api/custody/transactions/:txId/sign-raw` |
| `POST /api/custody/mpc/keys/:id/sign-message`           | `POST /api/custody/sign-message`     |

## Changes Made

### 1. `packages/api/src/modules/integrations/tamam-custody/tamam-custody.service.ts` — FULL REWRITE
- **Interfaces**: Replaced fictional `TamamMpcKey`, `CreateMpcKeyApiResponse`, `SignTransactionApiResponse`, `SignMessageApiResponse` with real API shapes: `OnboardApiResponse`, `CreateTransactionApiResponse`, `SignRawApiResponse`, `SignMessageApiResponse`
- **`generateKeypair()` → `onboardUser(userEmail, displayName)`**: Calls `POST /api/custody/onboard` which creates org + vault + MPC key. Returns `{ publicKey, vaultId }` instead of `{ publicKey, keyShareId }`
- **`signTransaction()` → Two-step flow**: Now takes `(vaultId, transactionBytes, amount, destinationAddress)`. Step 1 creates a custody transaction at `POST /api/custody/transactions`, step 2 MPC-signs at `POST /api/custody/transactions/:txId/sign-raw` with `broadcast: false`. Returns `{ signedTransactionBytes: Buffer }` instead of `{ signature: Buffer }`
- **`signMessage()` → Vault-based**: Now calls `POST /api/custody/sign-message` with `{ vaultId, chain, messageHash, note }`. Response signature is hex-encoded (not base64 as before)
- **HMAC signing**: NOT modified — was already correct

### 2. `packages/api/src/modules/integrations/tamam-custody/tamam-custody.exceptions.ts`
- Added `TamamCustodyTransactionCreationException` for step 1 failures in the two-step signing flow

### 3. `packages/api/src/modules/payments/payments.service.ts`
- Updated `executeCustodyTransfer()` to use new two-step signing: calls `signTransaction(vaultId, bytes, amount, dest)` and then `executePreSignedTransaction(signedBytes)` instead of the old signature-based flow

### 4. `packages/api/src/modules/hedera/hedera.service.ts`
- Added `executePreSignedTransaction(signedBytes: Buffer)` — takes fully signed transaction bytes from custody's sign-raw endpoint and submits them to Hedera

### 5. `packages/api/src/modules/identity/services/wallet.service.ts`
- Updated `createWalletViaTamam()` to call `onboardUser(email, displayName)` instead of `generateKeypair()`. Uses user's email and displayName for the custody org. Maps `vaultId` → `keyId` on user entity

### 6. `packages/api/src/modules/integrations/tamam-custody/__tests__/tamam-custody.service.integration.test.ts`
- Updated all test cases to use new method names and signatures:
  - `generateKeypair()` → `onboardUser("email", "name")`
  - `signTransaction(keyId, bytes)` → `signTransaction(vaultId, bytes, amount, dest)`
  - Live API tests updated to match new flow

## Verification Results

- **Build**: PASS (zero errors, all packages compile)
- **Lint**: PASS (zero warnings/errors)
- **Tests**: 33 suites passed, 871 tests pass, 3 skipped (live staging — expected), 0 failures
- **Smoke test**: SKIPPED (custody staging credentials not available in test env)

## Expected Behavior After Deploy

- **Before**: All custody operations return HTTP 404 (endpoints don't exist)
- **After**: Custody operations call the correct endpoints. If staging is unreachable, error will be a connection/auth error, NOT a 404
- Operator-signed fallback still works for local development when custody is not configured
