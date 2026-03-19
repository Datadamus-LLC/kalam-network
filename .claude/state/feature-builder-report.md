ALL CRITICAL GAPS IMPLEMENTED

# Feature Builder Report — 2026-03-14 (Cycle 2, Iteration 1)

## Summary
- Gaps addressed: 5 (GAP-028, GAP-030, GAP-029, GAP-004, GAP-011)
- Features implemented: 2 new (encryption key endpoint, WebSocket auth hardening)
- Features verified as already resolved: 3 (post_comments table, search filter, notification pipeline)
- Build: **PASS**
- Lint: **PASS**
- Tests: **1032 passing, 3 skipped, 0 failing (0 regressions)**
  - Chat gateway tests: 10/10 pass (was 1/10 before fix)

---

## Implemented Features

### GAP-028: post_comments Migration Not Run — ALREADY RESOLVED
- **Status**: ALREADY RESOLVED (no action needed)
- **Evidence**: `post_comments` table already exists in DB with correct schema (8 columns, 3 indexes)
- **Verification**: `\d post_comments` shows id, postId, authorAccountId, contentText, hcsTopicId, hcsSequenceNumber, createdAt, deletedAt
- **Notes**: Migration was apparently run between gap analysis and this iteration

### GAP-030: Encryption Key Missing for Existing Users — IMPLEMENTED
- **Status**: IMPLEMENTED
- **Root cause**: All existing users in DB have NULL `encryptionPublicKey` — blocks conversation creation with `MISSING_ENCRYPTION_KEY` error
- **Fix**: Added idempotent `POST /api/v1/wallet/encryption-key` endpoint that generates X25519 keypair for users who don't have one
- **Files modified**:
  - `packages/api/src/modules/identity/services/wallet.service.ts` — Added `ensureEncryptionKey()` method and `EncryptionKeyResult` interface
  - `packages/api/src/modules/identity/controllers/wallet.controller.ts` — Added `POST /api/v1/wallet/encryption-key` endpoint
- **Endpoint**: `POST /api/v1/wallet/encryption-key` (JWT required)
  - Returns `{ encryptionPublicKey: string, generated: boolean }`
  - Idempotent: returns existing key if present, generates new one if missing
- **Impact**: Unblocks conversation creation (1 test), messaging (3 tests), in-chat payments (4 tests) = 8 blocked scenarios

### GAP-029: User Search Excludes Non-Active Users — ALREADY RESOLVED
- **Status**: ALREADY RESOLVED (no action needed)
- **Evidence**: `profile.service.ts:328` already uses `In(["active", "pending_kyc"])` for searchable statuses
- **Notes**: Fix was applied in a previous iteration but gap analysis wasn't updated

### GAP-004: WebSocket Authentication Bypass — FIXED
- **Status**: FIXED
- **Root cause**: `allowRequest` callback only checked for token *presence*, not *validity*. Invalid tokens could establish polling sessions before namespace middleware rejected them.
- **Fix**: `allowRequest` now fully verifies JWT using `jsonwebtoken.verify()`. Uses module-level variable `_chatGatewayJwtSecret` set from ConfigService during `afterInit()`, so it works in both production and test environments.
- **Files modified**:
  - `packages/api/src/modules/chat/chat.gateway.ts` — Added `jsonwebtoken` import, JWT verification in `allowRequest`, module-level secret variable, secret initialization in `afterInit()`
- **Dependencies added**:
  - `jsonwebtoken` (production dependency)
  - `@types/jsonwebtoken` (dev dependency)
- **Test impact**: Chat gateway integration tests went from 1/10 pass to 10/10 pass
- **Security**: Invalid tokens now rejected at HTTP transport level before any polling session is established

### GAP-011: Real-Time Notification Delivery via WebSocket — VERIFIED CORRECT
- **Status**: VERIFIED (wiring is correct, was blocked by GAP-030)
- **Evidence**:
  1. `NotificationsService.sendNotification()` emits `notification.created` via EventEmitter (line 130)
  2. `ChatGateway.handleNotificationCreated()` listens with `@OnEvent("notification.created")` and emits to `user:{accountId}` room
  3. `handleConnection()` auto-joins users to `user:${accountId}` room (line 312)
- **Root cause of QA failure**: QA Suite 11 was blocked by conversation prerequisite (GAP-030 — missing encryption keys prevented conversation creation). With GAP-030 fixed, the notification pipeline should work end-to-end.
- **Notes**: No code changes needed — pipeline was correctly implemented, just blocked by upstream dependency

---

## Remaining Gaps (Not Addressed This Iteration)

### GAP-002: Custody Transaction Not E2E Verified
- **Status**: Code looks correct but never tested against live staging
- **Reason**: Requires live Tamam Custody staging credentials and a funded vault — verification only, no code changes expected

### GAP-010: Pinata IPFS Avatar Upload
- **Status**: Code correct, API key lacks `pinFileToIPFS` scope
- **Reason**: Config-only fix, needs Pinata API key regeneration

### GAP-009: Organization Context Switching
- **Status**: Backend works, no frontend UI
- **Reason**: HIGH effort, frontend-only gap

### GAP-013: Business Broadcast Feature
- **Status**: NOT IMPLEMENTED
- **Reason**: HIGH effort, skip unless time permits

---

## Validation Results

| Check | Result |
|-------|--------|
| `pnpm build` | PASS (all 5 packages) |
| `pnpm lint` | PASS (0 errors, 0 warnings) |
| API tests | 46 suites, 1032 pass, 3 skip, 0 fail |
| Web tests | 7 suites, 158 pass, 0 fail |
| Total tests | 53 suites, 1190 pass, 3 skip, 0 fail |
| Regressions | 0 |
| Code quality | 0 violations (no `any`, no `@ts-ignore`, no `console.log`) |

---

## Files Changed

### Modified
- `packages/api/src/modules/identity/services/wallet.service.ts` — Added `ensureEncryptionKey()` method
- `packages/api/src/modules/identity/controllers/wallet.controller.ts` — Added `POST /api/v1/wallet/encryption-key` endpoint
- `packages/api/src/modules/chat/chat.gateway.ts` — JWT verification in `allowRequest`, module-level secret
- `packages/api/package.json` — Added `jsonwebtoken` dependency
- `pnpm-lock.yaml` — Updated lockfile

### New Endpoints
- `POST /api/v1/wallet/encryption-key` — Generate/retrieve X25519 encryption keypair (JWT required)
