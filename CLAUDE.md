# Hedera Social Platform — Hello Future Apex Hackathon 2026

Blockchain social platform built on Hedera HCS (consensus) and HTS (identity NFTs) with custody and KYC integrations.

## Monorepo Structure

```
docs/                Architecture, Spec, PRD, Roadmap
tasks/               Implementation task documents
apps/
  web/               Next.js 14 App Router
packages/
  api/               NestJS backend
  shared/            TypeScript types
  crypto/            AES-256-GCM encryption
```

## ABSOLUTE LAW: No Mocking. No Faking. No Simulating.

**This rule is UNBREAKABLE and overrides everything else.**

- NEVER use `jest.fn()`, `jest.mock()`, `jest.spyOn()`, or any mocking library
- NEVER create fake/stub implementations of services, APIs, or databases
- NEVER simulate Hedera transactions — run them on TESTNET for real
- NEVER fake database queries — run them against a real PostgreSQL instance
- NEVER stub Redis, Socket.io, or any infrastructure — start real instances
- NEVER create "test doubles", "fixtures", or "recorded responses"
- Testing means: spin up real services, make real calls, verify real results
- If a service is UNDOCUMENTED, you CANNOT test it — skip it with a clear `// BLOCKED: awaiting API docs` comment

**What "testing" means in this project:**
- Start a real PostgreSQL database (Docker or local)
- Start a real Redis instance
- Connect to Hedera Testnet with a real operator account
- Create real HCS topics, submit real messages, mint real NFTs
- Make real HTTP calls to real API endpoints
- Verify real responses from real services

## Core Rules (5 Non-Negotiable)

1. **Zero Assumptions** — if docs don't exist, STOP and ask
2. **No Silent Failures** — every error typed, logged, propagated
3. **No Hardcoding** — all config from validated env vars
4. **No Workarounds** — no @ts-ignore, any, setTimeout hacks, no mocks, no stubs, no fakes
5. **Production Structure** — consistent module layout

## Services: Documented vs Undocumented

**DOCUMENTED**: Hedera HCS, Hedera HTS, Tamam MPC Custody, Mirsad AI KYC/AML, PostgreSQL, Redis, Socket.io, Pinata IPFS
**INTEGRATION REFS**: See `.claude/skills/hedera-social-dev/references/` for verified API docs (custody-integration.md, mirsad-ai-integration.md)

## Critical Commands

```bash
pnpm install           # Install all workspaces
pnpm build             # Build all packages
pnpm lint              # Run linter (required before commit)
pnpm test              # Run tests
pnpm dev               # Start dev servers
```

## Development Pipeline (Agent Orchestration)

Use these commands to run the full dev workflow:

```
/orchestrate              Auto-pick next tasks, implement → test → review → fix
/orchestrate T01          Full pipeline for a specific task
/orchestrate plan         Plan next batch of parallel work
/orchestrate status       Show progress, blockers, health
/orchestrate validate     Full validation: tsc + lint + test + build
```

Individual agent commands:
```
/dev-implement T01        Implement a task (checks rules + docs first)
/dev-test packages/api    Write and run tests for a module
/dev-review all           Review code against all project rules
/dev-fix <report>         Fix issues from review
/dev-plan                 Plan next sprint with parallel batches
/dev-status               Quick project health check
/dev-validate-all         Full validation pipeline
```

Scaffolding:
```
/new-module conversations   Scaffold NestJS module with standard structure
/new-component ChatWindow   Scaffold React component with types + error boundary
/check-docs tamam-custody   Check if service has documentation before coding
```

## State Tracking

- **Progress**: `.claude/state/progress.md` — task statuses and execution history
- **Blockers**: `.claude/state/blockers.md` — documentation gaps and dependency blocks
- **Doc status**: `.claude/skills/hedera-social-dev/references/documentation-status.md`

## Rules & Skills Reference

- **Path-scoped rules**: `.claude/rules/` — auto-load based on file being edited
- **Detailed guidance**: `/hedera-social-dev` skill — architecture, Hedera patterns, phase guides
- **Coding standards**: `.claude/skills/hedera-social-dev/references/rules-and-standards.md`

## BEFORE YOU CODE

- [ ] Check documentation status for external services
- [ ] Run `pnpm lint` before any commit
- [ ] No `console.log` — use NestJS Logger only
- [ ] No `any` types — use strict TypeScript
- [ ] Every error requires a typed exception class
- [ ] All config from env vars, never hardcoded
- [ ] No setTimeout, no mock implementations, no test-only code in production

## NEVER DO THIS (Banned Patterns)

1. Use `any` type or `@ts-ignore` comments
2. Call `console.log()` instead of NestJS Logger
3. Hardcode config values (API keys, URLs, secrets)
4. Throw generic `Error` or `new Error()` — create typed exceptions
5. Use `setTimeout` for async operations — use proper async/await
6. Import from undocumented services without verification
7. Store secrets in code, env files, or version control
8. Make API calls without error boundaries and type safety
9. Skip validation on external service responses
10. Commit without running `pnpm lint` and tests
11. Use `jest.fn()`, `jest.mock()`, `jest.spyOn()` or ANY mocking
12. Create stub/fake implementations of any service
13. Use recorded fixtures or snapshot testing as a substitute for real calls
14. Swallow errors in empty catch blocks
15. Return fake success from functions that haven't actually run
