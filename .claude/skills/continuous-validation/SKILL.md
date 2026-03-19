---
name: continuous-validation
description: "BRUTAL continuous validate-fix loop. Checks EVERYTHING: compilation, lint, build, banned patterns, test coverage (must be 100%), real integration tests against real infrastructure, stub/mock/fake detection, security rules, cross-references. Fixes issues and re-validates until perfection. No mercy."
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob, Agent"
---

# Continuous Validation & Fix Loop — BRUTAL MODE

You are running in **automated continuous mode**. Your single purpose: **find every flaw and fix it**. This is not a gentle pass. This is a ruthless, exhaustive audit that treats the codebase like it's being submitted for a $100K hackathon judging panel tomorrow.

## READ THESE FIRST — EVERY TIME

Before doing ANYTHING, read these files to internalize the rules:

1. `CLAUDE.md` — the ABSOLUTE LAWS
2. `.claude/skills/hedera-social-dev/references/rules-and-standards.md` — coding standards
3. `.claude/rules/security.md` — security rules
4. `.claude/rules/git-conventions.md` — git conventions
5. `.claude/state/validation-log.md` — what previous iterations found (don't repeat work, don't miss what they missed)

## THE ABSOLUTE LAWS (burned into your memory)

These are **UNBREAKABLE**. If you find a SINGLE violation, it's a critical failure:

1. **NO MOCKING** — no `jest.fn()`, `jest.mock()`, `jest.spyOn()`, no `sinon`, no `proxyquire`, no test doubles, no stubs, no fakes, no fixtures, no recorded responses, no snapshot testing as a substitute for real calls
2. **NO `any` TYPE** — not `: any`, not `as any`, not `<any>`, not `Record<string, any>`, not `Promise<any>`, not `Array<any>`, not `any[]` — use `unknown`, specific types, or generics
3. **NO `console.log`** — use NestJS `Logger` in backend, remove in frontend. Exception: CLI scripts (setup-testnet.ts, seed.ts)
4. **NO `@ts-ignore`** — fix the type error properly
5. **NO `setTimeout`/`setInterval`** in production code — use proper async patterns
6. **NO hardcoded secrets, keys, URLs, Hedera IDs** — everything from ConfigService/env
7. **NO generic `throw new Error()`** — use typed exception classes that extend BaseException
8. **NO empty catch blocks** — handle or rethrow with typed exception
9. **NO `require()`** — use ES module `import`
10. **NO returning fake success** — if a function didn't actually run, it must throw

## PHASE 1: Infrastructure Check

Before running tests, ensure infrastructure is available:

```bash
# Check PostgreSQL
docker ps | grep postgres || docker compose -f docker-compose.test.yml up -d postgres

# Check Redis
docker ps | grep redis || docker compose -f docker-compose.test.yml up -d redis

# Check Hedera Testnet connectivity
curl -s https://testnet.mirrornode.hedera.com/api/v1/transactions?limit=1 | head -c 100
```

### Hedera Testnet Token Check

If tests fail due to insufficient HBAR:

```bash
# Check operator balance
OPERATOR_ID=$(grep HEDERA_OPERATOR_ID .env | cut -d= -f2)
curl -s "https://testnet.mirrornode.hedera.com/api/v1/accounts/${OPERATOR_ID}" | python3 -c "import sys,json; b=json.load(sys.stdin).get('balance',{}); print(f'Balance: {b.get(\"balance\",0)/1e8:.2f} HBAR')"
```

If balance is below 100 HBAR, go to the Hedera faucet:

```bash
# Request testnet HBAR from faucet
OPERATOR_ID=$(grep HEDERA_OPERATOR_ID .env | cut -d= -f2 | tr -d '"' | tr -d "'")
curl -s -X POST "https://faucet.hedera.com/api/v1/faucet" \
  -H "Content-Type: application/json" \
  -d "{\"address\": \"${OPERATOR_ID}\", \"network\": \"testnet\"}"
```

Wait 10 seconds, then verify the balance increased.

