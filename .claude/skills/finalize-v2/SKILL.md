# Finalize V2 — Fix Remaining QA Failures

## Context

E2E QA Run #11 scored 127/158 (80.4%). The HMAC signing mismatch (BUG-003) has been fixed manually in `tamam-custody.service.ts`. This skill addresses the remaining 14 fixable test failures.

## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use `any` type or `@ts-ignore`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars via ConfigService
- NEVER throw generic Error — use typed exception classes
- NEVER use setTimeout for async — use proper async/await

---

## GAP LIST — 11 Bugs to Fix

### GAP 1: WebSocket Handshake Auth (BUG-013) — HIGH

**Problem**: WebSocket /chat namespace allows connections without JWT token. Auth only checked on first message emit, not at handshake.

**Fix**: Add `handleConnection` auth in `chat.gateway.ts`:
```
In @WebSocketGateway afterInit or handleConnection:
1. Extract token from handshake: client.handshake.auth?.token || client.handshake.headers?.authorization
2. Verify JWT using JwtService.verifyAsync()
3. If invalid/missing → client.disconnect(true)
4. If valid → attach user data to client.data.user
```

**Files**: `packages/api/src/modules/chat/chat.gateway.ts`
**Tests**: 11.2, 11.3

---

### GAP 2: Like/Unlike Post (BUG-015) — MEDIUM

**Problem**: POST /posts/:id/like and DELETE /posts/:id/like return 404 — endpoints not implemented.

**Implementation**:
1. Create `PostLike` entity in `packages/api/src/modules/posts/entities/`:
   - `id` (UUID PK), `userId` (FK to users), `postId` (FK to posts), `createdAt`
   - Unique constraint on (userId, postId)
2. Add to `PostsService`:
   - `likePost(userId, postId)` — insert like, return 201. If duplicate → 409
   - `unlikePost(userId, postId)` — delete like, return 200. If not found → 404
3. Add to `PostsController`:
   - `POST /posts/:id/like` — @UseGuards(JwtAuthGuard), calls likePost
   - `DELETE /posts/:id/like` — @UseGuards(JwtAuthGuard), calls unlikePost
4. Add `likes` relation to Post entity, add `likesCount` to post response

**Files**: posts.controller.ts, posts.service.ts, new post-like.entity.ts
**Tests**: 5.11, 5.12

---

### GAP 3: Delete Post (BUG-016) — MEDIUM

**Problem**: DELETE /posts/:id returns 404 — endpoint not implemented.

**Implementation**:
1. Add to `PostsService`:
   - `deletePost(userId, postId)` — soft delete. Check ownership first.
   - If not owner → throw ForbiddenException (403)
   - If not found → throw NotFoundException (404)
2. Add to `PostsController`:
   - `DELETE /posts/:id` — @UseGuards(JwtAuthGuard), calls deletePost
3. Use TypeORM soft delete (`@DeleteDateColumn()` if not already on Post entity)

**Files**: posts.controller.ts, posts.service.ts, post.entity.ts
**Tests**: 5.13, 5.14

---

### GAP 4: Cancel Payment Request — MEDIUM

**Problem**: POST /payments/request/:id/cancel returns 404 — endpoint not implemented.

**Implementation**:
1. Add to `PaymentsService`:
   - `cancelPaymentRequest(userId, requestId)` — set status to 'cancelled'
   - Only the requester (creator) can cancel
   - Can only cancel if status is 'pending'
2. Add to `PaymentsController`:
   - `POST /payments/request/:id/cancel` — @UseGuards(JwtAuthGuard)

**Files**: payments.controller.ts, payments.service.ts
**Tests**: 8.23

---

### GAP 5: Auth Guard on Search (BUG-002) — MEDIUM

**Problem**: GET /search/users works without authentication.

**Fix**: Add `@UseGuards(JwtAuthGuard)` to the search controller method.

**Files**: `packages/api/src/modules/search/search.controller.ts` (or wherever search is defined)
**Tests**: 4.3

---

### GAP 6: Rate Limiting on Auth (BUG-005) — MEDIUM

**Problem**: Registration endpoint accepts unlimited requests.

