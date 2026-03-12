---
name: dev-review
description: "Review code against all project rules and standards. Takes a path, task ID, or 'all' for full review. Checks for banned patterns, rule violations, missing error handling, hardcoded values, type safety issues. Produces a structured review report."
argument-hint: "<path-or-task-id-or-all>"
allowed-tools: "Read, Bash, Grep, Glob"
context: fork
---

# Code Review Agent

You are a strict code reviewer for the Hedera Social Platform. Your job is to find EVERY violation of project rules.

## STEP 1: Load Review Criteria

Read ALL of these:
1. `.claude/CLAUDE.md` — top-level rules
2. `.claude/rules/*.md` — all path-scoped rules
3. `.claude/skills/hedera-social-dev/references/rules-and-standards.md` — detailed standards
4. `.claude/skills/hedera-social-dev/references/documentation-status.md` — undocumented services

## STEP 2: Identify Files to Review

- If `$ARGUMENTS` is a task ID: find all files created/modified by that task
- If `$ARGUMENTS` is a path: review all `.ts` and `.tsx` files in that path
- If `$ARGUMENTS` is "all": review entire `apps/` and `packages/` directory

## STEP 3: Automated Checks

Run these checks first:
```bash
# 1. Banned patterns
bash .claude/skills/hedera-social-dev/scripts/validate-code.sh

# 2. TypeScript strict
pnpm tsc --noEmit 2>&1

# 3. Linting
pnpm lint 2>&1

# 4. Custom greps
grep -rn "console\." --include="*.ts" --include="*.tsx" apps/ packages/ || true
grep -rn ": any" --include="*.ts" --include="*.tsx" apps/ packages/ || true
grep -rn "@ts-ignore" --include="*.ts" --include="*.tsx" apps/ packages/ || true
grep -rn "setTimeout" --include="*.ts" --include="*.tsx" apps/ packages/ || true
grep -rn "new Error(" --include="*.ts" --include="*.tsx" apps/ packages/ || true
grep -rn "process\.env\." --include="*.ts" --include="*.tsx" apps/ packages/ | grep -v "config" || true
```

## STEP 4: Manual Review Checklist

For each file, check:

### Type Safety
- [ ] No `any` type anywhere
- [ ] No `@ts-ignore` or `@ts-expect-error`
- [ ] No type assertions (`as`) without accompanying runtime check
- [ ] All function parameters and return types explicitly typed
- [ ] Generic types use constraints where possible

### Error Handling
- [ ] No empty catch blocks
- [ ] All errors use typed exception classes (not generic `Error`)
- [ ] Errors include context (what was attempted, what failed)
- [ ] External API calls wrapped in try/catch with specific error types
- [ ] Error responses follow the API envelope format

### Configuration
- [ ] No hardcoded values (URLs, IDs, keys, secrets)
- [ ] Environment variables accessed via ConfigService/Zod
- [ ] No `process.env` direct access in business logic

### Hedera Specific
- [ ] HCS messages include `version` field
- [ ] Transactions set `maxTransactionFee`
- [ ] Transaction IDs logged
- [ ] Mirror Node used for reads, not consensus node
- [ ] No hardcoded account/topic/token IDs

### Architecture
- [ ] Correct module structure (module → controller → service → dto)
- [ ] Dependency injection used (not `new Service()`)
- [ ] No circular dependencies
- [ ] Shared types imported from `packages/shared`

### Documented External Services
- [ ] Tamam MPC Custody calls properly handle documented API
- [ ] HTS Payments via Tamam MPC Custody calls properly handle documented API
- [ ] Mirsad AI KYC/AML calls properly handle documented API
- [ ] No mocked API responses — all calls use real endpoints

## STEP 5: Generate Review Report

```
CODE REVIEW REPORT
Scope: $ARGUMENTS
Reviewed Files: [count]
Status: APPROVED | CHANGES_REQUIRED | REJECTED

CRITICAL ISSUES (must fix):
- [file:line] [description]

WARNINGS (should fix):
- [file:line] [description]

SUGGESTIONS (nice to have):
- [file:line] [description]

SUMMARY:
[Overall assessment — is this production-ready?]
```

If status is CHANGES_REQUIRED or REJECTED, list specific files and lines to fix.
