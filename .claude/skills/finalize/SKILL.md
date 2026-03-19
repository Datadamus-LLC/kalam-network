---
name: finalize
description: "Identify implementation gaps, fix bugs, implement missing features, validate with real tests. Loop until everything passes. Follows all project rules from CLAUDE.md."
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob, Agent"
---

# Finalize — Audit, Implement, Validate, Loop

You are a senior engineer finalizing a Hedera Social Platform for hackathon submission. Your job is to close every gap between what the task tracker claims is done and what actually works. You implement missing code, fix bugs, validate with real infrastructure, and loop until everything passes.

## READ FIRST (MANDATORY)

1. `CLAUDE.md` — **ABSOLUTE LAW**. No mocking. No faking. No simulating. No `any` types. No `console.log`. No hardcoding. No `@ts-ignore`. NestJS Logger only. Typed exceptions only.
2. `.env` — Hedera credentials, Tamam Custody config, Mirsad AI config
3. `.claude/state/qa-report.md` — latest QA results showing what's broken
4. `.claude/state/progress.md` — task tracker (may be inaccurate)
5. `.claude/skills/hedera-social-dev/references/rules-and-standards.md` — coding standards
6. `.claude/skills/hedera-social-dev/references/custody-integration.md` — Tamam API docs
7. `.claude/skills/hedera-social-dev/references/mirsad-ai-integration.md` — Mirsad API docs

## PHASE 1: AUDIT — Find All Gaps

Before writing any code, audit the full codebase. Check EVERY item below. If you find it's already fixed, mark it and move on. If it's broken or missing, add it to your fix list.

### GAP 1: Missing Wallet Creation Endpoint (P1-T10) — CRITICAL

**What's missing**: The entire wallet creation flow. Users register and verify OTP but stay in `pending_wallet` status forever because there's no endpoint to create their Hedera wallet.

**What exists already**:
- `TamamCustodyService` at `packages/api/src/modules/integrations/tamam-custody/tamam-custody.service.ts` — has `generateKeypair()` method
- `OnboardingService` at `packages/api/src/modules/identity/services/onboarding.service.ts` — references wallet but doesn't create it
- User entity has fields: `hederaAccountId`, `publicKey`, `keyId`, `encryptedPrivateKey`
- Frontend expects: `POST /api/v1/wallet/create` (JWT-protected)

**What to implement**:
1. Create `packages/api/src/modules/identity/controllers/wallet.controller.ts`:
   - `POST /api/v1/wallet/create` — JWT-protected
     - Call `TamamCustodyService.generateKeypair()` to get ECDSA keypair via Tamam MPC
     - Use the public key to create a real Hedera account on testnet via `AccountCreateTransaction`
     - Store `hederaAccountId`, `publicKey`, `keyId`, `encryptedPrivateKey` on the user entity
     - Update user status from `pending_wallet` to `pending_kyc`
     - Create the user's HCS topics (feed topic, notification topic) if not already created
     - Return `{ hederaAccountId, status }` in the response
   - `GET /api/v1/wallet/status` — JWT-protected
     - Return current wallet status for the authenticated user

2. Register the controller in `IdentityModule` (or whichever module handles identity)

3. Ensure the Hedera operator account has enough HBAR to fund new accounts (check balance, use faucet if needed)

**Reference**: Read `tasks/phase-1-identity/P1-T10-wallet-creation.md` for the full spec.
**Reference**: Read `.claude/skills/hedera-social-dev/references/custody-integration.md` for Tamam API.

### GAP 2: WebSocket Gateway Not Initializing — HIGH

**Symptom**: `GET /socket.io/?EIO=4&transport=polling` returns 404. No gateway startup logs.

**What exists**: `packages/api/src/modules/chat/chat.gateway.ts` is fully implemented with all events.

**Likely causes** (check all):
1. `ChatModule` not imported in `AppModule` — check `app.module.ts` imports array
2. Redis adapter initialization failing silently — check `main.ts` or wherever the Redis adapter is configured
3. Socket.io dependencies missing — check `package.json` for `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`
4. Gateway namespace conflict — the gateway uses `@WebSocketGateway({ namespace: "/chat" })` but the client may be connecting to wrong path
5. CORS config on the gateway not matching — check `cors` option in gateway decorator

**Fix approach**:
- Read app startup logs carefully for any gateway-related errors
- Verify ChatModule is in AppModule.imports
- Verify Redis adapter setup in main.ts
- If Redis adapter fails, the gateway won't start — add error handling and fallback
- Test with: `curl "http://localhost:3333/socket.io/?EIO=4&transport=polling"`

### GAP 3: Stored XSS in Posts — HIGH

**Symptom**: `<img src=x onerror=alert(1)>` stored and returned verbatim in post content.

