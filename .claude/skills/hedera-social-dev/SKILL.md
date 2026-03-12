---
name: hedera-social-dev
description: >
  Development guide for the Hedera blockchain-native social platform (hackathon project).
  Use this skill for ANY work on this codebase — writing features, reviewing code,
  debugging, setting up infrastructure, or making architectural decisions.
  Triggers on: hedera social, messaging, HCS, HTS, DID NFT, Tamam, Mirsad, wallet creation,
  conversation topic, payment widget, social feed, onboarding flow, KYC/AML,
  or any reference to this project's codebase. This skill enforces production-grade
  development with documented integrations.
---

# Hedera Social Platform — Development Skill

You are building a blockchain-native social platform where every user's Hedera wallet
IS their identity, every message is an HCS transaction, every payment is an HTS transfer.

This skill enforces production-grade engineering from day one. No mocking. No hardcoding.
No silent failures. No assumptions.

---

## RULE 0: Zero Assumptions

Before writing ANY code that calls an external service, check `references/documentation-status.md`.

- If the integration is marked **DOCUMENTED** → proceed using the documented API
- If the integration is marked **UNDOCUMENTED** → STOP. Do NOT write code. Instead:
  1. Tell the user: "I need the API documentation for [service] before I can implement this."
  2. Ask specifically what you need: endpoint URLs, auth method, request/response schemas
  3. Once the user provides documentation, update `references/documentation-status.md`
  4. THEN write the code

All external integrations are documented:
- Tamam MPC Custody (wallet key management)
- HTS Payments via Tamam MPC Custody (HTS token transfers)
- Mirsad AI KYC/AML (identity verification)
- Pinata IPFS (check — we may have public docs for this one)

The Hedera SDK (@hashgraph/sdk) is publicly documented. That is the ONE integration
you can code against without asking.

---

## RULE 1: No Silent Failures

Every operation must either succeed explicitly or fail explicitly. No swallowed errors.
No empty catch blocks. No ignored Promise rejections.

```typescript
// WRONG — silent failure
try {
  await hederaClient.submitMessage(topicId, payload);
} catch (e) {
  // do nothing
}

// WRONG — logs but caller never knows
try {
  await hederaClient.submitMessage(topicId, payload);
} catch (e) {
  console.log('failed');
}

// CORRECT — typed error, propagated, logged with context
try {
  const receipt = await hederaClient.submitMessage(topicId, payload);
  if (receipt.status !== Status.Success) {
    throw new HederaTransactionError(
      `HCS submit failed with status ${receipt.status}`,
      { topicId, status: receipt.status },
    );
  }
  return receipt;
} catch (error) {
  this.logger.error('HCS message submission failed', {
    topicId,
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  throw error; // propagate — let the caller decide what to do
}
```

Read `references/rules-and-standards.md` for the full error handling specification.

---

## RULE 2: No Hardcoding

Nothing environment-specific in code. Ever.

```typescript
// WRONG
const OPERATOR_ID = '0.0.4515613';
const API_URL = 'http://localhost:3001';

// CORRECT
const OPERATOR_ID = this.configService.getOrThrow<string>('HEDERA_OPERATOR_ID');
const API_URL = process.env.NEXT_PUBLIC_API_URL;
```

All configuration flows through validated environment variables.
Read `references/rules-and-standards.md` → "Environment & Configuration" section.

---

## RULE 3: No Workarounds

If something doesn't work, fix it properly. Don't:
- Add `// @ts-ignore` or `as any` to silence type errors
- Skip validation because "it works in testing"
- Use `setTimeout` to "wait for Hedera" instead of proper polling
- Return hardcoded data because the API isn't ready yet

If an external API isn't ready, the code should:
1. Define the interface/contract clearly
2. Throw `NotImplementedError('Awaiting [Service] API documentation')`
3. Log that the integration point is pending

---

## RULE 4: Production Structure From Day One

Every module follows the same structure. No shortcuts.

**Backend (NestJS) — every feature module has:**
- `*.module.ts` — NestJS module with imports/providers/exports
- `*.controller.ts` — REST endpoints with DTOs, guards, swagger
- `*.service.ts` — business logic, injected dependencies
- `*.entity.ts` — TypeORM entity (if DB access needed)
- `dto/*.dto.ts` — request/response DTOs with class-validator
- `*.spec.ts` — unit tests

**Frontend (Next.js) — every feature has:**
- `app/[route]/page.tsx` — page component
- `components/[feature]/*.tsx` — feature components
- `hooks/use[Feature].ts` — data fetching hooks
- `stores/[feature].store.ts` — Zustand store (if shared state)

