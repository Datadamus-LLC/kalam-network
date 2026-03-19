# Auto-Fix — Autonomous Bug Investigation & Resolution

## Purpose

Autonomously investigate failing QA tests, trace root causes through the codebase, implement fixes, and verify they work. No human in the loop — you run the full cycle: **diagnose → fix → build → test → verify**.

## ABSOLUTE RULES (from CLAUDE.md)

- NEVER use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- NEVER use `any` type or `@ts-ignore`
- NEVER use console.log — NestJS Logger ONLY
- NEVER hardcode config — use env vars via ConfigService
- NEVER throw generic Error — use typed exception classes
- NEVER use setTimeout for async — use proper async/await
- All config from validated env vars
- Every error typed, logged, propagated
- Follow NestJS module structure

## CRITICAL: NO DESTRUCTIVE FIXES

**Fixing means FIXING, not DELETING.** You must NEVER:

1. **Delete a controller endpoint** to make a test pass
2. **Remove a service method** because it's hard to fix
3. **Delete test files or skip tests** to improve pass rate
4. **Remove features or functionality** — only fix or enhance them
5. **Weaken assertions** (e.g., changing `toBe(200)` to `toBeDefined()`)
6. **Comment out code** that "isn't needed" — if it's there, it was built for a reason

**You ARE allowed to:**

1. Add new endpoints, services, or methods if needed to fix a bug
2. Add new test files or test cases
3. Refactor code to fix issues (as long as existing behavior is preserved)
4. Add missing module registrations, imports, or dependency injection
5. Implement missing functionality that a test expects but doesn't exist yet

---

## PHASE 1: Understand Current State

1. **Read the QA report**: `.claude/state/qa-report.md`
2. **Read previous fix reports**: `.claude/state/auto-fix-report.md` (if exists)
3. **Read blockers**: `.claude/state/blockers.md` (if exists)
4. **Categorize failures** into:
   - **FIXABLE**: Bugs in our code (wrong logic, missing endpoints, bad config)
   - **NEEDS INVESTIGATION**: External dependencies returning errors — DO NOT skip these, investigate the real API
   - **INFRA**: Docker, network, Hedera balance issues — fix the infrastructure
5. **DO NOT SKIP BUGS. Skipping is not a solution.** If a test fails, INVESTIGATE WHY. If an external service returns an error, read that service's source code to understand the real API.
6. **Only mark as truly BLOCKED** if: (a) you have thoroughly investigated the root cause, (b) the fix requires credentials/access you don't have, AND (c) you've documented exactly what credentials/access are needed and what the fix would be once they're available.

---

## PHASE 2: Deep Investigation (THE CRITICAL PHASE)

For EACH fixable bug, do a **full code path trace**. Do NOT guess — read every file in the chain:

### Investigation Checklist

1. **Read the failing test expectation** — what exactly was expected vs actual?
2. **Trace the HTTP route**: controller → service → repository/external call
3. **Read the controller method** — is the route registered? Correct HTTP method? Guards?
4. **Read the service method** — does the business logic match what the test expects?
5. **Read the entity/DTO** — are the types and validations correct?
6. **Check imports and module registration** — is the service injected? Module imported?
7. **Check the actual external call** — if it calls Hedera/Custody/KYC, trace that too:
   - What method is being called on which service?
   - Is the signing/auth correct?
   - Is the request format matching what the external API expects?
8. **Check env vars** — are the config values loaded? Are they the right ones?
9. **Look for mismatches between layers**:
   - Controller expects format A, service returns format B
   - Service calls methodX but should call methodY
   - Operator key used where user key needed (custody signing flow)
   - Timestamps in wrong format, fields in wrong order

### Common Root Cause Patterns

- **INVALID_SIGNATURE**: Wrong key signing. Check if operator key vs user MPC key vs custody service
- **404 Not Found**: Route not registered, or wrong path in controller decorator
- **401 Unauthorized**: Missing @UseGuards(JwtAuthGuard), or JWT not being sent
- **Wrong status code**: Missing @HttpCode decorator (NestJS defaults POST to 201)
- **Empty results**: Query searching wrong column, or filter too restrictive
- **Validation errors**: Missing/wrong class-validator decorators on DTO
- **Connection refused**: Service not configured, env var missing or wrong name
- **Timeout**: External service unreachable, or forgot `await`

### Cross-Repo Investigation (MANDATORY for external service bugs)

If a bug involves an external service (Tamam Custody, Mirsad KYC), you MUST:

1. **Read our integration service** — how we call them (request format, endpoint paths, auth headers)
2. **Read the reference docs** in `.claude/skills/hedera-social-dev/references/`
3. **Read the REAL backend source code** — this is the authoritative source of truth:
   - **Tamam Custody backend**: `../olara-mobile-app/packages/backend/src/`
     - Routes: `../olara-mobile-app/packages/backend/src/routes/custody.routes.ts`
     - HMAC signing: `../olara-mobile-app/packages/backend/src/middleware/request-signing.middleware.ts`
     - Services: `../olara-mobile-app/packages/backend/src/services/custody.service.ts`
     - Schemas: Zod schemas at the top of the routes file define exact request/response formats
   - **Mirsad KYC backend**: `../olara-mobile-app/packages/backend/src/routes/kyc.routes.ts` (if exists)
