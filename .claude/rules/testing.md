---
paths:
  - "**/*.spec.ts"
  - "**/*.test.ts"
  - "**/*.e2e-spec.ts"
  - "**/test/**"
  - "**/tests/**"
---

# Testing Rules — REAL CALLS ONLY

## UNBREAKABLE RULE

**NO MOCKING. NO STUBS. NO FAKES. NO JEST.FN(). NO JEST.MOCK(). NO JEST.SPYON().**

This is absolute. There are no exceptions. Every test runs against real infrastructure:
- Real PostgreSQL (Docker container or local instance)
- Real Redis (Docker container or local instance)
- Real Hedera Testnet (real operator account, real transactions)
- Real HTTP endpoints (supertest against running NestJS app)
- Real WebSocket connections (socket.io-client against running gateway)
- Real encryption (Web Crypto API, real keys, real ciphertext)

All external services now have verified documentation (Tamam MPC Custody, HTS Payments via Tamam MPC Custody, Mirsad AI KYC/AML). All integrations should be tested against real API endpoints.

## Test Infrastructure Setup

Every test suite that needs infrastructure must set it up for real:

### Database Tests
```typescript
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Connect to REAL test database — no mocking
beforeAll(async () => {
  const module = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ envFilePath: '.env.test' }),
      TypeOrmModule.forRoot({
        type: 'postgres',
        host: process.env.TEST_DB_HOST || 'localhost',
        port: parseInt(process.env.TEST_DB_PORT || '5433'),
        username: process.env.TEST_DB_USER || 'test',
        password: process.env.TEST_DB_PASSWORD || 'test',
        database: process.env.TEST_DB_NAME || 'hedera_social_test',
        entities: [/* real entities */],
        synchronize: true, // OK for test DB only
      }),
    ],
  }).compile();

  app = module.createNestApplication();
  await app.init();
});

afterAll(async () => {
  await app.close();
});

// Each test uses a transaction that rolls back
beforeEach(async () => {
  queryRunner = dataSource.createQueryRunner();
  await queryRunner.startTransaction();
});

afterEach(async () => {
  await queryRunner.rollbackTransaction();
  await queryRunner.release();
});
```

### Hedera Testnet Tests
```typescript
import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction } from '@hashgraph/sdk';

let client: Client;

beforeAll(() => {
  // REAL testnet client — no mocking
  client = Client.forTestnet();
  client.setOperator(
    process.env.HEDERA_OPERATOR_ID!,
    process.env.HEDERA_OPERATOR_KEY!,
  );
});

it('should create a real HCS topic on testnet', async () => {
  const tx = new TopicCreateTransaction()
    .setTopicMemo('test-topic')
    .setMaxTransactionFee(new Hbar(2));

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  // Real topic ID from real testnet
  expect(receipt.topicId).toBeDefined();
  expect(receipt.topicId!.toString()).toMatch(/^0\.0\.\d+$/);
}, 30000); // 30s timeout for real network calls

it('should submit a real message to HCS topic', async () => {
  const submitTx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(JSON.stringify({
      version: '1.0',
      type: 'text',
      content: 'real test message',
      timestamp: Date.now(),
    }));

  const response = await submitTx.execute(client);
  const receipt = await response.getReceipt(client);

  expect(receipt.status.toString()).toBe('SUCCESS');
}, 30000);
```

### Redis Tests
```typescript
import { Redis } from 'ioredis';

let redis: Redis;

beforeAll(() => {
  // REAL Redis connection — no mocking
  redis = new Redis({
    host: process.env.TEST_REDIS_HOST || 'localhost',
    port: parseInt(process.env.TEST_REDIS_PORT || '6380'),
  });
});

afterAll(async () => {
  await redis.flushdb(); // Clean test data
  await redis.quit();
});
```

### HTTP API Tests
```typescript
import * as request from 'supertest';

// REAL HTTP calls to running NestJS app — no mocking
it('should register a new user', async () => {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/register')
    .send({
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'SecureP@ss123',
    })
    .expect(201);

  expect(response.body.success).toBe(true);
  expect(response.body.data.userId).toBeDefined();

  // Verify the user actually exists in the REAL database
  const user = await userRepository.findOne({
    where: { id: response.body.data.userId },
  });
  expect(user).not.toBeNull();
});
```

### WebSocket Tests
```typescript
import { io, Socket } from 'socket.io-client';

let socket: Socket;

beforeEach((done) => {
  // REAL WebSocket connection — no mocking
  socket = io(`http://localhost:${TEST_PORT}`, {
    auth: { token: validJwtToken },
    transports: ['websocket'],
  });
  socket.on('connect', done);
});

afterEach(() => {
  socket.disconnect();
});

it('should receive real-time message via WebSocket', (done) => {
  socket.on('new_message', (data) => {
    expect(data.conversationId).toBeDefined();
    expect(data.content).toBeDefined();
    done();
  });

  // Trigger a real message submission through the API
  request(app.getHttpServer())
    .post(`/api/v1/conversations/${conversationId}/messages`)
    .set('Authorization', `Bearer ${token}`)
    .send({ content: 'hello from test' });
});
```

## Test File Structure

```
packages/api/test/
  setup.ts                    # Bootstraps real DB, Redis, Hedera client
  teardown.ts                 # Shuts down all real services
  factories/
    user.factory.ts           # Creates REAL users in REAL database
    conversation.factory.ts   # Creates REAL HCS topics on REAL testnet
    message.factory.ts        # Submits REAL messages to REAL HCS topics

