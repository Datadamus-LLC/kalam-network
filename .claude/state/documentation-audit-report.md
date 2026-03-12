# Documentation Audit Report

> **Date**: 2026-03-11
> **Status**: ✅ ALL 19 ISSUES RESOLVED
> **A2 Decision**: True E2E encryption — server NEVER sees message plaintext. Search is client-side only. Public content (posts, profiles) uses PostgreSQL full-text search.
> **A3/A4 Decision**: JWT access token = 24h, refresh token = 30d. Standardized across all files.
> **Scope**: Full cross-reference of docs/SPECIFICATION.md, architecture-overview.md, custody-integration.md, mirsad-ai-integration.md, assumptions-resolved.md, security.md, CLAUDE.md, docs/DEVELOPMENT-ROADMAP.md, and all task files.
> **Final verification**: Zero stale ThresholdKey, ECIES, olara-ai, or Fastify references remain outside this report.

---

## CATEGORY A: CRITICAL CONTRADICTIONS (must resolve before coding)

### A1. HCS submitKey Model — SPECIFICATION vs Resolved Assumption

**Conflict**: assumptions-resolved.md #2 says:
> "Platform operator key as submitKey. Access control at application layer (JWT + DB permissions)."

But docs/SPECIFICATION.md still describes per-participant ThresholdKey:
- Line 152 (FR-MSG-001): `Create private HCS topic with submitKey = ThresholdKey(1 of [senderKey, recipientKey])`
- Line 161 (FR-MSG-002): `Create private HCS topic with submitKey = ThresholdKey(1 of [all participant keys])`

architecture-overview.md line 236 also says:
> "Support threshold signatures (require all participants to sign messages)"

**Impact**: This determines whether message submission goes through Tamam MPC signing (ThresholdKey) or platform operator signs directly. Completely different architecture.

**Resolution needed**: Update docs/SPECIFICATION.md FR-MSG-001 and FR-MSG-002 to use platform operator key, and remove ThresholdKey references from architecture-overview.md.

---

### A2. Message Search vs E2E Encryption — Impossible Contradiction

**Conflict**: docs/SPECIFICATION.md line 250:
> "Search index is built from decrypted messages. This means the platform DOES need temporary access to decrypt messages for indexing purposes."

But docs/SPECIFICATION.md line 478 (US-005 acceptance criteria):
> "Messages are encrypted — platform cannot read them"

And security.md line 46:
> "Private keys stay on client — server NEVER sees plaintext conversation keys"

**Impact**: These are mutually exclusive. Either the platform can decrypt messages (for search) or it can't (E2E encryption). You cannot have both.

**Resolution needed**: Decision: (a) server-side search with platform having temporary decryption access, OR (b) true E2E encryption with client-side-only search. The docs/SPECIFICATION.md note on line 250 already flags this as "a privacy vs. UX tradeoff to discuss."

---

### A3. JWT Expiry — Three Different Values

| Document | Access Token | Refresh Token |
|----------|-------------|---------------|
| docs/SPECIFICATION.md (line 1672-1673) | 24h | 30-day |
| security.md (line 19) | 1h | 7d |
| architecture-overview.md (line 422) | 7d (single JWT_EXPIRY) | Not mentioned |

**Impact**: Authentication flow implementation will differ significantly between 1h and 24h access tokens.

**Resolution needed**: Pick one set of values and update all three files.

---

### A4. JWT Signing Algorithm — RS256 vs HS256

**Conflict**: docs/SPECIFICATION.md line 1666:
> "RS256 with rotating keys"

But architecture-overview.md line 422 uses:
> `JWT_SECRET=...` (implies symmetric HMAC/HS256)

**Impact**: RS256 requires RSA key pairs and rotation infrastructure. HS256 uses a shared secret. Very different implementation.

**Resolution needed**: For hackathon, HS256 with a single secret is simpler. Update docs/SPECIFICATION.md to match.

---

### A5. Encryption Key Exchange — ECIES/secp256k1 vs X25519/nacl.box

**Conflict**: docs/SPECIFICATION.md line 1661:
> "Key exchange: ECIES (Elliptic Curve Integrated Encryption Scheme) using ECDSA secp256k1 keys"

But assumptions-resolved.md #1 (confirmed architecture):
> "Layer 2 = Client-side X25519 keypair (nacl.box for E2E message encryption)"

