# Gap List — 2026-03-14 (Cycle 4)

## ALL CRITICAL GAPS ADDRESSED

## RESOLVED SINCE CYCLE 3 (1 gap improved)

- ~~GAP-034~~: Payment request fulfillment — RESOLVED (Run #24: test 8.8 PASS, real 0.5 HBAR transfer)

## CRITICAL (P0) — NONE REMAINING

No critical gaps. 100% QA pass rate stable across Runs #22 → #23 → #24 (137/137 testable).

## IMPORTANT (P1 — Should Fix)

- GAP-035: **[NEW]** Conversation unread count — spec requires `unreadCount` in conversation list response, not computed — `conversations.service.ts` (LOW)
- GAP-010: Pinata IPFS avatar/media upload — config fix + frontend file upload UI — `.env` + `settings/page.tsx` (LOW)
- GAP-031: Chat media sending UI — backend ready, frontend ChatInput.tsx text-only — `ChatInput.tsx` (MEDIUM)
- GAP-037: **[NEW]** Payment request auto-expire background job — lazy expiry only, no `@Cron`/`@Interval` — `payments.service.ts` (LOW)
- GAP-011: WebSocket notification delivery — implemented but not fully E2E verified — `chat.gateway.ts` (LOW)
- GAP-036: **[NEW]** Org ownership transfer — spec says Owner can transfer, no endpoint — `organization.service.ts` (MEDIUM)
- GAP-009: Org context switching — backend works, no frontend UI — HIGH effort, new pages needed
- GAP-013: Business broadcast — NOT IMPLEMENTED — HIGH effort, skip unless time permits

## NICE-TO-HAVE (P2 — Skip for Hackathon)

- GAP-014: Message reply threading (DTO exists, no frontend UI)
- GAP-015: Read receipt rendering in message list (backend exists, no frontend display)
- GAP-016: Typing indicator E2E verification
- GAP-017: Post engagement metrics (repost, share count)
- GAP-018: Notification preferences/settings UI
- GAP-019: Org activity log queryable API
- GAP-020: Transaction export to CSV
- GAP-021: Demo seed script & data (T25 — not code, not started)
- GAP-025: Document sharing (FR-DOC-001 — not implemented, P2)
- GAP-026: Push notifications FCM/APNs (not implemented, P2)
- GAP-032: Frontend file upload for avatar (URL-only, no file picker)
- GAP-033: Transaction detail as dedicated page (modal-only, functional)
- GAP-038: **[NEW]** Feed route alias — spec says `/api/v1/feed`, impl uses `/api/v1/posts/feed` (works, minor deviation)
- GAP-039: **[NEW]** Follow via URL param — spec says path param, impl uses body DTO (works, minor deviation)

## PREVIOUSLY RESOLVED (from Cycles 1-3)

- ~~GAP-001~~: KYC submission endpoints
- ~~GAP-002~~: Custody transaction E2E verified (Run #22)
- ~~GAP-003~~: REST message endpoints
- ~~GAP-004~~: WebSocket auth bypass (Run #22)
- ~~GAP-005~~: Encryption key registration
- ~~GAP-006~~: Split payment controller
- ~~GAP-007~~: Post comments endpoints
- ~~GAP-008~~: Remove/leave group
- ~~GAP-012~~: Duplicate org invitations
- ~~GAP-022~~: post_likes migration
- ~~GAP-023~~: User search endpoint path alias
- ~~GAP-024~~: Cross-user follow failures
- ~~GAP-028~~: post_comments migration (Run #22)
- ~~GAP-029~~: User search excludes pending_kyc (Run #22)
- ~~GAP-030~~: Encryption key missing (Run #22)
