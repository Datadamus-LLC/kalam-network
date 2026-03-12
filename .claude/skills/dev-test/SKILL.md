---
name: dev-test
description: "Write and run REAL tests for a module. Spins up real infrastructure (PostgreSQL, Redis, Hedera Testnet), makes real calls, verifies real results. No mocking. No stubs. No fakes. Takes a path (e.g., packages/api/src/auth) or task ID."
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob"
---

# Test Agent — REAL Infrastructure, REAL Calls

You write and run tests for the Hedera Social Platform. **You NEVER mock anything.**

## ABSOLUTE RULE

**NO jest.fn(). NO jest.mock(). NO jest.spyOn(). NO stubs. NO fakes. NO recorded fixtures.**

Every test you write makes REAL calls to REAL services:
- Real PostgreSQL database (via docker-compose.test.yml)
- Real Redis instance (via docker-compose.test.yml)
- Real Hedera Testnet (real operator account, real transactions)
- Real HTTP endpoints (supertest against running NestJS app)
- Real WebSocket connections (socket.io-client against running gateway)
- Real AES-256-GCM encryption (Web Crypto API)

## BEFORE WRITING ANY TEST

1. Read `.claude/rules/testing.md` — the complete testing rules
2. Read the source code you're testing
3. Read `.claude/skills/hedera-social-dev/references/documentation-status.md`
4. If the module depends on UNDOCUMENTED services → skip those test cases with:
   ```typescript
   it.skip('should create MPC wallet — BLOCKED: awaiting Tamam Custody docs', () => {});
   ```

## STEP 1: Ensure Test Infrastructure is Running

```bash
# Start test containers
docker compose -f docker-compose.test.yml up -d

# Wait for PostgreSQL
until pg_isready -h localhost -p 5433 2>/dev/null; do sleep 1; done

# Wait for Redis
until redis-cli -h localhost -p 6380 ping 2>/dev/null; do sleep 1; done

echo "Test infrastructure ready"
```

## STEP 2: Analyze the Module

For the target module at `$ARGUMENTS`:
1. Read all source files
2. Identify every public method
3. Identify external dependencies (database, Redis, Hedera, HTTP)
4. For each dependency: confirm it's DOCUMENTED or BLOCKED

## STEP 3: Write Test Files

For each service/controller:
1. Create test file next to the source file (e.g., `auth.service.spec.ts`)
2. Import the REAL module using NestJS Test.createTestingModule
3. Connect to REAL database, REAL Redis, REAL Hedera
4. Write factory functions that create REAL data
5. Use transaction rollback for database cleanup between tests
6. Test BOTH success and error paths

### Test Structure Pattern

```typescript
describe('AuthService', () => {
  let service: AuthService;
  let database: Database;
  let redis: RedisClient;

  beforeAll(async () => {
    // Start real infrastructure
    database = await connectToTestDatabase();
    redis = createRedisClient();
  });

  beforeEach(async () => {
    // Start transaction for isolation
    await database.startTransaction();
  });

  afterEach(async () => {
    // Rollback cleans up test data
    await database.rollback();
  });

  afterAll(async () => {
    // Shutdown connections
    await database.disconnect();
    await redis.disconnect();
  });

  it('should create user with valid credentials', async () => {
    // Arrange — create real test data
    const dto = createTestUserDTO();

    // Act — call real service method
    const user = await service.createUser(dto);

    // Assert — verify real database state
    const savedUser = await database.query('SELECT * FROM users WHERE id = $1', [user.id]);
    expect(savedUser).toBeDefined();
    expect(savedUser.email).toBe(dto.email);
  });

  it('should throw ValidationError for invalid email', async () => {
    const dto = createTestUserDTO({ email: 'not-an-email' });

    await expect(service.createUser(dto))
      .rejects.toThrow(ValidationError);
  });
});
```

## STEP 4: Run Tests

```bash
# Run tests for the specific module
pnpm test -- --testPathPattern="$ARGUMENTS" --verbose --coverage

# If tests fail, read the output carefully and fix the test or the code
```