Read `references/rules-and-standards.md` for naming conventions and patterns.

---

## How to Use This Skill

### Starting a new task

1. Read `references/documentation-status.md` — understand what you CAN and CANNOT implement
2. Read the relevant phase guide in `references/phase-[N]-*.md`
3. Check dependencies — are prerequisite tasks actually complete in the codebase?
4. Follow the coding rules in `references/rules-and-standards.md`

### When you hit an UNDOCUMENTED integration

STOP. Tell the user. Ask for documentation. This is not optional.

Example response:
> "This task requires calling the Tamam Custody API to generate an ECDSA keypair.
> I don't have documentation for this API. Could you provide:
> 1. The base URL and authentication method
> 2. The endpoint for key generation
> 3. The request/response JSON schema
> 4. Any SDK or client library available
>
> I'll implement the integration once I have these details."

### When reviewing code

Run through this checklist for every file:
- [ ] No `any` types (use `unknown` + type guards)
- [ ] No `console.log` (use NestJS Logger or structured logging)
- [ ] No hardcoded values (config from env)
- [ ] No empty catch blocks
- [ ] No `// TODO` without a linked task ID
- [ ] DTOs validate all inputs
- [ ] Errors have context (what operation, what input, what failed)
- [ ] Hedera transaction IDs are logged
- [ ] Sensitive data never in logs or error messages

---

## Reference Files

Read these as needed based on your current task:

| File | When to Read | Content |
|------|-------------|---------|
| `references/documentation-status.md` | **ALWAYS first** | What's documented vs. unknown |
| `references/rules-and-standards.md` | Before writing ANY code | Coding rules, patterns, naming |
| `references/hedera-integration.md` | Any Hedera SDK work | HCS, HTS, Mirror Node patterns |
| `references/external-integrations.md` | Tamam/Mirsad/Pinata work | Integration contracts & documentation |
| `references/architecture-overview.md` | Architecture questions | System design, data flow |
| `references/phase-0-setup.md` | Phase 0 tasks | Monorepo, infra, tooling |
| `references/phase-1-identity.md` | Phase 1 tasks | Auth, wallet, KYC, DID NFT |
| `references/phase-2-messaging.md` | Phase 2 tasks | Conversations, encryption, HCS |
| `references/phase-3-social.md` | Phase 3 tasks | Posts, follows, feed |
| `references/phase-4-payments.md` | Phase 4 tasks | In-chat payments, Tamam Rails |
| `references/phase-5-notifications.md` | Phase 5 tasks | Notification service, real-time |
| `references/phase-6-submission.md` | Phase 6 tasks | Demo, README, pitch, video |

---

## Project Structure

```
hedera-social/
├── apps/
│   └── web/                    # Next.js 14 (App Router)
├── packages/
│   ├── api/                    # NestJS backend
│   ├── shared/                 # TypeScript types, constants, utils
│   └── crypto/                 # AES-256-GCM encryption, key exchange
├── scripts/                    # Seed, setup, utilities
├── .github/                    # CI/CD workflows
├── docker-compose.yml          # Dev infrastructure
└── docker-compose.prod.yml     # Production build
```

---

## Technology Stack — What We KNOW

| Layer | Technology | Documentation Status |
|-------|-----------|---------------------|
| Blockchain | Hedera (@hashgraph/sdk) | **DOCUMENTED** — public SDK docs |
| Blockchain | HCS (Consensus Service) | **DOCUMENTED** — public SDK docs |
| Blockchain | HTS (Token Service) | **DOCUMENTED** — public SDK docs |
| Blockchain | Mirror Node REST API | **DOCUMENTED** — public API docs |
| Backend | NestJS | **DOCUMENTED** — public framework |
| Backend | TypeORM + PostgreSQL | **DOCUMENTED** — public |
| Backend | Redis + Socket.io | **DOCUMENTED** — public |
| Frontend | Next.js 14 + React 18 | **DOCUMENTED** — public |
| Frontend | Zustand + TanStack Query | **DOCUMENTED** — public |
| Frontend | Tailwind CSS | **DOCUMENTED** — public |
| Encryption | Web Crypto API (AES-256-GCM) | **DOCUMENTED** — W3C spec |
| Wallet MPC | Tamam MPC Custody | **DOCUMENTED** — tamam-backend-staging-776426377628.us-central1.run.app |
| Payments | HTS Payments via Tamam MPC Custody | **DOCUMENTED** — tamam-backend-staging-776426377628.us-central1.run.app |
| KYC/AML | Mirsad AI | **DOCUMENTED** — dashboard-api.olara.io |
| IPFS | Pinata | **DOCUMENTED** — public API docs |
