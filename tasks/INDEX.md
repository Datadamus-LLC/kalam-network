# Hedera Social Platform — Task Index

## How to Use These Documents

Each task is a self-contained work instruction. Read it top to bottom. Every command you need to run, every file you need to create, every test you need to pass — it's all in there.

**Before starting ANY task:**
1. **Read [S06 — Developer Guidelines](supplementary/S06-developer-guidelines.md) first** — mandatory for all developers
2. Check the "Depends On" section — those tasks MUST be complete first
3. Read the entire task document before writing any code
4. Set up your `.env` with the required variables listed in the task
5. Create a feature branch: `git checkout -b feat/<task-id>-<short-description>`

**When you finish a task:**
1. Go through the "Definition of Done" checklist — every box must be checked
2. Run the tests listed in "Verification Steps"
3. Run `pnpm validate` to check linting, formatting, and types
4. Commit with message: `feat(<scope>): <description>` (conventional commits)
5. Open PR using the template and wait for CI to pass

---

## ⚡ EXECUTION ORDER — Read This First

The tasks below are grouped by phase, but **supplementary tasks must be interleaved** at the right time. Here is the exact order:

### Day 1 — Foundation

| Order | Task | Title | Est. |
|-------|------|-------|------|
| 1 | [S06](supplementary/S06-developer-guidelines.md) | 📖 Developer Guidelines — **ALL DEVS READ THIS FIRST** | 1h |
| 2 | [P0-T01](phase-0-setup/P0-T01-monorepo-init.md) | Initialize Monorepo | 2h |
| 3 | [S01](supplementary/S01-code-quality-linting.md) | Code Quality — ESLint, Prettier, Husky, Commitlint | 2h |
| 4 | [P0-T02](phase-0-setup/P0-T02-shared-types.md) | Shared Types & Constants Package | 3h |
| 5 | [P0-T04](phase-0-setup/P0-T04-nestjs-backend.md) | NestJS Backend Setup | 3h |
| 6 | [S04](supplementary/S04-error-handling-logging.md) | Error Handling, Logging & API Standards | 3h |
| 7 | [S05](supplementary/S05-env-validation-docker.md) | Environment Validation & Docker Production | 2h |
| 8 | [P0-T07](phase-0-setup/P0-T07-nextjs-frontend.md) | Next.js Frontend Setup | 3h |

### Day 2 — Infrastructure + Testing

| Order | Task | Title | Est. |
|-------|------|-------|------|
| 9 | [P0-T03](phase-0-setup/P0-T03-crypto-library.md) | Encryption Library | 4h |
| 10 | [P0-T05](phase-0-setup/P0-T05-database-schema.md) | Database Schema & Migrations | 4h |
| 11 | [P0-T06](phase-0-setup/P0-T06-hedera-service.md) | Hedera Service — Core SDK (**most critical**) | 5h |
| 12 | [S02](supplementary/S02-testing-infrastructure.md) | Testing Infrastructure — Jest, Integration Tests, Factories | 3h |
| 13 | [S03](supplementary/S03-ci-cd-pipeline.md) | CI/CD Pipeline — GitHub Actions | 2h |
| 14 | [P0-T08](phase-0-setup/P0-T08-testnet-setup.md) | Hedera Testnet One-Time Setup | 2h |

### Days 3-5 — Identity

| Order | Task | Title | Est. |
|-------|------|-------|------|
| 15 | [P0-T09](phase-1-identity/P1-T09-auth-registration.md) | Auth — Registration & OTP | 4h |
| 16 | [P0-T10](phase-1-identity/P1-T10-wallet-creation.md) | Wallet Creation via Tamam Custody | 4h |
| 17 | [P0-T11](phase-1-identity/P1-T11-kyc-did-nft.md) | KYC via Mirsad AI + DID NFT Minting | 6h |
| 18 | [P0-T12](phase-1-identity/P1-T12-profile-crud.md) | Profile View & Update | 3h |
| 19 | [P0-T13](phase-1-identity/P1-T13-frontend-onboarding.md) | Frontend — Registration & Onboarding UI | 6h |

### Days 5-8 — Messaging

| Order | Task | Title | Est. |
|-------|------|-------|------|
| 20 | [P0-T14](phase-2-messaging/P0-T14-create-conversation.md) | Create Conversation (1:1 & Group) | 5h |
| 21 | [P0-T15](phase-2-messaging/P0-T15-send-receive-messages.md) | Send & Receive Messages | 6h |
| 22 | [P0-T16](phase-2-messaging/P0-T16-websocket-gateway.md) | WebSocket Gateway — Real-Time | 4h |
| 23 | [P0-T17](phase-2-messaging/P0-T17-frontend-chat.md) | Frontend — Chat UI | 8h |

