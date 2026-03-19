---
name: zero-gaps
description: >
  Systematic gap identification and elimination for the Hedera Social Platform.
  Audits every layer (backend, frontend, WebSocket, DB, types), fixes every gap,
  re-audits after each iteration, and loops until 0 gaps remain.
  No gap is too small. No shortcut is acceptable.
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob, Task"
---

# Zero Gaps — Systematic Platform Completion

You are a senior engineer with one mission: eliminate every gap in the Hedera Social
Platform until it is flawlessly functional. You audit, fix, re-audit, and repeat until
there is nothing left to fix.

---

## ABSOLUTE LAWS (from CLAUDE.md — non-negotiable)

1. No `jest.fn()`, `jest.mock()`, stubs, fakes, or mocks
2. No `any` type or `@ts-ignore`
3. No `console.log` — NestJS Logger only on backend
4. No hardcoded values — everything from env vars
5. No generic `Error` — typed exceptions only
6. No `setTimeout` hacks
7. Every error typed, logged, propagated
8. All config from validated env vars
9. TypeScript must compile cleanly (`tsc --noEmit`)
10. No banned patterns from CLAUDE.md §NEVER DO THIS

---

## AUDIT METHODOLOGY

Run this audit on every iteration. Check every item. Mark ✅ fixed or ❌ still broken.

### Layer 1: Backend Routes
For every controller, verify:
- Route path matches frontend API client exactly
- Response wraps in `{ success, data, error, timestamp }` envelope
- JWT guard applied to protected endpoints
- ValidationPipe will catch bad input (DTOs with class-validator)
- Typed exception thrown (not `new Error()`) on failure

### Layer 2: Frontend → Backend Wiring
For every page and component:
- API client method exists and unwraps `.data` from envelope
- Correct HTTP verb and path
- Auth token injected (reads from `hedera-social-auth` localStorage key)
- Error handled with user-facing message

### Layer 3: WebSocket
- Frontend subscribes to correct room names (must match backend)
- Event names match exactly (server emits `X`, client listens for `X`)
- Namespace matches (`/chat`)
- Reconnection logic exists

### Layer 4: Types
- Shared types from `@hedera-social/shared` imported, not re-defined locally
- No `any` anywhere
- API response shapes match actual backend response shapes

### Layer 5: Feature Completeness
Every feature that has a backend endpoint MUST have:
- A frontend page or component that calls it
- Error handling
- Loading state
- Success state

### Layer 6: Organization/Business Layer
- Org wallet creation wired
- Org DID NFT minting wired
- Org social graph working
- Role-based access enforced
- Org management UI complete

---

## FIX PRIORITY ORDER

**P0 — Blocking real-time (fix first):**
1. WebSocket room names (`conv:{topicId}` not `conversation:{topicId}`)
2. WebSocket notification event (`server_notification` not `notification`)
3. Remove fake backend WebSocket events (`balance:update`, `payment:event`)

**P1 — Missing pages (core user flows):**
4. `/messages/[topicId]` — conversation detail + real-time chat
5. `/profile/me` — own profile page
6. Post likes UI (like/unlike button + count on PostCard)
7. Post comments UI (comment form + list on PostCard)

**P2 — Missing features:**
8. `/trending` page
9. Broadcast channels UI (subscribe, read, publish for orgs)
10. Split payment trigger (button to open modal)
11. Feature flag conditional rendering

**P3 — Organization backend completion:**
12. Org-owned Hedera wallet
13. Org-level DID NFT
14. Org social graph (follow org, org feed)
15. Role-based access enforcement (not just controller-level)
16. Org management UI (members, invites, roles, settings)

**P4 — Polish:**
17. Avatar upload → IPFS (not URL string)
18. Media upload → IPFS before post creation
19. Shared types imports (stop re-defining locally)
20. Socket reconnection logic
21. Error code-specific UX handling
22. FeedItemEntity fan-out logic
23. Navigation links to new pages
24. `getTransaction()` detail page

---

## VALIDATION AFTER EVERY FIX

After each fix, run:
```bash
pnpm --filter @hedera-social/api exec tsc -p tsconfig.json --noEmit
pnpm --filter @hedera-social/web exec tsc --noEmit
```

Both must pass with 0 errors before moving to the next fix.

---

## RE-AUDIT TRIGGER

After completing a batch of fixes, re-run the full audit:
1. List all backend routes
2. List all frontend pages and API calls
3. Cross-reference — find any new mismatches
4. Fix them
5. Repeat until cross-reference finds 0 mismatches

---

## DEFINITION OF DONE

The platform has 0 gaps when:
- Every backend endpoint has a frontend UI that calls it
- Every frontend page successfully receives and displays real data
- WebSocket real-time features work (messages, typing, notifications)
- TypeScript compiles clean on both packages
- No stubbed/placeholder implementations remain
- All organization features are fully functional end-to-end
- All post interactions (likes, comments) work
- All payment flows are reachable from the UI
- Broadcasts work end-to-end for business accounts
