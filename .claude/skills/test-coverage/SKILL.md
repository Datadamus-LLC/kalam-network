# Test Coverage Expansion — Add Real Tests for All Features

## Purpose

Write REAL integration tests for all platform features — existing and newly built. Tests connect to real PostgreSQL, real Redis, real Hedera testnet. No mocking, no faking, no simulating. Every test creates real data, makes real API calls, and verifies real results.

## ABSOLUTE RULES (from CLAUDE.md)

- **NEVER** use jest.fn(), jest.mock(), jest.spyOn() or ANY mocking
- **NEVER** use `any` type or `@ts-ignore`
- **NEVER** use console.log — NestJS Logger ONLY
- **NEVER** create fake/stub implementations
- **NEVER** use recorded fixtures or snapshot testing
- **NEVER** delete existing tests that pass — only ADD or FIX
- Tests use REAL services: PostgreSQL, Redis, Hedera testnet

---

## CRITICAL: NO DELETING TESTS

**You are EXPANDING coverage, not reducing it.** Specifically:

1. **NEVER delete a passing test** to improve pass rate — that's cheating
2. **NEVER skip a test** with `.skip` or `xit` unless you document WHY and create a task to fix it
3. **NEVER weaken assertions** (e.g., changing `toBe(200)` to `toBeDefined()`)
4. **NEVER remove test files** that contain passing tests
5. If a test is flaky, FIX the flakiness — don't delete the test
6. You MAY fix a test that has WRONG assertions (testing the wrong thing)

---

## PHASE 1: Audit Current Coverage

1. Read `.claude/state/qa-report.md` — understand what's been E2E tested
2. Read `.claude/state/gap-analysis.md` — understand what features exist
3. List all existing test files:
   ```bash
   find packages/api/src -name "*.test.ts" -o -name "*.spec.ts" | sort
   ```
4. Run current tests and note pass/fail:
   ```bash
   cd packages/api && pnpm test 2>&1 | tail -30
   ```

## PHASE 2: Identify Coverage Gaps

For each module in `packages/api/src/modules/`, check:

1. Does a test file exist? If not → create one
2. Does the test cover ALL service methods? If not → add tests
3. Does the test cover error paths? If not → add tests
4. Does the test cover edge cases? If not → add tests

### Coverage Requirements Per Module

Each module should have tests for:

- **Happy path**: Normal successful operation
- **Validation**: Missing required fields, wrong types, boundary values
- **Auth**: Unauthenticated access, wrong user, expired token
- **Not found**: Accessing non-existent resources
- **Conflict**: Duplicate creation, concurrent modification
- **Integration**: Hedera operations (if applicable)
- **Relationships**: Cross-module dependencies

## PHASE 3: Write Tests

### Test File Structure

```typescript
// packages/api/src/modules/{module}/{module}.integration.test.ts

import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { DataSource } from 'typeorm';

describe('{Module} Integration Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Apply same pipes, guards, etc. as main.ts
    await app.init();
    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/{endpoint}', () => {
    it('should create resource with valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/{endpoint}')
        .set('Authorization', `Bearer ${token}`)
        .send({ /* valid data */ });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');

      // Verify in database
      const record = await dataSource.query(
        'SELECT * FROM table_name WHERE id = $1',
        [response.body.data.id]
      );
      expect(record).toHaveLength(1);
    });

    it('should reject without authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/{endpoint}')
        .send({ /* data */ });

      expect(response.status).toBe(401);
    });

    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/{endpoint}')
        .set('Authorization', `Bearer ${token}`)
        .send({}); // Empty body

      expect(response.status).toBe(400);
    });
  });
});
```

### Test Helpers

Create reusable test helpers (NOT mocks):

```typescript
// test/helpers/auth.helper.ts
export async function registerAndLogin(app: INestApplication): Promise<{
  token: string;
  userId: string;
}> {
  // Register a real user
  const registerRes = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      email: `test-${Date.now()}@example.com`,
      password: 'TestPass123!',
      displayName: 'Test User',
    });

  // Login to get token
  const loginRes = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({
      email: registerRes.body.data.email,
      password: 'TestPass123!',
    });

  return {
    token: loginRes.body.data.accessToken,
    userId: loginRes.body.data.userId,
  };
}
```

### Hedera Test Patterns

For tests that involve Hedera (SLOW — mark them clearly):

```typescript
describe('Hedera Integration (SLOW)', () => {
  // These tests hit Hedera testnet — expect 5-15 second response times
  jest.setTimeout(60000);

  it('should create HCS topic on Hedera testnet', async () => {
    // This creates a REAL topic on Hedera testnet
    const response = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Authorization', `Bearer ${token}`)
      .send({ participantIds: [otherUserId] });

    expect(response.status).toBe(201);
    expect(response.body.data.topicId).toMatch(/^0\.0\.\d+$/);

    // Verify on mirror node
    const mirrorRes = await fetch(
      `https://testnet.mirrornode.hedera.com/api/v1/topics/${response.body.data.topicId}`
    );
    expect(mirrorRes.ok).toBe(true);
  });
});
```

## PHASE 4: Build & Run

```bash
# Build everything
cd packages/shared && pnpm build && cd ../..
cd packages/api && pnpm build && cd ../..

# Run ALL tests
cd packages/api && pnpm test 2>&1

# Check for regressions
# ZERO previously-passing tests should now fail
```

## PHASE 5: Report

Write results to `.claude/state/test-coverage-report.md`:

```markdown
# Test Coverage Report — [timestamp]

## Summary
- Test files: X (Y new)
- Test suites: X passing, Y failing
- Individual tests: X passing, Y failing
- New tests added: Z
- Regressions: 0 (MUST be 0)

## Coverage By Module

### auth
- Tests: X passing, Y failing
- Covers: registration, login, refresh, logout, guards
- Missing: [anything not covered]

### messaging
- Tests: X passing, Y failing
- Covers: create conversation, send message, history
- Missing: [anything not covered]

### [other modules...]

## New Test Files Created
- packages/api/src/modules/{module}/{module}.integration.test.ts — X tests

## Notes
- [Any flaky tests, timing issues, etc.]
```

If all modules have adequate coverage: write `COVERAGE ADEQUATE` at the top.

---

## ENVIRONMENT

- PostgreSQL: localhost:5433 (user: test, pass: test, db: hedera_social_test)
- Redis: localhost:6380
- Hedera credentials: .env
- Mirror node: https://testnet.mirrornode.hedera.com/api/v1/