X25519 is Curve25519 — a completely different curve from secp256k1.

**Impact**: Determines which crypto library we use and how key generation works.

**Resolution needed**: Update docs/SPECIFICATION.md line 1661 to match resolved architecture (X25519/nacl.box).

---

### A6. Backend Framework — Fastify vs NestJS

**Conflict**: docs/SPECIFICATION.md line 1899:
> `packages/api/` labeled as "Fastify API server"

But CLAUDE.md, architecture-overview.md, all task files, and the actual codebase all say NestJS.

**Impact**: Minor text error but misleading for anyone reading the spec.

**Resolution needed**: Change "Fastify" to "NestJS" in docs/SPECIFICATION.md line 1899.

---

### A7. Registration Flow — Password vs OTP-Only

**Conflict**: architecture-overview.md lines 45-47:
```
POST /auth/register {email, password}
Backend: Hash password, create local user record
```
References bcrypt password hashing.

security.md line 20:
> "Passwords: bcrypt with minimum 12 rounds"

But docs/SPECIFICATION.md line 80-82 (FR-ID-001):
> "Input: Email address OR phone number"
> "Process: 1. Validate input format. 2. Send OTP to email/phone. 3. User confirms OTP."

And docs/SPECIFICATION.md line 1038:
```json
{ "method": "email | phone", "value": "user@example.com | +971501234567" }
```

No password field anywhere in the spec's registration or login flows.

**Impact**: Two fundamentally different auth models. Password-based needs storage, hashing, reset flows. OTP-only is simpler but needs email/SMS infrastructure.

**Resolution needed**: Decide which model. If OTP-only, remove password/bcrypt references from architecture-overview.md and security.md.

---

## CATEGORY B: HALLUCINATED / STALE CONTENT (factually wrong)

### B1. Payment Flow — Fiat-to-HBAR Conversion via Tamam

architecture-overview.md lines 167-179 describes:
```
User selects recipient + amount (in fiat)
Backend: Check with Tamam MPC for exchange rate + fee
Backend: Call Tamam MPC → execute payment (fiat → HBAR conversion + transfer)
```

**Reality**: Tamam MPC Custody is a custody/signing service. It does NOT do fiat conversion or exchange rates. assumptions-resolved.md #13 confirms: "No separate payment rails service" and #14: "Our platform does standard token transfers."

**Fix**: Rewrite the payment flow to show standard CryptoTransferTransaction via Tamam signing, with amounts in HBAR/HTS tokens.

---

### B2. "Tamam MPC Payment Rails" as Separate Service

architecture-overview.md line 323 lists:
> `Tamam MPC Payment Rails (fiat-to-HBAR) | BLOCKED`

And env vars reference `TAMAM_MPC_PAYMENT_API_KEY`.

**Reality**: This service does NOT exist. assumptions-resolved.md #13 explicitly says "No separate payment rails service."

**Fix**: Remove the phantom "Payment Rails" service entirely. Remove `TAMAM_MPC_PAYMENT_API_KEY` env var. Payments go through the same Tamam Custody API.

---

### B3. Tamam/Mirsad Listed as "BLOCKED" — Docs Already Provided

architecture-overview.md lines 318-326 still shows:
```
| Tamam MPC Custody | BLOCKED | User must provide API docs |
| Tamam MPC Payment Rails | BLOCKED | User must provide API docs |
| Mirsad AI KYC | BLOCKED | User must provide API docs |
```

**Reality**: Documentation for both Tamam Custody and Mirsad AI has been provided and fully documented. These are no longer blocked.

**Fix**: Move Tamam Custody and Mirsad AI to the "REAL" section. Delete "Payment Rails" entirely.

---

### B4. MPC Signing Confused with Message Decryption

architecture-overview.md line 119:
> "Decrypt key share using recipient's private key (Tamam MPC signing)"

**Reality**: Message decryption uses the client-side X25519 keypair (Layer 2), NOT Tamam MPC Custody (Layer 1). Tamam MPC is for transaction signing only.

**Fix**: Change to "Decrypt key share using recipient's X25519 private key (client-side)"

---

### B5. Remaining "olara-ai" References in docs/SPECIFICATION.md