### Faucet Rate Limiting

The Hedera faucet has rate limits. If you get a 429 or "rate limit" response:
1. Wait 60 seconds and retry (up to 3 attempts)
2. If all 3 fail, log the blocker: `BLOCKER: Hedera faucet rate-limited, balance: X HBAR`
3. Continue with ALL non-Hedera tests — do NOT stop the entire run
4. The outer bash script will retry faucet on the next iteration

### Hedera Testnet Downtime

If Hedera mirror node or consensus node is unreachable:
1. Test connectivity: `curl -s --max-time 10 https://testnet.mirrornode.hedera.com/api/v1/transactions?limit=1`
2. If down, log: `BLOCKER: Hedera testnet unreachable`
3. Run ALL non-Hedera tests and validations (build, lint, coverage, patterns, security)
4. Do NOT mark VALIDATION_CLEAN — Hedera tests were not run
5. Do NOT fabricate Hedera test results — if they didn't run, they didn't pass

### Docker Container Recovery

If PostgreSQL or Redis is unreachable mid-session:
1. Try restarting: `docker compose -f docker-compose.test.yml restart postgres redis`
2. Wait 5 seconds, retry connection
3. If still down: `docker compose -f docker-compose.test.yml down && docker compose -f docker-compose.test.yml up -d`
4. Wait 10 seconds, retry
5. If still down after restart, log: `BLOCKER: PostgreSQL/Redis unreachable after restart`

### pnpm / npm Rate Limiting

If `pnpm install` fails with 429 or network errors:
1. Wait 30 seconds and retry
2. If it fails again, try: `pnpm install --prefer-offline`
3. If still failing, log: `BLOCKER: npm registry unreachable` and proceed with what's already installed

### General Error Recovery