**Fix**: Add server-side HTML sanitization before storing post content.
- Install `sanitize-html` package: `pnpm add sanitize-html && pnpm add -D @types/sanitize-html`
- In the posts service, sanitize `text` field before saving:
  ```typescript
  import sanitizeHtml from 'sanitize-html';
  // Strip ALL HTML tags — posts are plain text
  const sanitizedText = sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} });
  ```
- Apply to: `packages/api/src/modules/social/services/posts.service.ts` (or wherever posts are created)
- Also sanitize: display names, bios, conversation names, payment notes — anywhere user input is stored

### GAP 4: Search Query Max Length Not Enforced — MEDIUM

**Symptom**: 101-character search query returns 200 instead of 400.

**What exists**: `SearchUsersDto` at `packages/api/src/modules/identity/dto/search-users.dto.ts` has `@MaxLength(100)`.

**Likely cause**: The DTO validation pipe isn't applied to query parameters, or the `@Query()` decorator isn't using the DTO class.

**Fix**: Ensure the controller method uses `@Query() dto: SearchUsersDto` with `ValidationPipe` applied, or add `@UsePipes(new ValidationPipe({ transform: true }))` to the method.

### GAP 5: Empty Notification IDs Accepted — MEDIUM

**Symptom**: `POST /notifications/read` with `{"notificationIds": []}` returns 200 instead of 400.

**What exists**: `MarkNotificationsReadDto` has `@IsArray()` and `@IsUUID("4", { each: true })` but no `@ArrayMinSize(1)`.

**Fix**: Add `@ArrayMinSize(1)` decorator to `notificationIds` field in `MarkNotificationsReadDto`.

### GAP 6: Chat State Endpoint 404 — MEDIUM

**Symptom**: `GET /api/v1/chat/conversations/:topicId/state` returns 404.

**What exists**: `packages/api/src/modules/chat/chat.controller.ts` has the endpoint.

**Likely cause**: `ChatModule` not imported in `AppModule` (same root cause as GAP 2).

### GAP 7: Notifications Not Generated — MEDIUM

**Symptom**: Follow, post, and payment actions don't create notification records.

**Check**:
1. Does the notification service's `create()` method get called from social graph, posts, and payments services?
2. Is EventEmitter2 configured? The chat gateway listens for `notification.created` events.
3. Are there `@OnEvent()` handlers that should create notifications?

**Fix**: Ensure that follow actions, payment sends, and payment requests emit notification creation events or call the notification service directly.

### GAP 8: Organization Creation Flow — MEDIUM

**Symptom**: KYC webhook accepts data but doesn't create organizations. Users can't access org endpoints.

**Check**: The KYC callback handler at `kyc-webhook.controller.ts` — does it create an organization when KYC status is "approved"? Or is org creation a separate flow triggered by KYB (Know Your Business)?

**Fix**: Either:
- Wire the KYC "approved" callback to create an organization for the user, OR
- Create a separate `POST /api/v1/organizations` endpoint for org creation after KYC approval

---

## PHASE 2: IMPLEMENT — Fix Every Gap

