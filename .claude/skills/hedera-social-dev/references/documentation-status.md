# Documentation Status Board

**Last updated:** 2026-03-11

## Status Legend

- **DOCUMENTED**: Public documentation exists and is accessible. Code can be written with confidence.
- **UNDOCUMENTED**: No documentation available. STOP and ask user before writing integration code.
- **NEEDS_VERIFICATION**: May have public documentation. Must verify before writing code.
- **USER_PROVIDED**: User has provided documentation in this project. Reference the source file.

---

## Integration Status

### Hedera Network — ✅ DOCUMENTED

**Source:** https://docs.hedera.com/hedera/sdks-and-apis/sdks

**SDK:** `@hashgraph/sdk` (npm, latest 2.x)

**Coverage:** Full SDK documentation for all transaction types needed

**What we know:**
- `TopicCreateTransaction` — creating HCS topics
- `TopicMessageSubmitTransaction` — submitting messages to topics
- `TopicMessageQuery` — reading topic messages
- `TokenCreateTransaction` — creating token types (for DID/credential NFTs)
- `TokenMintTransaction` — minting NFTs
- `TokenFreezeAccountTransaction` — freezing tokens (for soulbound credentials)
- `TokenWipeAccountTransaction` — wiping tokens (for profile/credential updates)
- `CryptoTransferTransaction` — HBAR and HTS token transfers
- `Client` configuration (testnet/mainnet)
- `PrivateKey`, `PublicKey` handling and derivation
- Transaction receipts and status checking
- Gas/fee calculations for transactions

**Verified endpoints:**
- Testnet: `testnet.hedera.com:50211`
- Mainnet: `mainnet.hedera.com:50211`
- Mirror API: https://testnet.mirrornode.hedera.com (testnet), https://mainnet-public.mirrornode.hedera.com (mainnet)

---

### Hedera Mirror Node — ✅ DOCUMENTED

**Source:** https://docs.hedera.com/hedera/sdks-and-apis/rest-api

**Coverage:** REST API for reading on-chain data without transaction costs

**What we know:**
- `GET /api/v1/topics/{topicId}/messages` — retrieve topic messages with pagination
- `GET /api/v1/accounts/{accountId}` — account info (balance, public key, created date)
- `GET /api/v1/tokens/{tokenId}/nfts` — NFT list for a token
- `GET /api/v1/tokens/{tokenId}/nfts/{serialNumber}` — specific NFT metadata
- `GET /api/v1/transactions/{transactionId}` — transaction status and details
- `GET /api/v1/accounts/{accountId}/transactions` — account transaction history
- Pagination via `links.next` parameter
- Query filters: `account.id`, `timestamp`, `result`

**Base URLs:**
- Testnet: `https://testnet.mirrornode.hedera.com`
- Mainnet: `https://mainnet-public.mirrornode.hedera.com`

**Rate limits:** Unknown (needs verification via API headers)

---

### Tamam MPC Custody (Tamam Custody) — ✅ USER_PROVIDED

**Source:** User-provided codebase (`olara-mobile-app` project) + OpenAPI spec + Mintlify docs

**Date provided:** 2026-03-11

**Integration ready:** true

**Reference file:** `.claude/skills/hedera-social-dev/references/custody-integration.md`

**What we know:**
- Base URL: `https://tamam-backend-staging-776426377628.us-central1.run.app`
- Authentication: API Key (`X-API-Key` header, format `olara_{prefix}{secret}`) + JWT for portal
- Scopes: `read`, `write`, `admin`
- Request signing: HMAC-SHA256 for sensitive operations (freeze/unfreeze/reshare)
- MPC: FROST threshold signing, 9 nodes, configurable 2-of-3 up to 8-of-9
- Key generation: `POST /api/custody/mpc/keys` with DKG ceremony, auto-creates Hedera accounts
- Transactions: Full lifecycle with policy engine, approval flow, MPC signing, broadcast
- Hedera native: HBAR + HTS token transfers supported
- Error format: `{ success: false, error, code, details }`
- Rate limits: 60/min, 1000/hr, burst 100
- Webhooks: HMAC-SHA256 signature verification via `x-olara-signature` header
- Compliance: Export to JSON, CSV, PDF, CBB_SANDBOX, VARA_VIRTUAL, SEC_17A4
- Audit logs submitted to HCS for immutable record-keeping