### Days 8-10 — Social + Payments

| Order | Task | Title | Est. |
|-------|------|-------|------|
| 24 | [P1-T18](phase-3-social/P1-T18-posts-service.md) | Social Service — Posts | 4h |
| 25 | [P1-T19](phase-3-social/P1-T19-follow-unfollow.md) | Social Service — Follow/Unfollow | 3h |
| 26 | [P0-T21](phase-4-payments/P0-T21-payments-service.md) | Payments Service — Tamam Rails | 5h |
| 27 | [P1-T20](phase-3-social/P1-T20-frontend-feed.md) | Frontend — Feed & Social UI | 6h |
| 28 | [P0-T22](phase-4-payments/P0-T22-frontend-payments.md) | Frontend — Payment Widgets | 6h |

### Days 10-11 — Notifications + Polish

| Order | Task | Title | Est. |
|-------|------|-------|------|
| 29 | [P1-T23](phase-5-notifications/P1-T23-notification-service.md) | Notification Service | 4h |
| 30 | [P1-T24](phase-5-notifications/P1-T24-frontend-notifications.md) | Frontend — Notifications & Profile | 4h |

### Days 12-13 — Submission

| Order | Task | Title | Est. |
|-------|------|-------|------|
| 31 | [P0-T25](phase-6-submission/P0-T25-demo-seed-data.md) | Demo Data & Seed Script | 3h |
| 32 | [P0-T26](phase-6-submission/P0-T26-github-readme.md) | README & GitHub Repository | 2h |
| 33 | [P0-T27](phase-6-submission/P0-T27-pitch-deck.md) | Pitch Deck | 4h |
| 34 | [P0-T28](phase-6-submission/P0-T28-demo-video.md) | Demo Video Recording | 3h |

---

## Parallel Work Strategy (2-3 Developers)

With 2-3 devs, many tasks can run in parallel. Here's the suggested split:

**Dev A (Backend Lead):**
T01 → S01 → T04 → S04 → T05 → T06 → T08 → T09 → T10 → T11 → T14 → T15 → T16 → T21 → T23

**Dev B (Frontend Lead):**
S06 (read) → T07 → S05 → T02 → T03 → T13 → T17 → T20 → T22 → T24

**Dev C (Flex / QA / Submission):**
S06 (read) → S02 → S03 → T12 → T18 → T19 → T25 → T26 → T27 → T28

---

## Task Reference — By Phase

### Phase 0: Project Setup & Infrastructure

| Task | Title | Est. Hours | Depends On |
|------|-------|-----------|------------|
| [P0-T01](phase-0-setup/P0-T01-monorepo-init.md) | Initialize Monorepo | 2h | — |
| [P0-T02](phase-0-setup/P0-T02-shared-types.md) | Shared Types & Constants Package | 3h | T01 |
| [P0-T03](phase-0-setup/P0-T03-crypto-library.md) | Encryption Library | 4h | T02 |
| [P0-T04](phase-0-setup/P0-T04-nestjs-backend.md) | NestJS Backend Setup | 3h | T01 |
| [P0-T05](phase-0-setup/P0-T05-database-schema.md) | Database Schema & Migrations | 4h | T04, T02 |
| [P0-T06](phase-0-setup/P0-T06-hedera-service.md) | Hedera Service — Core SDK | 5h | T04 |
| [P0-T07](phase-0-setup/P0-T07-nextjs-frontend.md) | Next.js Frontend Setup | 3h | T01 |
| [P0-T08](phase-0-setup/P0-T08-testnet-setup.md) | Hedera Testnet One-Time Setup | 2h | T06 |

### Phase 1: Identity & Onboarding

| Task | Title | Est. Hours | Depends On |
|------|-------|-----------|------------|
| [P1-T09](phase-1-identity/P1-T09-auth-registration.md) | Auth — Registration & OTP | 4h | T04, T05 |
| [P1-T10](phase-1-identity/P1-T10-wallet-creation.md) | Wallet Creation via Tamam Custody | 4h | T09, T06 |
| [P1-T11](phase-1-identity/P1-T11-kyc-did-nft.md) | KYC via Mirsad AI + DID NFT Minting | 6h | T10, T08 |
| [P1-T12](phase-1-identity/P1-T12-profile-crud.md) | Profile View & Update | 3h | T11 |
| [P1-T13](phase-1-identity/P1-T13-frontend-onboarding.md) | Frontend — Registration & Onboarding UI | 6h | T07, T09-T12 |

### Phase 2: Messaging

