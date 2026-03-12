# Active Blockers

> **Last Updated**: 2026-03-12
> Orchestrator checks this before assigning work. User resolves blockers by providing docs/decisions.

## BLOCKING: Missing Documentation

_No active documentation blockers. All three original blockers have been resolved._

## BLOCKING: Dependencies

These are not documentation blockers — they resolve when prerequisite tasks complete.
Dependencies match INDEX.md "Depends On" column exactly.

| Blocked Task | Title | Waiting On | Auto-resolves When |
|---|---|---|---|
| T02 | Shared Types & Constants | T01 | T01 reaches DONE |
| T03 | Encryption Library | T02 | T02 reaches DONE |
| T04 | NestJS Backend Setup | T01 | T01 reaches DONE |
| T05 | Database Schema & Migrations | T04, T02 | All reach DONE |
| T06 | Hedera Service — Core SDK | T04 | T04 reaches DONE |
| T07 | Next.js Frontend Setup | T01 | T01 reaches DONE |
| T08 | Hedera Testnet Setup | T06 | T06 reaches DONE |
| T09 | Auth — Registration & OTP | T04, T05 | All reach DONE |
| T10 | Wallet Creation via Tamam Custody | T09, T06 | All reach DONE |
| T11 | KYC via Mirsad AI + DID NFT | T10, T08 | All reach DONE |
| T12 | Profile View & Update | T11 | T11 reaches DONE |
| T13 | Frontend Onboarding UI | T07, T09–T12 | All reach DONE |
| T14 | Create Conversation | T06, T03, T05 | All reach DONE |
| T15 | Send & Receive Messages | T14 | T14 reaches DONE |
| T16 | WebSocket Gateway | T15 | T15 reaches DONE |
| T17 | Frontend Chat UI | T13, T14–T16 | All reach DONE |
| T18 | Posts Service | T06, T05 | All reach DONE |
| T19 | Follow/Unfollow | T06, T08 | All reach DONE |
| T20 | Frontend Feed | T18, T19, T13 | All reach DONE |
| T21 | Payments Service | T06, T14 | All reach DONE |
| T22 | Frontend Payments | T21, T17 | All reach DONE |
| T23 | Notification Service | T06, T16 | All reach DONE |
| T24 | Frontend Notifications | T23, T13 | All reach DONE |
| T29 | Org Tenancy & RBAC | T05, T09, T11 | All reach DONE |
| T30 | Verified Business Badges | T29, T11, T07 | All reach DONE |
| T31 | Enhanced Payment Requests | T21, T14, T22 | All reach DONE |
| T32 | Transaction History | T21, T29, T31 | All reach DONE |
| T25 | Demo Seed Data | All code incl. Phase 7 | All reach DONE |
| T26 | GitHub README | All code | All reach DONE |
| T27 | Pitch Deck | Working demo | Working demo ready |
| T28 | Demo Video | T25, T27 | All reach DONE |

## Supplementary Task Dependencies

| Blocked Task | Title | Waiting On |
|---|---|---|
| S01 | Code Quality & Linting | T01 |
| S02 | Testing Infrastructure | T04, T07 |
| S03 | CI/CD Pipeline | S01, S02 |
| S04 | Error Handling & Logging | T04, T02 |
| S05 | Env Validation & Docker | T04, T07 |

## Assumptions Audit

All 18 assumptions from the architecture audit have been resolved. See `assumptions-resolved.md` for full details.

**Status**: ✅ All resolved — no open assumptions blocking implementation.

## Resolved Blockers

| ID | Resolved Date | Resolution |
|---|---|---|
| BLOCKER-001 | 2026-03-11 | User provided olara-mobile-app project (custody codebase + OpenAPI spec + docs). Full MPC Custody API documented. Reference: `.claude/skills/hedera-social-dev/references/custody-integration.md` |
| BLOCKER-002 | 2026-03-11 | User clarified: payment rails are NOT an external integration. The Tamam Consortium manages stablecoins — our platform will simply USE the stablecoins they create (standard HTS token transfers). No external API integration needed. |
| BLOCKER-003 | 2026-03-11 | User provided Mirsad AI KYC/AML documentation (3 docs: API guide, payload structure, callback docs). Service formerly called "Mirsad" is actually "Mirsad AI". Reference: `.claude/skills/hedera-social-dev/references/mirsad-ai-integration.md` |
