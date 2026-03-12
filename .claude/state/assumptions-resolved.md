# Assumptions Audit — Resolution Log

> **Created**: 2026-03-11
> **Status**: All 18 assumptions from the initial audit have been resolved.

## Resolution Summary

| # | Assumption | Category | Resolution | Source |
|---|-----------|----------|------------|--------|
| 1 | Two-Layer Crypto Model | Architecture | CONFIRMED | User decision |
| 2 | HCS submitKey (Platform operator key) | Architecture | CONFIRMED | User decision |
| 3 | Wallet Creation via Custody API | Architecture | CONFIRMED | User decision |
| 4 | POST /onboarding response schema | Mirsad AI | DEFERRED | Test during implementation |
| 5 | Private endpoint authentication | Mirsad AI | SKIP | Not needed for hackathon; only public callback flow used |
| 6 | Callback HMAC verification | Mirsad AI | ACCEPT AS-IS | No HMAC verification for hackathon |
| 7 | Testnet vs Mainnet account creation | Tamam Custody | RESOLVED | Staging environment creates testnet accounts |
| 8 | User→Vault mapping (data model) | Tamam Custody | RESOLVED | Confirmed from actual codebase |
| 9 | (Merged into #1) | — | — | — |
| 10 | (Merged into #2) | — | — | — |
| 11 | (Merged into #3) | — | — | — |
| 12 | HCS topic for payments | Architecture | CONFIRMED | Part of #1-3 decisions |
| 13 | Payments via CryptoTransferTransaction | Architecture | CONFIRMED | No separate payment rails service |
| 14 | Stablecoin as standard HTS token | Architecture | CONFIRMED | Tamam Consortium manages tokens; we just transfer |
| 15 | IPFS provider | Infrastructure | CONFIRMED: Pinata | User decision |
| 16 | Webhook retry behavior | Tamam Custody | RESOLVED: No retries | Docs confirm "Service does not retry failed webhook deliveries" — need polling fallback |
| 17 | KYC expiration/re-verification | Mirsad AI | RESOLVED | Re-verification every few years based on risk rating |
| 18 | Document upload for KYC | Mirsad AI | SKIP | Not needed for hackathon; IDWise as future option |

---

## Detailed Resolutions

### #1–3, #9–14: Core Architecture Decisions (CONFIRMED)

Resolved in the architecture finalization session. Key decisions:

- **Two-Layer Crypto**: Layer 1 = Tamam MPC Custody (FROST threshold signing for transactions). Layer 2 = Client-side X25519 keypair (nacl.box for E2E message encryption).
- **HCS Access Control**: Platform operator key as submitKey. Access control at application layer (JWT + DB permissions).
- **Wallet Creation**: Via Tamam Custody API's `createHederaAccount: true` parameter during key generation.
- **Payments**: Standard HTS `CryptoTransferTransaction` signed through Tamam MPC Custody. No separate payment rails API.
- **Stablecoins**: Standard HTS tokens managed by Tamam Consortium. Our platform does standard token transfers.

### #4: POST /onboarding Response Schema (DEFERRED)

The Mirsad AI docs show the callback payload structure but don't detail the synchronous POST response body. We'll test this during implementation and handle whatever shape the response takes.

### #5: Mirsad AI Private Endpoint Auth (SKIP)

Mirsad AI only has 2 public endpoints: `POST /api/v1/public/onboarding` and `POST /api/v1/public/transaction-scoring`. No private endpoints are documented or available. For the hackathon, we use the public callback-based flow (POST /onboarding → async callback with decision). No additional endpoints are needed.

### #6: Callback HMAC Verification (ACCEPT AS-IS)

No HMAC/signature verification on Mirsad AI callbacks for the hackathon. We accept callbacks at face value. Production would need signature verification.

### #7: Testnet Account Creation (RESOLVED)

The Tamam Custody staging environment (`https://tamam-backend-staging-776426377628.us-central1.run.app`) creates Hedera testnet accounts. No special configuration needed — the environment determines the network.

### #8: User→Vault Data Model (RESOLVED — from actual codebase)

Explored the actual Tamam Custody codebase at `/olara-mobile-app`. The data model chain is:

```
User → OrgMember → Organization → VaultAccount → MpcKey → VaultAddress
```

Key findings from Prisma schema:
- `VaultAccount` belongs to `Organization` (via `orgId`), not to individual users
- `OrgMember` links users to organizations with role-based access (VIEWER, MEMBER, ADMIN, OWNER)
- `MpcKey` has `hederaAccountId` field — auto-created Hedera accounts stored on the key
- `VaultAddress` is unique per `[vaultId, chain]` — one address per chain per vault
- `MpcKey` is unique per `[vaultId, curveType]` — chains sharing a curve type share an MPC key

**Implication for our platform**: We need to either:
- Create one Tamam Organization per social platform user (simplest for hackathon), OR
- Create a single platform-level Organization and manage user→vault mapping internally

Our platform DB will store: `userId → tamamOrgId → vaultId → hederaAccountId`

### #15: IPFS Provider (CONFIRMED: Pinata)

Pinata selected for IPFS hosting (DID NFT metadata, profile images). Integration reference already exists in `external-integrations.md` with SDK-based implementation.

### #16: Webhook Retry Behavior (RESOLVED)

From `custody-integration.md`: "Service does not retry failed webhook deliveries (implement client-side queue)". Our platform needs:
- Idempotent webhook handler
- Polling fallback: `GET /api/transactions/{txId}` to check status if webhook is missed
- Client-side retry queue for failed webhook processing

### #17: KYC Expiration (RESOLVED)

Re-verification every few years based on risk rating. For hackathon, we don't need to implement expiration logic — just store the verification status and timestamp.

### #18: Document Upload for KYC (SKIP)

Not implementing document upload for the hackathon. Mirsad AI accepts document references (URLs/IDs) in the onboarding payload, but the actual upload mechanism isn't critical for the MVP. IDWise mentioned as a future alternative integration.

---

## Impact on Implementation

All assumptions are now resolved. No blockers remain. Implementation can proceed with confidence on:
- Phase 0: Infrastructure setup (all services documented)
- Phase 1: Identity/DID (Tamam Custody + Mirsad AI + Pinata all verified)
- Phase 2-5: Features build on resolved architecture decisions
- Phase 6: Submission preparation