For ANY unexpected error during a phase:
1. Log the exact error message
2. Do NOT silently continue — acknowledge the failure in the validation log
3. Move to the next phase if possible (a lint failure shouldn't block security scanning)
4. At the end, mark ISSUES_REMAINING with specific details
5. NEVER mark VALIDATION_CLEAN if any phase was skipped or errored

## PHASE 2: Build Pipeline (must ALL pass — zero tolerance)

Run in this order. Fix every single error before moving to the next step.

```
1. pnpm install --frozen-lockfile || pnpm install
2. pnpm type-check          → fix EVERY TypeScript error
3. pnpm lint                 → fix EVERY lint warning and error
4. pnpm build                → must succeed with zero warnings
```

For EACH failure:
- Read the full error message
- Open the source file
- Fix the root cause (not a workaround)
- Re-run the same command to verify the fix
- Do NOT move to the next step until current step passes

## PHASE 3: Banned Pattern Deep Scan (Source Code)

Scan these directories: `apps/web/src/`, `packages/api/src/`, `packages/shared/src/`, `packages/crypto/src/`
Exclude: `node_modules/`, `.next/`, `dist/`, `*.d.ts`

### 3A: The No-Mock Sweep (ABSOLUTE LAW)

This is the most critical check. Search for ANY form of mocking, stubbing, or faking:

```bash
# Direct jest mocking
grep -rn 'jest\.fn\|jest\.mock\|jest\.spyOn\|jest\.genMock\|jest\.createMock' --include='*.ts' --include='*.tsx' apps/ packages/

# Other mocking libraries
grep -rn 'sinon\.\|proxyquire\|testdouble\|td\.\|nock\(\|nock\.cleanAll\|MockFactory\|createMock\|mockImplementation\|mockReturnValue\|mockResolvedValue\|mockRejectedValue' --include='*.ts' --include='*.tsx' apps/ packages/

# Stub/fake patterns in code
grep -rn 'stub\(\|\.stub\|fake[A-Z]\|Fake[A-Z]\|Mock[A-Z].*=\|mock[A-Z].*=\|\.returns\(\|\.resolves\(\|\.rejects\(' --include='*.ts' --include='*.tsx' apps/ packages/

# Test doubles / fixture files
find apps/ packages/ -name '*mock*' -o -name '*stub*' -o -name '*fake*' -o -name '*fixture*' -o -name '__mocks__' | grep -v node_modules | grep -v '.next'

# In-memory fakes of real services (e.g., fake database, fake Redis, fake Hedera)
grep -rn 'InMemory\|FakeHedera\|FakeRedis\|FakeDb\|MockDb\|TestDb\|StubService\|class.*Fake\|class.*Stub\|class.*Mock' --include='*.ts' apps/ packages/

# Functions that return hardcoded success without doing real work
grep -rn 'return.*{ success: true\|return.*{ ok: true\|return.*{ status.*200' --include='*.ts' apps/ packages/ | grep -v 'node_modules'
```

**Every single hit is a violation.** Fix it or delete it. No exceptions.

### 3B: Type Safety Sweep

```bash
# Any type (broad word-boundary search — catches ALL forms)
grep -rPn '\bany\b' --include='*.ts' --include='*.tsx' apps/ packages/ | grep -v node_modules | grep -v '.next' | grep -v dist | grep -v '\.d\.ts'

# @ts-ignore / @ts-expect-error
grep -rn '@ts-ignore\|@ts-nocheck\|@ts-expect-error' --include='*.ts' --include='*.tsx' apps/ packages/

# Generic Error throws (must use typed exceptions)
grep -rn 'throw new Error(' --include='*.ts' --include='*.tsx' apps/ packages/ | grep -v node_modules | grep -v '.next'

# Empty catch blocks
grep -rPzn 'catch\s*\([^)]*\)\s*\{\s*\}' --include='*.ts' apps/ packages/
```

### 3C: Hardcoding Sweep

```bash
# Hardcoded Hedera account IDs (0.0.XXXX with 4+ digits)
grep -rPn "'0\.0\.\d{4,}'|\"0\.0\.\d{4,}\"" --include='*.ts' --include='*.tsx' apps/ packages/ | grep -v node_modules | grep -v '.spec.ts' | grep -v '.test.ts' | grep -v 'example\|placeholder'

# Hardcoded URLs
grep -rn "http://\|https://" --include='*.ts' --include='*.tsx' apps/ packages/ | grep -v node_modules | grep -v '.next' | grep -v '.spec.ts' | grep -v 'localhost\|127.0.0.1\|example.com'

# Hardcoded API keys or tokens
grep -rPn "['\"](sk_|pk_|api_|key_|token_|secret_)[a-zA-Z0-9]+" --include='*.ts' apps/ packages/ | grep -v node_modules
```

### 3D: Console/Logging Sweep

```bash
# console.* in production code (NOT test files, NOT CLI scripts)
grep -rn 'console\.\(log\|warn\|error\|debug\|info\|trace\)' --include='*.ts' --include='*.tsx' apps/ packages/ | grep -v node_modules | grep -v '.next' | grep -v '.spec.ts' | grep -v '.test.ts' | grep -v 'setup-testnet\|seed'
```

### 3E: require() instead of import

```bash
grep -rn "require(" --include='*.ts' --include='*.tsx' apps/ packages/ | grep -v node_modules | grep -v '.next' | grep -v 'jest.config'
```

## PHASE 4: Test Coverage Audit — TARGET: 100%

This is where the real work happens. Tests MUST be REAL.

### 4A: Check Current Coverage

```bash
pnpm test -- --coverage --coverageReporters=text 2>&1
```

Read the coverage table. For EVERY file below 100% line coverage:

1. Open the source file — understand what it does
2. Open the test file (or create one if it doesn't exist)
3. Write tests that cover the UNCOVERED LINES
4. Tests MUST hit real infrastructure:
   - Database queries → real PostgreSQL (use docker-compose.test.yml)
   - Cache operations → real Redis
   - Hedera operations → real Testnet
   - HTTP endpoints → real supertest against running NestJS app
   - Encryption → real Web Crypto API / tweetnacl calls
   - WebSocket → real Socket.io connection

### 4B: Test Quality Audit

Coverage percentage alone is meaningless if tests are garbage. For every test file:

```bash
# Find all test files
find apps/ packages/ -name '*.spec.ts' -o -name '*.test.ts' | grep -v node_modules
```

For EACH test file, verify:

1. **No mocking** — if you see jest.fn(), jest.mock(), jest.spyOn(), sinon, or any mock → DELETE THE TEST AND REWRITE IT with real calls
2. **Actually tests behavior** — not just "expect(true).toBe(true)" or testing that a function was called. Tests must verify REAL outputs from REAL inputs
3. **Tests error paths** — not just happy paths. What happens when Hedera fails? When DB is down? When input is invalid?
4. **Uses real data** — not hardcoded fixture objects. Create real entities in the database, make real API calls, verify real responses
5. **Cleans up after itself** — tests that create Hedera topics or DB records should clean up (or use test-scoped data that doesn't pollute)

### 4C: Missing Test Detection

For every service, controller, guard, gateway, and utility:

```bash
# Find all source files that should have tests
find packages/api/src -name '*.service.ts' -o -name '*.controller.ts' -o -name '*.guard.ts' -o -name '*.gateway.ts' | sort

# Find all test files
find packages/api/src -name '*.spec.ts' -o -name '*.test.ts' | sort

# Same for packages/crypto, packages/shared
```

If a source file has NO corresponding test file → create one. Every service, controller, guard, and gateway needs a test file with real integration tests.

### 4D: Write Missing Tests

When writing new tests, follow this exact pattern:

```typescript
// CORRECT — real integration test
describe('AuthService (integration)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let dataSource: DataSource;

  beforeAll(async () => {
    // Start REAL NestJS app with REAL database
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    authService = moduleRef.get(AuthService);
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  it('should register a real user in the real database', async () => {
    const result = await authService.register({
      email: `test-${Date.now()}@example.com`,
      password: 'SecureP@ss123!',
      displayName: 'Test User',
    });

    // Verify in REAL database
    const dbUser = await dataSource.getRepository(UserEntity).findOne({
      where: { id: result.userId },
    });

    expect(dbUser).toBeDefined();
    expect(dbUser.email).toBe(result.email);
  });
});
```

```typescript
// WRONG — this violates ABSOLUTE LAW
const mockRepo = { findOne: jest.fn().mockResolvedValue({ id: '123' }) };  // BANNED
jest.mock('../users.repository');  // BANNED
const spy = jest.spyOn(service, 'validate');  // BANNED
```

## PHASE 5: Banned Pattern Scan (Task Documents)

Scan `tasks/` and `docs/` for violations in code blocks within markdown.
Exclude: S01/S06 "wrong example" sections (marked ❌), Definition of Done checklists, English prose.

```bash
# any type in code blocks
grep -rPn 'Record<string,\s*any>|Promise<any|: any\b|as any\b' tasks/ --include='*.md' | grep -v 'S01\|S06\|Definition of Done\|❌\|Wrong\|wrong\|NEVER\|never\|BANNED\|Avoid'

# Wrong package scope
grep -rn '@social-platform/' tasks/ docs/ --include='*.md'

# Stale doc references
grep -rn 'SUBMISSION_SUMMARY' tasks/ docs/ --include='*.md'
```

## PHASE 6: Cross-Reference Integrity

```bash
# All task IDs in INDEX.md have corresponding files
diff <(grep -oP 'T\d{2}' tasks/INDEX.md | sort -u) <(ls tasks/phase-*/P*-T*.md | grep -oP 'T\d{2}' | sort -u)

# All env vars in code are in .env.example
comm -23 <(grep -rhoP 'process\.env\.([A-Z_]+)' tasks/ apps/ packages/ --include='*.ts' --include='*.md' 2>/dev/null | sed 's/process\.env\.//' | sort -u) <(grep -oP '^[A-Z_]+=' .env.example | sed 's/=//' | sort -u)

# Package naming consistency
grep -rn '@social-platform/' tasks/ docs/ apps/ packages/ --include='*.ts' --include='*.md' | grep -v node_modules
```

## PHASE 7: Security Rules Enforcement

Read `.claude/rules/security.md` and verify:

```bash
# Secrets in source code
grep -rPn '(password|secret|apiKey|privateKey|token)\s*[:=]\s*["\x27][^"\x27]{8,}' --include='*.ts' apps/ packages/ | grep -v node_modules | grep -v '.env' | grep -v 'example\|placeholder\|CHANGE_ME\|test'

# CORS set to wildcard
grep -rn "origin.*'\*'" --include='*.ts' apps/ packages/ | grep -v node_modules

# Missing maxTransactionFee on Hedera transactions
grep -rn 'new TopicCreateTransaction\|new TokenMintTransaction\|new TransferTransaction\|new TokenCreateTransaction\|new AccountCreateTransaction' --include='*.ts' packages/ | while read line; do
  file=$(echo "$line" | cut -d: -f1)
  linenum=$(echo "$line" | cut -d: -f2)
  # Check if maxTransactionFee is set within 10 lines
  if ! sed -n "$((linenum)),$(($linenum+10))p" "$file" | grep -q 'setMaxTransactionFee\|maxTransactionFee'; then
    echo "MISSING maxTransactionFee: $line"
  fi
done

# JWT secret minimum length
grep -rn 'JWT_SECRET\|jwtSecret' --include='*.ts' apps/ packages/ | grep -v node_modules
```

## PHASE 8: Final Re-Validation

After ALL fixes:

```bash
pnpm type-check && echo "TSC: PASS" || echo "TSC: FAIL"
pnpm lint && echo "LINT: PASS" || echo "LINT: FAIL"
pnpm build && echo "BUILD: PASS" || echo "BUILD: FAIL"
pnpm test -- --coverage && echo "TESTS: PASS" || echo "TESTS: FAIL"
```

ALL FOUR must pass. If any fail, go back and fix.

## Validation Log

After EVERY iteration, append to `.claude/state/validation-log.md`:

```markdown
## Run: [timestamp] — Iteration [N]

### Infrastructure
- PostgreSQL: UP/DOWN
- Redis: UP/DOWN
- Hedera Testnet: UP/DOWN (balance: X HBAR)

### Build Pipeline
- pnpm install: PASS/FAIL
- pnpm type-check: PASS/FAIL ([N] errors)
- pnpm lint: PASS/FAIL ([N] errors)
- pnpm build: PASS/FAIL

### Banned Patterns (source code)
- Mocking violations: [count]
- any type violations: [count]
- console.log violations: [count]
- @ts-ignore violations: [count]
- Hardcoded secrets: [count]
- Generic Error throws: [count]
- Empty catch blocks: [count]

### Test Coverage
- Overall: [X]%
- Files below 100%: [list]
- Mock-contaminated tests found and rewritten: [count]
- New test files created: [count]

### Document Scan
- Task doc violations: [count]
- Cross-reference errors: [count]
- Package naming errors: [count]

### Security
- Hardcoded secrets: [count]
- Missing maxTransactionFee: [count]
- CORS wildcard: [count]

### Issues Fixed This Iteration: [total count]
### Issues Remaining: [total count]

### Result: VALIDATION_CLEAN / ISSUES_REMAINING / MANUAL_REVIEW_NEEDED
```

## When to Write VALIDATION_CLEAN

ONLY when ALL of these are true:
- pnpm type-check: 0 errors
- pnpm lint: 0 errors, 0 warnings
- pnpm build: succeeds
- pnpm test: all pass
- Test coverage: 100% (or documented reason why a file can't be tested, e.g., BLOCKED: awaiting API docs)
- Banned pattern scan: 0 violations in source code
- Document scan: 0 violations in task files
- Cross-references: all valid
- Security scan: 0 violations
- ZERO mocking/stubbing/faking anywhere in the entire codebase

If you can't achieve all of these, mark ISSUES_REMAINING with specific details of what's left.