- Line 638: `"kycProvider": "olara-ai"` → should be `"mirsad-ai"`
- Line 1108: `"kycId": "olara-ai-request-id"` → should be `"mirsad-ai-request-id"`

---

### B6. custody-integration.md — Staging Labeled as "Production"

Line 29:
> `Production URL: https://tamam-backend-staging-776426377628.us-central1.run.app`

This is clearly a staging/GCP Cloud Run URL, not production.

**Fix**: Change label to "Staging URL" (we don't have the production URL yet).

---

### B7. custody-integration.md — Stale `OLARA_API_KEY` in Code Example

Line 46:
```typescript
const apiKey = process.env.OLARA_API_KEY;
```

Should be `process.env.TAMAM_CUSTODY_API_KEY` per the env var standardization we completed.

**Note**: The API key FORMAT `olara_{prefix}{secret}` and the header `X-API-Key` remain correct as-is — those are actual Tamam/Olara conventions. Only the env var NAME needs updating.

---

## CATEGORY C: SCOPE / STRUCTURAL ISSUES (may not need immediate fix)

### C1. Mobile App in Spec but Not in Project Structure

docs/SPECIFICATION.md line 1895 and docs/DEVELOPMENT-ROADMAP.md reference:
> `apps/mobile/    # React Native (Expo) app`

But CLAUDE.md's monorepo structure only shows `apps/web/`. No mobile app directory exists.

**Resolution needed**: Either add mobile to scope or explicitly mark it as post-hackathon. Since the hackathon deadline is March 23, focusing on web-only is probably correct.

---

### C2. Meilisearch Referenced but Not Provisioned

docs/SPECIFICATION.md line 247 (FR-MSG-011) references:
> "Query Meilisearch index"

But Meilisearch is not in: env vars, docker-compose, DEVELOPMENT-ROADMAP infrastructure tasks, or architecture diagrams.

**Resolution needed**: Either add Meilisearch to infrastructure (docker-compose, env vars) or replace with PostgreSQL full-text search for the hackathon.

---

### C3. Next.js Version Mismatch

- architecture-overview.md line 436: "Next.js 13+"
- CLAUDE.md: "Next.js 14 App Router"

**Fix**: Update architecture-overview.md to say "Next.js 14".

---

### C4. Onboarding Cost Discrepancy

- architecture-overview.md line 84: "~$1.06 (TokenCreate + Mint + Freeze + Transfer)"
- docs/SPECIFICATION.md line 122: "~$0.07 per user onboarding"

**Explanation**: The $1.06 includes TokenCreate ($1.00) which is a one-time platform deployment cost, not per-user. The $0.07 (Mint + Freeze + Transfer) is the actual per-user cost. architecture-overview.md's cost breakdown table (line 337) correctly shows $0.06 per user, which is closer to the spec's $0.07.

**Fix**: Clarify line 84 to say "~$1.06 for first user (includes one-time TokenCreate), ~$0.06 per subsequent user"

---

### C5. Rate Limiting Inconsistency

- security.md: "max 5 attempts per minute per IP" (auth endpoints)
- docs/SPECIFICATION.md line 1674: "100 API calls/minute per user, 10 HCS submissions/second per user"

These aren't contradictory (different scopes) but should be consolidated for clarity.

---

## SUMMARY

| Category | Count | Severity |
|----------|-------|----------|
| A: Critical Contradictions | 7 | MUST FIX before coding |
| B: Hallucinated/Stale Content | 7 | MUST FIX (factually wrong) |
| C: Scope/Structural Issues | 5 | SHOULD FIX or explicitly defer |
| **TOTAL** | **19** | |

## RECOMMENDED PRIORITY ORDER

1. **A1** (submitKey model) — Fundamental architecture decision
2. **A2** (E2E vs search) — Requires your decision, cannot be inferred
3. **A7** (password vs OTP) — Auth model needs clarity
4. **B1+B2** (payment hallucinations) — Remove phantom fiat conversion
5. **B3** (BLOCKED status) — Update to reflect reality
6. **A3+A4** (JWT values/algorithm) — Pick and standardize
7. **A5** (encryption curve) — Update spec to match resolved architecture
8. **A6+B5+B6+B7** (text fixes) — Straightforward corrections
9. **C1-C5** (scope items) — Address or defer explicitly