**Tasks unblocked:** T10 (Wallet Creation), T14 (Create Conversation), T21/T22 (Payments)

---

### Tamam Consortium Stablecoins (Payment Rails) — ✅ RESOLVED (No Integration Needed)

**Date resolved:** 2026-03-11

**Resolution:** User clarified that there is NO external payment rails API to integrate with. The Tamam Consortium manages stablecoin issuance — our platform simply USES the stablecoins they create as standard HTS (Hedera Token Service) tokens.

**What this means for implementation:**
- Payments are standard HTS token transfers via `CryptoTransferTransaction` from `@hashgraph/sdk`
- Use the Tamam MPC Custody API to sign and submit transfer transactions
- Stablecoin token IDs will come from environment variables
- No separate payment API integration needed — this is purely Hedera SDK + Custody API

**Tasks unblocked:** T21 (Payments Service), T22 (Frontend Payments), T23 (Escrow)

---

### Mirsad AI KYC/AML (formerly "Mirsad") — ✅ USER_PROVIDED

**Source:** User-provided documentation (API Integration Guide, Payload Structure, Callback Docs)

**Date provided:** 2026-03-11

**Integration ready:** true

**Reference file:** `.claude/skills/hedera-social-dev/references/mirsad-ai-integration.md`

**What we know:**
- Production URL: `https://dashboard-api.olara.io`
- Staging URL: `https://olara-api.var-meta.com`
- Authentication: Public endpoints (no auth required for onboarding and transaction scoring)
- Onboarding: `POST /api/v1/public/onboarding` — supports INDIVIDUAL and CORPORATE
- Transaction scoring: `POST /api/v1/public/transaction-scoring` — AML risk scoring
- AI Decision review: `GET /api/v1/private/ai/decision/{request_id}` (private, needs auth)
- Async processing: Results delivered via callback_url (POST with request_id + status)
- Status values: `approved`, `rejected`, `on_hold`
- Flow enums: `"OnBoardingFlow"` and `"TransactionFlow"` (exact case)
- HEDERA explicitly supported as `blockchain_type`
- Document refs are URLs (S3, etc.)

**Tasks unblocked:** T11 (KYC & DID NFT), T19 (Update Profile with Credentials)

---

### Pinata IPFS — ⚠️ NEEDS_VERIFICATION

**Source:** Publicly available at https://docs.pinata.cloud/

**Current assumptions:**
- REST API for pinning files and JSON to IPFS
- JWT authentication via bearer token
- `POST /pinning/pinFileToIPFS` — upload files
- `POST /pinning/pinJSONToIPFS` — upload JSON metadata
- Gateway URL pattern: `https://gateway.pinata.cloud/ipfs/{cid}`
- Rate limits and quota system

**Action required:**
1. Fetch and verify Pinata documentation matches assumptions
2. Test authentication flow with provided API key
3. Confirm gateway URL patterns and access controls
4. Verify file size limits and supported media types

**Status:** Do NOT write Pinata integration code until this is verified

**When verified:**
1. Move status to DOCUMENTED
2. Add verification date
3. Add specific endpoint URLs and schemas
4. Document authentication flow
5. List any deviations from assumptions

---

### NestJS Framework — ✅ DOCUMENTED

**Source:** https://docs.nestjs.com/

**Coverage:** Full framework documentation including:
- Dependency injection and module system
- Exception filters and middleware
- Guards, pipes, decorators
- TypeORM integration
- Configuration and environment handling
- Logging

**Verified version:** Latest stable 10.x

---

### Next.js Frontend Framework — ✅ DOCUMENTED

**Source:** https://nextjs.org/docs

**Coverage:** Full framework documentation including:
- App Router (not Pages Router)
- Server components and client components
- API routes
- Data fetching and caching
- Deployment

**Verified version:** Latest stable 14.x or 15.x

---

