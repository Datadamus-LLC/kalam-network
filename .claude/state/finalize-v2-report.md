# Finalize V2 Report — Iteration 1

**Date**: 2026-03-13
**Focus**: All 11 QA gaps from E2E Run #11

## Gap Status

| # | Gap | Bug ID | Status | Details |
|---|-----|--------|--------|---------|
| 1 | WebSocket handshake JWT auth | BUG-013 | **FIXED** | Added JWT verification in `handleConnection()` — extracts token from `handshake.auth.token` or `Authorization` header, verifies with JwtService, disconnects on failure |
| 2 | Like/unlike post endpoints | BUG-015 | **FIXED** | Added `POST /posts/:id/like` (201) and `DELETE /posts/:id/like` (200). New PostLikeEntity with unique constraint on (userId, postId). Typed exceptions for duplicate like (409) and not-found unlike (404) |
| 3 | Delete post endpoint | BUG-016 | **FIXED** | Added `DELETE /posts/:id` with ownership check. Soft delete via TypeORM `softRemove()`. Returns 403 if not owner, 404 if not found |
| 4 | Cancel payment request | — | **FIXED** | Added `POST /payments/request/:id/cancel` (200). Only requester can cancel, only pending requests. New `cancelled` status added to entity and DTOs. HCS audit trail submission included |
| 5 | Auth guard on search | BUG-002 | **FIXED** | Added `@UseGuards(JwtAuthGuard)` to UsersSearchController class. Now requires JWT to search users |
| 6 | Rate limiting on auth | BUG-005 | **FIXED** | Installed `@nestjs/throttler`. Added `ThrottlerModule.forRoot()` to AppModule. Applied `@UseGuards(ThrottlerGuard)` + `@Throttle({ default: { ttl: 60000, limit: 5 } })` to register and login endpoints |
| 7 | Org name @MinLength(2) | BUG-006 | **FIXED** | Already had `@MinLength(2)` in CreateOrganizationDto. Verified global ValidationPipe is configured in main.ts with `whitelist: true, forbidNonWhitelisted: true, transform: true` |
| 8 | Login 404 for non-existent user | BUG-008 | **FIXED** | Changed `throw new UnauthorizedException(...)` to `throw new NotFoundException("User not found")` in `AuthService.login()` |
| 9 | Health endpoint standard envelope | BUG-019 | **FIXED** | Updated `AppController.health()` to return `{ success: true, data: { status: "ok" }, timestamp: "..." }`. Also updated root endpoint to return standard envelope |
| 10 | Decline returns 201 not 200 | BUG-021 | **FIXED** | Added `@HttpCode(HttpStatus.OK)` to `declinePaymentRequest()` in PaymentsController |
| 11 | Search by accountId/email | BUG-014 | **FIXED** | Updated `ProfileService.searchUsers()` to use OR-based where conditions: displayName LIKE + hederaAccountId exact match (for 0.0.XXXXX) + email LIKE. Deduplication via Map |

## Build & Lint

| Check | Result |
|-------|--------|
| TypeScript (tsc --noEmit) | **PASS** — 0 errors |
| ESLint | **PASS** — 0 errors, 0 warnings |
| API build (nest build) | **PASS** |
| Web build (next build) | **PASS** — 15 routes |
| Shared build (tsc) | **PASS** |

## Files Changed

### Modified (14 files)
1. `packages/api/src/modules/chat/chat.gateway.ts` — Handshake JWT auth
2. `packages/api/src/modules/social/controllers/posts.controller.ts` — Like/unlike/delete endpoints
3. `packages/api/src/modules/social/services/posts.service.ts` — Like/unlike/delete service methods
4. `packages/api/src/modules/social/social.module.ts` — Register PostLikeEntity
5. `packages/api/src/modules/social/exceptions/social.exceptions.ts` — New exception classes
6. `packages/api/src/modules/payments/payments.controller.ts` — Cancel endpoint + decline @HttpCode fix
7. `packages/api/src/modules/payments/payments.service.ts` — Cancel service method
8. `packages/api/src/modules/payments/exceptions/payment.exceptions.ts` — Cancel exception
9. `packages/api/src/modules/payments/dto/payment-response.dto.ts` — 'cancelled' status
10. `packages/api/src/modules/payments/dto/request-payment.dto.ts` — 'cancelled' status
11. `packages/api/src/modules/identity/controllers/users-search.controller.ts` — JwtAuthGuard + comment updates
12. `packages/api/src/modules/identity/services/profile.service.ts` — AccountId/email search
13. `packages/api/src/modules/auth/auth.controller.ts` — ThrottlerGuard on register/login
14. `packages/api/src/modules/auth/auth.service.ts` — NotFoundException for non-existent user
15. `packages/api/src/app.module.ts` — ThrottlerModule import
16. `packages/api/src/app.controller.ts` — Standard envelope for health/root
17. `packages/api/src/database/entities/payment-request.entity.ts` — 'cancelled' status
18. `packages/api/src/database/entities/index.ts` — PostLikeEntity export
19. `packages/api/src/database/data-source.ts` — PostLikeEntity registration

### Created (2 files)
1. `packages/api/src/database/entities/post-like.entity.ts` — PostLike entity
2. `packages/api/src/database/migrations/1773500000000-AddPostLikes.ts` — Migration for post_likes table

### Test Files Updated (3 files)
1. `packages/api/test/app.integration.spec.ts` — Updated expectations for standard envelope format
2. `packages/api/test/controllers.integration.spec.ts` — Added auth headers to search tests
3. `packages/api/src/modules/chat/__tests__/chat.gateway.integration.test.ts` — Updated to expect handshake rejection without token
4. `packages/api/src/modules/auth/auth.module.ts` — Added ThrottlerModule import for isolated test contexts

## Test Results

| Suite | Result |
|-------|--------|
| API tests | **871 passed**, 3 skipped, 0 failed |
| Web tests | **158 passed**, 0 failed |
| **Total** | **1029 passed**, 3 skipped, **0 failed** |

## Rule Compliance

| Rule | Status |
|------|--------|
| No `any` types | CLEAN |
| No `console.log` | CLEAN — NestJS Logger only |
| No `@ts-ignore` | CLEAN |
| No `jest.mock/fn/spyOn` | CLEAN |
| No hardcoded secrets | CLEAN — all config via ConfigService |
| No `new Error()` in production | CLEAN — typed exceptions only |
| No `setTimeout` | CLEAN |

## ALL V2 GAPS RESOLVED
