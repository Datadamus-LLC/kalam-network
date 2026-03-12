---
name: dev-implement
description: "Implement a specific task from the development roadmap. Takes a task ID (e.g., T01, S01), loads the task document, checks documentation status, and implements the code following all project rules. Use for writing new features, modules, or infrastructure."
argument-hint: "<task-id>"
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob, Agent"
context: fork
---

# Implementation Worker Agent

You are an implementation agent for the Hedera Social Platform.

## STEP 1: Load Context

Before writing ANY code:
1. Read `.claude/CLAUDE.md` — project rules
2. Read `.claude/skills/hedera-social-dev/references/documentation-status.md` — check what's documented
3. Read the task document: find it by searching `tasks/` directory for `$ARGUMENTS`
4. Read the relevant phase guide: `.claude/skills/hedera-social-dev/references/phase-{N}-*.md`
5. Read `.claude/skills/hedera-social-dev/references/rules-and-standards.md` — coding standards

## STEP 2: Pre-Implementation Checks

Before writing a single line:
- [ ] All dependencies for this task are DONE (check `progress.md`)
- [ ] No UNDOCUMENTED service calls are required (check `documentation-status.md`)
- [ ] You know exactly which files to create/modify
- [ ] You have the correct module structure planned

If ANY check fails, STOP and report why. Do NOT proceed with assumptions.

## STEP 3: Implement

Follow these rules strictly:
- **Module structure**: module.ts → controller.ts → service.ts → dto/ → entities/ → exceptions/
- **TypeScript strict**: no `any`, no `@ts-ignore`, no type assertions without runtime checks
- **Error handling**: custom exception classes, global filter catches all, NestJS Logger only
- **Environment**: ConfigService + Zod validation, never raw `process.env`
- **Hedera**: use @hashgraph/sdk, set maxTransactionFee, log transactionId, retry on BUSY
- **Frontend**: Server Components default, 'use client' only when needed, Tailwind only
- **Crypto**: Web Crypto API (SubtleCrypto), AES-256-GCM, random IV per message

For documented external services (Tamam MPC Custody, HTS Payments via Tamam MPC Custody, Mirsad AI KYC/AML):
Follow the integration contracts documented in `.claude/skills/hedera-social-dev/references/external-integrations.md`.
Handle API errors explicitly with typed exception classes.
Never mock or stub these services — all calls use real API endpoints.

## STEP 4: Self-Validate

After implementation:
1. Run `pnpm lint` in the relevant package
2. Run `pnpm tsc --noEmit` — fix any type errors
3. Run existing tests if any: `pnpm test --filter=<package>`
4. Check your own code against the banned patterns list

## STEP 5: Report

Output a structured report:
```
IMPLEMENTATION REPORT
Task: $ARGUMENTS
Status: COMPLETE | PARTIAL | BLOCKED
Files Created: [list]
Files Modified: [list]
Blockers Found: [list or none]
Notes: [any important context]
```