## STEP 5: Verify Coverage

- Minimum 80% for the module
- 90%+ for auth, crypto, Hedera services
- 100% for packages/crypto
- Report uncovered lines specifically

## WHAT TO TEST

For each public method, test:
1. **Happy path** — correct input produces correct output (verified in real DB/chain)
2. **Validation errors** — bad input throws typed exception
3. **Not found** — missing entity throws specific NotFoundException
4. **Authorization** — unauthorized access throws UnauthorizedException
5. **Hedera failures** — network errors throw HederaTransactionError
6. **Database constraints** — duplicate entries throw ConflictException
7. **Concurrent access** — race conditions handled correctly
8. **Transaction rollback** — failed operations don't leave partial state

## BANNED PATTERNS — IMMEDIATE REJECTION

If you write ANY of these, the test is invalid:

```typescript
jest.fn()                    // BANNED — no mocking
jest.mock()                  // BANNED — no mocking
jest.spyOn()                 // BANNED — no spying
const mock = {} as Service;  // BANNED — no fake objects
const stub = { method: () => {} }; // BANNED — no stubs
sinon.stub()                 // BANNED — no sinon
nock()                       // BANNED — no HTTP mocks
jest.isolateModulesAsync()   // BANNED — no module isolation
vi.mock()                    // BANNED — no vitest mocks
```

## REAL HEDERA TESTNET TESTING

When testing Hedera services:

```typescript
it('should create topic on Hedera Testnet', async () => {
  const service = new HederaConsensusService();

  // Act — create REAL topic on Hedera Testnet
  const topicId = await service.createTopic({
    memo: 'Test topic from integration tests'
  });

  // Assert — topic exists on chain
  expect(topicId).toMatch(/^0\.0\.\d+$/); // Valid Hedera topic format

  // Verify on-chain (optional, but recommended)
  const topicInfo = await service.getTopicInfo(topicId);
  expect(topicInfo.topicMemo).toBe('Test topic from integration tests');
});
```

## REAL DATABASE TESTING

When testing database operations:

```typescript
it('should save and retrieve user from real PostgreSQL', async () => {
  // Arrange
  const user = {
    id: generateUUID(),
    email: 'test@example.com',
    publicKey: 'ed25519...',
    createdAt: new Date()
  };

  // Act
  await userRepository.create(user);

  // Assert — query the real database
  const retrieved = await userRepository.findById(user.id);
  expect(retrieved).toEqual(user);
});
```

## REAL REDIS TESTING

When testing Redis caching:

```typescript
it('should cache and retrieve from real Redis', async () => {
  const key = 'user:123:profile';
  const value = { name: 'Alice', role: 'user' };

  // Act — set in real Redis
  await redis.set(key, JSON.stringify(value), 'EX', 3600);

  // Assert — retrieve from real Redis
  const cached = JSON.parse(await redis.get(key));
  expect(cached).toEqual(value);
});
```

## ERROR PATH TESTING

Test error conditions against REAL infrastructure:

```typescript
it('should throw ConflictException for duplicate email', async () => {
  const dto = { email: 'alice@example.com', password: 'test123' };

  // Create first user (succeeds)
  await service.createUser(dto);

  // Attempt to create duplicate (fails on real PostgreSQL)
  await expect(service.createUser(dto))
    .rejects.toThrow(ConflictException);
});
```

## REPORT

After running all tests, provide:

```
TEST REPORT — $ARGUMENTS
═══════════════════════════════════════════════
Module: [path]
Tests Written: [count]
Tests Passing: [count]
Tests Failing: [count] — [details]
Tests Skipped: [count] — [reasons for undocumented services]
Coverage: [percentage]
Untested Paths: [specific gaps]

Infrastructure Used:
- PostgreSQL: [version, database name]
- Redis: [version, port]
- Hedera Testnet: [operator account, network]

Key Findings:
- [any critical issues or blockers]
```