| Task | Title | Est. Hours | Depends On |
|------|-------|-----------|------------|
| [P0-T14](phase-2-messaging/P0-T14-create-conversation.md) | Create Conversation (1:1 & Group) | 5h | T06, T03, T05 |
| [P0-T15](phase-2-messaging/P0-T15-send-receive-messages.md) | Send & Receive Messages | 6h | T14 |
| [P0-T16](phase-2-messaging/P0-T16-websocket-gateway.md) | WebSocket Gateway — Real-Time | 4h | T15 |
| [P0-T17](phase-2-messaging/P0-T17-frontend-chat.md) | Frontend — Chat UI | 8h | T13, T14-T16 |

### Phase 3: Social Feed

| Task | Title | Est. Hours | Depends On |
|------|-------|-----------|------------|
| [P1-T18](phase-3-social/P1-T18-posts-service.md) | Social Service — Posts | 4h | T06, T05 |
| [P1-T19](phase-3-social/P1-T19-follow-unfollow.md) | Social Service — Follow/Unfollow | 3h | T06, T08 |
| [P1-T20](phase-3-social/P1-T20-frontend-feed.md) | Frontend — Feed & Social UI | 6h | T18, T19, T13 |

### Phase 4: In-Chat Payments

| Task | Title | Est. Hours | Depends On |
|------|-------|-----------|------------|
| [P0-T21](phase-4-payments/P0-T21-payments-service.md) | Payments Service — Tamam Rails | 5h | T06, T14 |
| [P0-T22](phase-4-payments/P0-T22-frontend-payments.md) | Frontend — Payment Widgets | 6h | T21, T17 |

### Phase 5: Notifications & Polish

| Task | Title | Est. Hours | Depends On |
|------|-------|-----------|------------|
| [P1-T23](phase-5-notifications/P1-T23-notification-service.md) | Notification Service | 4h | T06, T16 |
| [P1-T24](phase-5-notifications/P1-T24-frontend-notifications.md) | Frontend — Notifications & Profile | 4h | T23, T13 |

### Phase 7: Business Features (parallel with Phases 5-6)

| Task | Title | Est. Hours | Depends On |
|------|-------|-----------|------------|
| [P1-T29](phase-7-business/P1-T29-org-tenancy-rbac.md) | Organization Tenancy & RBAC Backend | 8h | T05, T09, T11 |
| [P1-T30](phase-7-business/P1-T30-verified-badges.md) | Verified Business Badges | 4h | T29, T11, T07 |
| [P1-T31](phase-7-business/P1-T31-payment-requests.md) | Enhanced Payment Requests | 6h | T21, T14, T22 |
| [P1-T32](phase-7-business/P1-T32-transaction-history.md) | Transaction History & Tracking | 6h | T21, T29, T31 |

### Phase 6: Hackathon Submission

| Task | Title | Est. Hours | Depends On |
|------|-------|-----------|------------|
| [P0-T25](phase-6-submission/P0-T25-demo-seed-data.md) | Demo Data & Seed Script | 3h | All code incl. Phase 7 |
| [P0-T26](phase-6-submission/P0-T26-github-readme.md) | README & GitHub Repository | 2h | All code |
| [P0-T27](phase-6-submission/P0-T27-pitch-deck.md) | Pitch Deck | 4h | Working demo |
| [P0-T28](phase-6-submission/P0-T28-demo-video.md) | Demo Video Recording | 3h | T25, T27 |

### Supplementary: Engineering Standards

| Task | Title | Est. Hours | Depends On | When |
|------|-------|-----------|------------|------|
| [S01](supplementary/S01-code-quality-linting.md) | Code Quality — ESLint, Prettier, Husky | 2h | T01 | Immediately after monorepo |
| [S02](supplementary/S02-testing-infrastructure.md) | Testing Infrastructure — Jest, Integration Tests, Factories | 3h | T04, T07 | After backends exist |
| [S03](supplementary/S03-ci-cd-pipeline.md) | CI/CD — GitHub Actions | 2h | S01, S02 | After testing is set up |
| [S04](supplementary/S04-error-handling-logging.md) | Error Handling, Logging, API Standards | 3h | T04, T02 | Immediately after NestJS |
| [S05](supplementary/S05-env-validation-docker.md) | Env Validation & Docker Production | 2h | T04, T07 | After both apps scaffold |
| [S06](supplementary/S06-developer-guidelines.md) | Developer Guidelines & Code Review | 1h | — | **READ FIRST** |

---

**Total: 38 tasks · ~153 hours**

| Category | Tasks | Hours |
|----------|-------|-------|
| Feature Tasks (T01-T28) | 28 | 116h |
| Business Features (T29-T32) | 4 | 24h |
| Engineering Standards (S01-S06) | 6 | 13h |
| **Grand Total** | **38** | **~153h** |