**Fix**:
1. Install `@nestjs/throttler` if not present
2. Add `ThrottlerModule.forRoot({ throttlers: [{ ttl: 60000, limit: 5 }] })` to AppModule
3. Add `@UseGuards(ThrottlerGuard)` to auth controller register and login methods
4. Or use `@Throttle({ default: { ttl: 60000, limit: 5 } })` decorator

**Files**: auth.controller.ts, app.module.ts
**Tests**: 2.17

---

### GAP 7: Org Name MinLength (BUG-006) — LOW

**Problem**: Organization name accepts empty string and 1-char names.

**Fix**: Add `@MinLength(2)` decorator to the `name` field in `CreateOrganizationDto`.

**Files**: `packages/api/src/modules/organizations/dto/create-organization.dto.ts`
**Tests**: 10.6, 10.7

---

### GAP 8: Login Non-existent User (BUG-008) — LOW

**Problem**: Login with non-existent email returns 401 "Invalid or expired OTP" instead of 404.

**Fix**: In auth service login method, check if user exists first. If not, throw NotFoundException with "User not found" message.

**Files**: auth.service.ts
**Tests**: 2.11

---

### GAP 9: Health Endpoint Envelope (BUG-019) — LOW

**Problem**: GET /health returns Terminus format `{"status":"ok","info":{...}}` instead of standard envelope.

**Fix**: Override the health check controller to wrap in standard envelope:
```json
{"success": true, "data": {"status": "ok", "database": "up", "redis": "up"}, "timestamp": "..."}
```

**Files**: health controller or app.controller.ts
**Tests**: 12.2

---

### GAP 10: Decline Returns 201 (BUG-021) — LOW

**Problem**: POST /payments/request/:id/decline returns 201 instead of 200.

**Fix**: Change the `@HttpCode(HttpStatus.CREATED)` or `@Post()` response code to `@HttpCode(HttpStatus.OK)` on the decline method in PaymentsController. Or add `@HttpCode(200)` explicitly.

**Files**: payments.controller.ts
**Tests**: 8.11

---

### GAP 11: Search by AccountId (BUG-014) — LOW

**Problem**: Search returns 0 results when querying by Hedera accountId (0.0.XXXXX format) or email.

**Fix**: In the search service, add fallback queries:
1. If query matches `0.0.\d+` pattern → also search by `hederaAccountId` column
2. If query contains `@` → also search by `email` column
3. Keep existing displayName search as primary

**Files**: search.service.ts
**Tests**: 4.4, 4.5

---

## PHASES

### Phase 1: Implement All Gaps
Go through GAPs 1-11 in order. For each:
1. Read the relevant source files
2. Implement the fix following all CLAUDE.md rules
3. Verify with `pnpm lint` (no errors)

### Phase 2: Build & Type Check
```bash
pnpm --filter @hedera-social/api build
pnpm --filter @hedera-social/shared build
```
Fix any compilation errors.

### Phase 3: Run Tests
```bash
pnpm test
```
All existing tests must still pass. Zero regressions.

### Phase 4: Smoke Test
Start the real app and verify each fix with curl:
1. WebSocket: `wscat` or Socket.IO client connects without token → should be rejected
2. Like: `POST /posts/:id/like` → 201
3. Delete: `DELETE /posts/:id` → 200 (own) or 403 (other's)
4. Cancel payment: `POST /payments/request/:id/cancel` → 200
5. Search auth: `GET /search/users?q=test` without token → 401
6. Org name: `POST /organizations` with `{"name":""}` → 400
7. Login non-existent: `POST /auth/login` with fake email → 404
8. Health: `GET /health` → standard envelope
9. Decline: response code 200 (not 201)
10. Search accountId: `GET /search/users?q=0.0.XXXXX` → returns results

### Phase 5: Report
Write results to `.claude/state/finalize-v2-report.md`:
- For each GAP: FIXED / STILL BROKEN / BLOCKED
- Build: PASS/FAIL
- Lint: PASS/FAIL
- Tests: X passing, Y failing
- Smoke: X/Y passed
- Rule violations: NONE or list

If ALL gaps are fixed, write "ALL V2 GAPS RESOLVED" at the top.