4. **Compare our request format with what the server ACTUALLY expects** — read the Zod schemas in the routes file
5. **Compare our endpoint paths with what the server ACTUALLY serves** — read the route registrations
6. **ACT ON YOUR FINDINGS** — rewrite our integration code to match the real API. Do not just report the mismatch.

**The `olara-mobile-app` folder is the single source of truth for all custody API behavior.**
When our integration docs say one thing and the source code says another, the SOURCE CODE wins.

---

## PHASE 3: Implement Fixes

For EACH bug, after investigation:

1. **Write the fix** — smallest change that correctly addresses the root cause
2. **Follow all CLAUDE.md rules** — no shortcuts, no workarounds
3. **Create typed exceptions** if needed (in the module's `exceptions/` folder)
4. **Add proper logging** using NestJS Logger
5. **Update DTOs** if validation changes are needed
6. **Register new entities/modules** in the appropriate module's imports

### Fix Priority Order

1. **Architecture fixes first** — wrong service being called, missing dependency injection
2. **Logic fixes** — wrong business logic, missing validation
3. **Format fixes** — wrong response format, wrong status code
4. **Config fixes** — wrong env var name, missing config registration

---

## PHASE 4: Build & Validate

After implementing ALL fixes:

```bash
# 1. Build shared package first (other packages depend on it)
cd packages/shared && pnpm build && cd ../..

# 2. Build API
cd packages/api && pnpm build && cd ../..

# 3. Lint
pnpm lint

# 4. Run existing tests (must not regress)
pnpm test
```

If build fails:
- Read the error carefully
- Fix TypeScript errors (wrong types, missing imports, incompatible signatures)
- Rebuild and verify

If lint fails:
- Fix linting errors (unused imports, formatting)
- Re-lint and verify

If tests fail:
- Check if failures are from YOUR changes (regression) or pre-existing
- Fix regressions immediately
- Pre-existing failures are noted but not your fault

---

## PHASE 5: Smoke Test

Start the real application and verify each fix with actual HTTP calls:

```bash
# Start the app (in background)
cd packages/api && pnpm start:dev &
APP_PID=$!
sleep 10

# Run smoke tests against localhost:3333
# ... (specific tests per bug)

# Stop the app
kill $APP_PID
```

For each bug, make the actual HTTP request and verify the response matches expectations.

If smoke test fails:
- The fix didn't work — go back to Phase 2 and re-investigate
- Often the issue is deeper than initially thought
- Read MORE code, not less

---

## PHASE 6: Report

Write comprehensive results to `.claude/state/auto-fix-report.md`:

```markdown
# Auto-Fix Report — [timestamp]

## Summary
- Bugs investigated: X
- Bugs fixed: Y
- Bugs still broken: Z
- Bugs blocked: W
- Build: PASS/FAIL
- Lint: PASS/FAIL
- Tests: X passing, Y failing

## Bug Details

### BUG-XXX: [title]
- **Status**: FIXED / STILL BROKEN / BLOCKED
- **Root Cause**: [detailed explanation of what was actually wrong]
- **Investigation Path**: [which files were traced, what was found]
- **Fix**: [what was changed and why]
- **Files Modified**: [list]
- **Verification**: [how it was confirmed working]

### BUG-YYY: ...
```

If ALL fixable bugs are resolved: write `ALL BUGS RESOLVED` at the top.
If some remain: write `REMAINING BUGS: BUG-XXX, BUG-YYY` with details on what's blocking.

---

## ITERATION AWARENESS

If this is NOT the first iteration:
1. Read `.claude/state/auto-fix-report.md` FIRST
2. Focus on bugs marked STILL BROKEN
3. Try a DIFFERENT approach — if the last fix didn't work, the root cause analysis was wrong
4. Dig DEEPER — read more code, trace further into the call chain
5. Check if the previous fix introduced regressions

---

## ENVIRONMENT

- Test PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Test Redis: localhost:6380
- Hedera credentials: in .env file
- Tamam Custody staging: URL and credentials in .env (TAMAM_CUSTODY_*)
- Mirsad KYC: may not have env vars set — mark as BLOCKED if not configured
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/

## KEY FILES

- QA report: `.claude/state/qa-report.md`
- Project rules: `CLAUDE.md` (root)
- API source: `packages/api/src/`
- Hedera services: `packages/api/src/modules/hedera/`
- Custody integration: `packages/api/src/modules/integrations/tamam-custody/`
- KYC integration: `packages/api/src/modules/integrations/mirsad-kyc/`
- Integration docs: `.claude/skills/hedera-social-dev/references/`