### Web Crypto API — ✅ DOCUMENTED

**Source:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API

**Coverage:** Browser cryptography for:
- AES-256-GCM encryption/decryption
- ECDH key exchange (key derivation)
- ECDSA signing and verification
- Random number generation

**Note:** All client-side encryption for HCS private messages uses this API

---

### TypeScript & tsconfig — ✅ DOCUMENTED

**Source:** https://www.typescriptlang.org/

**Required strict settings:**
- `strict: true` — all type checking enabled
- `noUncheckedIndexedAccess: true` — safe object indexing
- `noImplicitAny: true` — no implicit any types
- `exactOptionalPropertyTypes: true` — strict optional handling

**No exceptions:** Every file must compile with these settings

---

## How to Update This Document

### When the user provides documentation for an UNDOCUMENTED service:

1. Confirm you have received documentation and understand the integration
2. Update the service status from `UNDOCUMENTED` to `USER_PROVIDED`
3. Add a **Source** line pointing to where the docs are stored: `/mnt/social-platform/docs/integrations/{service-name}/`
4. Add **Date provided** line with the date documentation was received
5. Move the entire "What we DON'T know" section into "What we now know"
6. Add specific API details:
   - Base URL and environment-specific endpoints
   - Authentication method and credential handling
   - Complete endpoint list with HTTP method, path, request schema, response schema
   - Error codes and meanings
   - Rate limits and quotas
   - Any timing or retry requirements
7. Remove the **BLOCKING** notice from affected tasks
8. Remove the "What we need from user" section
9. Add a **Integration ready:** true line

**Example update:**

```markdown
### Tamam Custody MPC — ✅ USER_PROVIDED

**Source:** `/mnt/social-platform/docs/integrations/tamam-custody/api.md`

**Date provided:** 2026-03-11

**Integration ready:** true

**What we know:**
- Base URL: `https://tamam-backend-staging-776426377628.us-central1.run.app` (staging/testnet)
- Authentication: Bearer token in `Authorization` header
- Key generation: `POST /keys/generate` with request schema {...}
- Key signing: `POST /sign` with transaction envelope
- Hedera account derivation: {specific process described}
- Error codes: INVALID_CREDENTIALS, RATE_LIMIT_EXCEEDED, KEY_NOT_FOUND, etc.
```

### When you verify a NEEDS_VERIFICATION service:

1. Fetch the public documentation
2. Confirm the API contract matches the listed assumptions
3. Test with sample credentials (if applicable)
4. Update status from `NEEDS_VERIFICATION` to `DOCUMENTED`
5. Add **Verification date** line
6. Update the "What we know" section with verified details
7. Note any deviations from original assumptions

---

## Blocking Dependencies

**All documentation blockers are RESOLVED as of 2026-03-11.**

Previously blocked tasks are now unblocked:

| Task | Was Blocked By | Now | Reference |
|------|---------------|-----|-----------|
| T10: Wallet Creation | Tamam Custody MPC | ✅ UNBLOCKED | `custody-integration.md` |
| T11: KYC & DID NFT | Mirsad KYC/KYB | ✅ UNBLOCKED | `mirsad-ai-integration.md` |
| T14: Create Conversation | T10 (wallet) | ✅ UNBLOCKED | Dependency chain resolved |
| T21: Send Hbar/Tokens | Tamam Payment Rails | ✅ UNBLOCKED | Standard HTS transfers via Custody API |
| T22: View Balance & History | Tamam Payment Rails | ✅ UNBLOCKED | Hedera Mirror Node + Custody API |
| T23: Escrow/Timelock | Tamam Payment Rails | ✅ UNBLOCKED | Standard HTS transfers via Custody API |

**All tasks are now ready for implementation** (subject to dependency ordering in `.claude/state/progress.md`).

---

## Rules for Developers

- **NEVER assume an API exists** without documentation
- **NEVER invent endpoint names or schemas** — ask the user
- **NEVER skip reading this board** before starting a task
- **ALWAYS check blocking dependencies** before writing code
- **ALWAYS update this board** when user provides new documentation
- **ALWAYS link to source documentation** in code comments