Work through gaps IN ORDER (GAP 1 first — it's the critical path). For each gap:

1. **Read** the relevant source files first
2. **Implement** the fix following ALL rules from CLAUDE.md:
   - No `any` types
   - No `console.log` — use NestJS `Logger` only
   - No hardcoded values — use env vars or config
   - Typed exception classes for all errors
   - Proper async/await
   - Validation on all inputs
3. **Build** after each fix: `cd packages/api && pnpm build && cd ../..`
4. **Verify** the build succeeds with zero errors

## PHASE 3: VALIDATE — Real Infrastructure Testing

After implementing ALL fixes, run the full validation:

### Step 1: Lint
```bash
cd packages/api && pnpm lint && cd ../..
```
Fix any lint errors before proceeding.

### Step 2: Type Check
```bash
cd packages/api && pnpm exec tsc --noEmit && cd ../..
```
Fix any type errors before proceeding.

### Step 3: Build
```bash
cd packages/api && pnpm build && cd ../..
```

### Step 4: Start Infrastructure
```bash
docker compose -f docker-compose.test.yml up -d
sleep 3
docker exec hedera-social-test-db pg_isready -U test -d hedera_social_test
docker exec hedera-social-test-redis redis-cli ping
```

### Step 5: Start the App
```bash
export NODE_ENV=test
set -a && source .env && set +a
export DB_HOST=localhost DB_PORT=5433 DB_USERNAME=test DB_PASSWORD=test DB_DATABASE=hedera_social_test
export REDIS_HOST=localhost REDIS_PORT=6380 PORT=3333
cd packages/api && node dist/main &
APP_PID=$!
cd ../..
# Wait for health
for i in $(seq 1 60); do
  curl -s http://localhost:3333/health > /dev/null 2>&1 && break
  sleep 1
done
```

### Step 6: Smoke Test Every Fix

Test each gap's fix with real curl commands:

**GAP 1 — Wallet Creation**:
```bash
# Register a user
RESPONSE=$(curl -s -X POST http://localhost:3333/api/v1/auth/register -H "Content-Type: application/json" -d '{"email": "wallet-test@qa.com"}')
# Login + get OTP from Redis/DB
# Verify OTP → get token
# Call wallet creation
curl -s -X POST http://localhost:3333/api/v1/wallet/create -H "Authorization: Bearer $TOKEN"
# EXPECT: 200/201, real hederaAccountId (0.0.XXXXX on testnet)
# VERIFY: Account exists on mirror node
# VERIFY: DB has hederaAccountId set, status = pending_kyc
```

**GAP 2 — WebSocket**:
```bash
curl -s "http://localhost:3333/socket.io/?EIO=4&transport=polling"
# EXPECT: NOT 404 — should return Socket.io handshake
```

**GAP 3 — XSS Sanitization**:
```bash
# Create post with XSS payload
curl -s -X POST http://localhost:3333/api/v1/posts -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"text": "<script>alert(1)</script> Hello"}'
# EXPECT: stored text should be "Hello" or escaped, NOT raw script tag
```

**GAP 4 — Search Length**:
```bash
LONG=$(python3 -c "print('X' * 101)")
curl -s -w "\n%{http_code}" "http://localhost:3333/api/v1/users/search?q=$LONG"
# EXPECT: 400
```

**GAP 5 — Empty Notification IDs**:
```bash
curl -s -w "\n%{http_code}" -X POST http://localhost:3333/api/v1/notifications/read \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"notificationIds": []}'
# EXPECT: 400
```

### Step 7: Kill App
```bash
kill $APP_PID 2>/dev/null
```

## PHASE 4: RE-AUDIT — Verify Nothing Broke

After all fixes are implemented and validated:

1. Run `pnpm lint` — must pass with zero warnings
2. Run `pnpm exec tsc --noEmit` — must pass with zero errors
3. Run `pnpm build` — must succeed
4. Run `pnpm test` — existing tests must still pass
5. Check that no CLAUDE.md rules were violated:
   ```bash
   # No any types
   grep -rn ": any" packages/api/src/ --include="*.ts" | grep -v "node_modules" | grep -v ".d.ts" | grep -v "// eslint-"
   # No console.log
   grep -rn "console.log\|console.error\|console.warn" packages/api/src/ --include="*.ts" | grep -v "node_modules"
   # No @ts-ignore
   grep -rn "@ts-ignore\|@ts-nocheck" packages/api/src/ --include="*.ts"
   # No jest.mock
   grep -rn "jest.mock\|jest.fn\|jest.spyOn" packages/api/src/ --include="*.ts"
   # No hardcoded secrets
   grep -rn "0x[a-fA-F0-9]\{64\}\|sk-[a-zA-Z0-9]\{20,\}" packages/api/src/ --include="*.ts"
   ```
6. If ANY violations found → fix them → rebuild → re-check

## PHASE 5: REPORT

Write results to `.claude/state/finalize-report.md`:

```markdown
# Finalization Report — [timestamp]

## Gaps Found
| # | Gap | Severity | Status |
|---|-----|----------|--------|
| 1 | Wallet creation endpoint | CRITICAL | FIXED / STILL BROKEN |
| 2 | WebSocket gateway | HIGH | FIXED / STILL BROKEN |
| ... | ... | ... | ... |

## Changes Made
[List every file created or modified]

## Validation Results
- Lint: PASS/FAIL
- TypeScript: PASS/FAIL
- Build: PASS/FAIL
- Tests: X passing, Y failing
- Rule violations: NONE / [list]

## Smoke Test Results
| Gap | Test | Expected | Actual | Result |
|-----|------|----------|--------|--------|
| 1 | POST /wallet/create | 201, real hedera ID | ... | PASS/FAIL |
| 2 | Socket.io handshake | not 404 | ... | PASS/FAIL |
| ... | ... | ... | ... | ... |

## Remaining Issues
[Anything still broken after this pass]
```

## RULES

1. **Follow CLAUDE.md rules EXACTLY** — no exceptions, no shortcuts
2. **No mocking, no faking, no simulating** — all validation uses real infrastructure
3. **Build after every change** — catch errors immediately
4. **If you can't fix something, document WHY** — don't silently skip it
5. **Read the reference docs before implementing** — custody-integration.md, mirsad-ai-integration.md
6. **Every new file must follow the project module structure** — controllers in controllers/, services in services/, DTOs in dto/
7. **Every new endpoint needs validation** — DTOs with class-validator decorators
8. **Every error needs a typed exception** — no generic `new Error()`
9. **Test with real infrastructure** — real PostgreSQL, real Redis, real Hedera testnet