packages/api/src/auth/
  auth.service.spec.ts        # Tests with real DB + real Hedera
  auth.controller.spec.ts     # Tests with real HTTP via supertest

packages/crypto/src/
  encryption.spec.ts          # Tests with real Web Crypto API
  key-exchange.spec.ts        # Tests with real X25519 key pairs (nacl.box)
```

## Factory Functions (Create REAL Data)

```typescript
// test/factories/user.factory.ts
// Creates a REAL user in the REAL database
export async function createTestUser(
  userRepository: Repository<User>,
  overrides: Partial<CreateUserDto> = {},
): Promise<User> {
  const dto: CreateUserDto = {
    username: `testuser_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    email: `test_${Date.now()}@example.com`,
    password: await hashPassword('TestP@ss123'),
    ...overrides,
  };

  return userRepository.save(userRepository.create(dto));
}

// test/factories/conversation.factory.ts
// Creates a REAL HCS topic on the REAL testnet
export async function createTestConversation(
  client: Client,
  participants: string[],
): Promise<{ topicId: TopicId; conversationKey: CryptoKey }> {
  const conversationKey = await generateConversationKey();

  const tx = new TopicCreateTransaction()
    .setTopicMemo(`test-conversation-${Date.now()}`)
    .setMaxTransactionFee(new Hbar(2));

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    topicId: receipt.topicId!,
    conversationKey,
  };
}
```

## Test Patterns

### Arrange-Act-Assert (with REAL data)
```typescript
it('should find user by email in real database', async () => {
  // Arrange: create real user in real DB
  const user = await createTestUser(userRepository, {
    email: 'findme@test.com',
  });

  // Act: call real service method
  const found = await userService.findByEmail('findme@test.com');

  // Assert: verify real result
  expect(found).toBeDefined();
  expect(found!.id).toBe(user.id);
  expect(found!.email).toBe('findme@test.com');
});
```

### Test Error Paths (with REAL errors)
```typescript
it('should throw UserNotFoundException for non-existent user', async () => {
  // Act & Assert: real service, real database, real error
  await expect(
    userService.findByIdOrFail('non-existent-uuid'),
  ).rejects.toThrow(UserNotFoundException);
});

it('should throw HederaTransactionError on invalid topic', async () => {
  await expect(
    messageService.submitMessage('0.0.999999999', 'test'),
  ).rejects.toThrow(HederaTransactionError);
}, 30000);
```

### Test Database Constraints (REAL database)
```typescript
it('should enforce unique email constraint', async () => {
  await createTestUser(userRepository, { email: 'dupe@test.com' });

  await expect(
    createTestUser(userRepository, { email: 'dupe@test.com' }),
  ).rejects.toThrow(); // Real PostgreSQL unique violation
});
```

## Test Configuration

### jest.config.ts
```typescript
export default {
  // Longer timeouts for real network calls
  testTimeout: 30000,

  // Run tests serially — they share real infrastructure
  maxWorkers: 1,

  // Global setup: start Docker containers
  globalSetup: '<rootDir>/test/setup.ts',
  globalTeardown: '<rootDir>/test/teardown.ts',

  // Test environment
  testEnvironment: 'node',
};
```

### .env.test
```bash
# Real test database (Docker)
TEST_DB_HOST=localhost
TEST_DB_PORT=5433
TEST_DB_USER=test
TEST_DB_PASSWORD=test
TEST_DB_NAME=hedera_social_test

# Real test Redis (Docker)
TEST_REDIS_HOST=localhost
TEST_REDIS_PORT=6380

# Real Hedera Testnet
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=302e...
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

### docker-compose.test.yml
```yaml
version: '3.8'
services:
  test-db:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: hedera_social_test
    tmpfs:
      - /var/lib/postgresql/data  # RAM disk for speed

  test-redis:
    image: redis:7-alpine
    ports:
      - "6380:6379"
```

## Test Execution

```bash
# Start test infrastructure
docker compose -f docker-compose.test.yml up -d

# Wait for services to be ready
until pg_isready -h localhost -p 5433; do sleep 1; done

# Run all tests against REAL infrastructure
pnpm test

# Run with coverage
pnpm test -- --coverage

# Run specific module
pnpm test -- --testPathPattern="packages/api/src/auth"

# Stop test infrastructure
docker compose -f docker-compose.test.yml down
```

## Coverage Requirements

- **Minimum**: 80% for every module
- **Critical services** (auth, crypto, Hedera): 90%+
- **packages/crypto**: 100% — every encryption path must be verified with real crypto

## BANNED — Will Cause Immediate Rejection

```typescript
// ALL OF THESE ARE BANNED:
jest.fn()                    // NO
jest.mock()                  // NO
jest.spyOn()                 // NO
jest.createMockFromModule()  // NO
const mock = {} as Service;  // NO
const stub = { method: () => {} }; // NO
jest.fn<any, any>()          // NO
sinon.stub()                 // NO
td.function()                // NO (testdouble)
vi.fn()                      // NO (vitest)
```

If you see ANY of the above in a test file, the test is **invalid** and must be rewritten with real calls.
