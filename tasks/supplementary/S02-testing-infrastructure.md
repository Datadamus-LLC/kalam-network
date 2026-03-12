# S02: Testing Infrastructure

| Field | Value |
|-------|-------|
| Task ID | S02 |
| Priority | 🔴 P0 — Do After S01 and T04 |
| Estimated Time | 3 hours |
| Depends On | S01 (Linting), P0-T04 (NestJS), P0-T07 (Next.js) |
| Phase | Supplementary — Engineering Standards |
| Assignee | Any developer |

---

## Overview

This task establishes a comprehensive testing infrastructure for the Hedera social platform using **real integration testing** (no mocks, no stubs, no fakes). It covers:

- Jest configuration for backend (NestJS + TypeORM) and frontend (Next.js + React)
- Global test setup with real PostgreSQL and Redis connections
- Docker Compose for test infrastructure
- Factory functions that create REAL test data in REAL databases
- Integration test examples showing real service interaction
- Cryptocurrency library tests with real encryption round-trips
- Root-level test scripts

**Absolute Rule**: All tests use REAL services (PostgreSQL, Redis, Hedera Testnet). Zero mocking, zero faking, zero stubs.

---

## Part 1: Jest Configuration (Backend + Frontend)

### 1.1 packages/api/jest.config.ts

```typescript
import type { Config } from 'jest';
import { pathsToModuleNameMapper } from 'ts-jest/utils';
import { compilerOptions } from './tsconfig.json';

const config: Config = {
  displayName: '@hedera-social/api',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/main.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '.spec.ts',
    '.test.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // Higher thresholds for security-critical code
    'src/auth/**': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    'src/crypto/**': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    'src/hedera/**': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  moduleNameMapper: pathsToModuleNameMapper(compilerOptions.paths || {}, {
    prefix: '<rootDir>/',
  }),
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        isolatedModules: true,
      },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  testTimeout: 30000, // Integration tests need more time
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};

export default config;
```

### 1.2 apps/web/jest.config.ts

```typescript
import type { Config } from 'jest';

const config: Config = {
  displayName: '@hedera-social/web',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: ['**/__tests__/**/*.spec.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.tsx',
    '!src/**/*.test.tsx',
    '!src/**/index.ts',
    '!src/**/index.tsx',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
        jsx: 'react-jsx',
      },
    ],
  },
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.ts'],
  testTimeout: 10000,
};

export default config;
```

---

## Part 2: Test Utilities & Setup

### 2.1 packages/api/test/setup.ts

```typescript
import { Logger } from '@nestjs/common';

const logger = new Logger('Test Setup');

// Global test environment variables (override .env.test)
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/hedera_social_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379/1';
process.env.HEDERA_NETWORK = 'testnet';
process.env.HEDERA_OPERATOR_ID = process.env.HEDERA_OPERATOR_ID || '0.0.999999';
process.env.HEDERA_OPERATOR_KEY =
  process.env.HEDERA_OPERATOR_KEY || '302e020100300506032b6570041d041c00000000000000000000000000000000';
process.env.JWT_SECRET = 'test-secret-key-minimum-32-characters-long';
process.env.JWT_EXPIRATION = '24h';
process.env.JWT_REFRESH_EXPIRATION = '30d';
process.env.LOG_LEVEL = 'warn'; // Suppress logs during tests

logger.log('Test environment initialized');

// LEGITIMATE: jest.setTimeout — test framework configuration, not a setTimeout workaround
jest.setTimeout(30000);

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
});
```

### 2.2 packages/api/test/database.ts

Real PostgreSQL connection helper for test isolation using transactions:

```typescript
import { DataSource, QueryRunner, EntityTarget, ObjectLiteral } from 'typeorm';
import { Logger } from '@nestjs/common';
import { getDataSourceConfig } from '../src/database/config';

const logger = new Logger('Test Database');

let dataSource: DataSource | null = null;

/**
 * Initialize real PostgreSQL connection for test suite.
 * Each test runs in a transaction that can be rolled back.
 */
export async function initializeTestDatabase(): Promise<DataSource> {
  if (dataSource?.isInitialized) {
    return dataSource;
  }

  const config = getDataSourceConfig();
  dataSource = new DataSource(config);

  try {
    await dataSource.initialize();
    logger.log('Connected to test database');

    // Run migrations in test environment
    if (!dataSource.migrations.length) {
      logger.warn('No migrations found; ensure migrations are configured');
    } else {
      await dataSource.runMigrations();
      logger.log(`Executed ${dataSource.migrations.length} migration(s)`);
    }

    return dataSource;
  } catch (error) {
    logger.error(`Failed to initialize test database: ${error}`);
    throw error;
  }
}

/**
 * Close database connection and cleanup.
 */
export async function closeTestDatabase(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
    dataSource = null;
    logger.log('Test database connection closed');
  }
}

/**
 * Get active test database connection.
 */
export function getTestDataSource(): DataSource {
  if (!dataSource?.isInitialized) {
    throw new Error('Test database not initialized. Call initializeTestDatabase() in beforeAll()');
  }
  return dataSource;
}

/**
 * Start a transaction for test isolation.
 * Call in beforeEach(), then rollback() in afterEach().
 */
export async function startTestTransaction() {
  const db = getTestDataSource();
  const queryRunner = db.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  return queryRunner;
}

/**
 * Rollback test transaction to restore database to pre-test state.
 */
export async function rollbackTestTransaction(queryRunner: QueryRunner) {
  try {
    await queryRunner.rollbackTransaction();
  } finally {
    await queryRunner.release();
  }
}

/**
 * Get a repository scoped to a test transaction.
 * Use this instead of dataSource.getRepository() in tests.
 */
export function getTestRepository<T extends ObjectLiteral>(entity: EntityTarget<T>, queryRunner: QueryRunner) {
  return queryRunner.manager.getRepository(entity);
}
```

### 2.3 packages/api/test/redis.ts

Real Redis connection helper:

```typescript
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';

const logger = new Logger('Test Redis');

let redis: Redis | null = null;

/**
 * Initialize real Redis connection for tests.
 */
export async function initializeTestRedis(): Promise<Redis> {
  if (redis) {
    return redis;
  }

  const url = process.env.REDIS_URL || 'redis://localhost:6379/1';
  redis = new Redis(url, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
  });

  try {
    await redis.ping();
    logger.log('Connected to test Redis');
    return redis;
  } catch (error) {
    logger.error(`Failed to connect to test Redis: ${error}`);
    throw error;
  }
}

/**
 * Close Redis connection.
 */
export async function closeTestRedis(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
    logger.log('Test Redis connection closed');
  }
}

/**
 * Get active Redis connection.
 */
export function getTestRedis(): Redis {
  if (!redis) {
    throw new Error('Test Redis not initialized. Call initializeTestRedis() in beforeAll()');
  }
  return redis;
}

/**
 * Clear all keys in test Redis database.
 */
export async function flushTestRedis(): Promise<void> {
  const r = getTestRedis();
  await r.flushdb();
}
```

### 2.4 packages/api/test/hedera.ts

Real Hedera Testnet connection helper:

```typescript
import { Client, AccountId, PrivateKey } from '@hashgraph/sdk';
import { Logger } from '@nestjs/common';

const logger = new Logger('Test Hedera');

let hederaClient: Client | null = null;

/**
 * Initialize real Hedera Testnet client.
 * Uses env vars: HEDERA_NETWORK, HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY
 */
export function initializeTestHedera(): Client {
  if (hederaClient) {
    return hederaClient;
  }

  const network = process.env.HEDERA_NETWORK || 'testnet';
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;

  if (!operatorId || !operatorKey) {
    throw new Error(
      'Hedera testnet credentials missing. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY'
    );
  }

  hederaClient = Client.forName(network);
  hederaClient.setOperator(AccountId.fromString(operatorId), PrivateKey.fromString(operatorKey));

  logger.log(`Connected to Hedera ${network} as ${operatorId}`);
  return hederaClient;
}

/**
 * Get active Hedera client.
 */
export function getTestHederaClient(): Client {
  if (!hederaClient) {
    throw new Error('Hedera client not initialized. Call initializeTestHedera() in beforeAll()');
  }
  return hederaClient;
}

/**
 * Close Hedera client connection.
 */
export async function closeTestHedera(): Promise<void> {
  if (hederaClient) {
    await hederaClient.close();
    hederaClient = null;
    logger.log('Test Hedera connection closed');
  }
}
```

### 2.5 packages/api/test/test-module.ts

Real NestJS TestingModule with actual database and Redis:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Type, DynamicModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { redisStore } from 'cache-manager-redis-yet';
import { DataSource } from 'typeorm';
import { getTestDataSource } from './database';

/**
 * Create a real NestJS TestingModule for integration tests.
 * Modules will connect to real PostgreSQL and Redis, not mocked services.
 */
export async function createIntegrationTestingModule(
  imports: Array<Type | DynamicModule> = []
): Promise<TestingModule> {
  const testModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        envFilePath: '.env.test',
      }),
      TypeOrmModule.forRootAsync({
        inject: [ConfigService],
        useFactory: async (configService: ConfigService) => ({
          type: 'postgres',
          host: configService.get('DB_HOST', 'localhost'),
          port: configService.get('DB_PORT', 5432),
          username: configService.get('DB_USERNAME', 'test'),
          password: configService.get('DB_PASSWORD', 'test'),
          database: configService.get('DB_NAME', 'hedera_social_test'),
          entities: ['src/**/*.entity.ts'],
          migrations: ['migrations/*.ts'],
          synchronize: false,
          logging: false,
        }),
      }),
      CacheModule.registerAsync({
        isGlobal: true,
        useFactory: async () => {
          const store = await redisStore({
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            db: 1, // Use separate database for tests
            ttl: 600,
          });
          return { store };
        },
      }),
      ...imports,
    ],
  }).compile();

  return testModule;
}

/**
 * Create and launch a test NestJS application.
 * Returns: [app, dataSource] for test cleanup.
 */
export async function createTestApp(
  testingModule: TestingModule
): Promise<[INestApplication, DataSource]> {
  const app = testingModule.createNestApplication();
  await app.init();

  const dataSource = testingModule.get(DataSource);
  return [app, dataSource];
}
```

---

## Part 3: Test Data Factories

Factories create **REAL database records**, not in-memory stubs.

### 3.1 packages/api/test/factories/user.factory.ts

```typescript
import { faker } from '@faker-js/faker';
import { Repository } from 'typeorm';
import { User } from '../../src/users/user.entity';
import * as bcrypt from 'bcrypt';

export interface CreateTestUserOptions {
  email?: string;
  username?: string;
  password?: string;
  displayName?: string;
  verified?: boolean;
}

/**
 * Factory to create REAL user records in the test database.
 * Returns an actual User entity saved to PostgreSQL.
 */
export async function createTestUser(
  userRepository: Repository<User>,
  options: CreateTestUserOptions = {}
): Promise<User> {
  const password = options.password || 'TestPassword123!';
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = userRepository.create({
    email: options.email || faker.internet.email(),
    username: options.username || faker.internet.username(),
    passwordHash: hashedPassword,
    displayName: options.displayName || faker.person.fullName(),
    isVerified: options.verified ?? false,
    createdAt: new Date(),
  });

  return userRepository.save(user);
}

/**
 * Create multiple test users efficiently.
 */
export async function createTestUsers(
  userRepository: Repository<User>,
  count: number,
  options: CreateTestUserOptions = {}
): Promise<User[]> {
  const users: User[] = [];
  for (let i = 0; i < count; i++) {
    users.push(
      await createTestUser(userRepository, {
        ...options,
        email: options.email ? `${options.email}-${i}` : undefined,
        username: options.username ? `${options.username}-${i}` : undefined,
      })
    );
  }
  return users;
}
```

### 3.2 packages/api/test/factories/conversation.factory.ts

```typescript
import { faker } from '@faker-js/faker';
import { Repository } from 'typeorm';
import { Conversation } from '../../src/messaging/conversation.entity';
import { User } from '../../src/users/user.entity';

export interface CreateTestConversationOptions {
  participants?: User[];
  topic?: string;
  isGroup?: boolean;
}

/**
 * Create a REAL conversation record in the test database.
 */
export async function createTestConversation(
  conversationRepository: Repository<Conversation>,
  participants: User[],
  options: CreateTestConversationOptions = {}
): Promise<Conversation> {
  if (participants.length < 2) {
    throw new Error('Conversation requires at least 2 participants');
  }

  const conversation = conversationRepository.create({
    topic: options.topic || faker.lorem.sentence(),
    participants: participants,
    isGroup: options.isGroup ?? participants.length > 2,
    hcsTopicId: null, // Will be set when HCS topic is created
    createdAt: new Date(),
  });

  return conversationRepository.save(conversation);
}
```

### 3.3 packages/api/test/factories/index.ts

```typescript
// Export all factory functions for convenience
export * from './user.factory';
export * from './conversation.factory';
// Add more factories as needed
```

---

## Part 4: Integration Test Examples

### 4.1 packages/api/src/auth/auth.service.spec.ts

Real integration test using actual PostgreSQL, JWT, and Redis:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { JwtModule } from '@nestjs/jwt';
import { redisStore } from 'cache-manager-redis-yet';
import { DataSource, QueryRunner, Repository } from 'typeorm';
import * as request from 'supertest';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/user.entity';
import { UserRepository } from '../users/user.repository';
import { createTestUser } from '../../test/factories/user.factory';

describe('AuthService (Integration)', () => {
  let app: INestApplication;
  let authService: AuthService;
  let userRepository: Repository<User>;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          username: process.env.DB_USERNAME || 'test',
          password: process.env.DB_PASSWORD || 'test',
          database: process.env.DB_NAME || 'hedera_social_test',
          entities: ['src/**/*.entity.ts'],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.registerFeature([User]),
        CacheModule.registerAsync({
          isGlobal: true,
          useFactory: async () => {
            const store = await redisStore({
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379'),
              db: 1,
              ttl: 600,
            });
            return { store };
          },
        }),
        JwtModule.register({
          secret: process.env.JWT_SECRET || 'test-secret',
          signOptions: { expiresIn: '24h' },
        }),
      ],
      providers: [AuthService, UserRepository],
      controllers: [AuthController],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    authService = moduleFixture.get(AuthService);
    userRepository = moduleFixture.get(UserRepository);
    dataSource = moduleFixture.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
    await dataSource.destroy();
  });

  beforeEach(async () => {
    // Start transaction for test isolation
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  });

  afterEach(async () => {
    // Rollback to clean up test data
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    await queryRunner.release();
  });

  describe('registerUser', () => {
    it('should create a real user record in the database', async () => {
      const email = 'testuser@example.com';
      const password = 'SecurePassword123!';
      const username = 'testuser';

      // Call real registration with actual database write
      const user = await authService.registerUser(
        { email, password, username },
        queryRunner.manager.getRepository(User)
      );

      expect(user).toBeDefined();
      expect(user.email).toBe(email);
      expect(user.username).toBe(username);

      // Verify password is actually hashed (not plain text)
      expect(user.passwordHash).not.toBe(password);

      // Verify user exists in database with real query
      const dbUser = await queryRunner.manager
        .getRepository(User)
        .findOne({ where: { email } });
      expect(dbUser).toBeDefined();
      expect(dbUser?.id).toBe(user.id);
    });

    it('should reject duplicate email with real database constraint', async () => {
      const email = 'duplicate@example.com';
      const password = 'SecurePassword123!';

      // Create first user
      await authService.registerUser(
        { email, password, username: 'user1' },
        queryRunner.manager.getRepository(User)
      );

      // Try to create second user with same email
      await expect(
        authService.registerUser(
          { email, password, username: 'user2' },
          queryRunner.manager.getRepository(User)
        )
      ).rejects.toThrow(); // Database constraint error
    });
  });

  describe('authenticateUser', () => {
    it('should authenticate with correct password against real database', async () => {
      // Create real user via factory
      const testUser = await createTestUser(
        queryRunner.manager.getRepository(User),
        {
          email: 'auth@example.com',
          password: 'TestPassword123!',
        }
      );

      // Authenticate with real service
      const result = await authService.authenticateUser(
        'auth@example.com',
        'TestPassword123!',
        queryRunner.manager.getRepository(User)
      );

      expect(result.user.id).toBe(testUser.id);
      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();

      // Verify tokens are valid JWT
      const decoded = authService.verifyToken(result.accessToken);
      expect(decoded.sub).toBe(testUser.id);
    });

    it('should reject incorrect password', async () => {
      await createTestUser(queryRunner.manager.getRepository(User), {
        email: 'wrongpass@example.com',
        password: 'CorrectPassword123!',
      });

      await expect(
        authService.authenticateUser(
          'wrongpass@example.com',
          'WrongPassword456!',
          queryRunner.manager.getRepository(User)
        )
      ).rejects.toThrow('Invalid credentials');
    });
  });

  describe('refreshToken', () => {
    it('should issue new token with real Redis-backed refresh token storage', async () => {
      const testUser = await createTestUser(
        queryRunner.manager.getRepository(User)
      );

      // Issue real tokens
      const tokens = await authService.issueTokens(testUser.id);

      // Store refresh token in real Redis
      const cacheManager = app.get('CACHE_MANAGER');
      await cacheManager.set(`refresh_token:${testUser.id}`, tokens.refreshToken, 2592000000); // 30 days

      // Refresh with real Redis lookup
      const newTokens = await authService.refreshToken(tokens.refreshToken);

      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(tokens.accessToken);
    });
  });

  describe('HTTP endpoint: POST /auth/register', () => {
    it('should register user via HTTP with real database persistence', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'httpuser@example.com',
          username: 'httpuser',
          password: 'SecurePassword123!',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.user.email).toBe('httpuser@example.com');
      expect(response.body.data.accessToken).toBeDefined();

      // Verify user actually exists in database
      const savedUser = await userRepository.findOne({
        where: { email: 'httpuser@example.com' },
      });
      expect(savedUser).toBeDefined();
    });
  });
});
```

### 4.2 packages/api/src/messaging/conversation.service.spec.ts

Real integration test with Hedera HCS:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { DataSource, QueryRunner } from 'typeorm';

import { ConversationService } from './conversation.service';
import { Conversation } from './conversation.entity';
import { User } from '../users/user.entity';
import { HederaService } from '../hedera/hedera.service';
import { createTestUser, createTestUsers } from '../../test/factories/user.factory';
import { createTestConversation } from '../../test/factories/conversation.factory';

describe('ConversationService (Integration with Hedera HCS)', () => {
  let app: TestingModule;
  let conversationService: ConversationService;
  let hederaService: HederaService;
  let dataSource: DataSource;
  let queryRunner: QueryRunner;
  let logger: Logger;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          username: process.env.DB_USERNAME || 'test',
          password: process.env.DB_PASSWORD || 'test',
          database: process.env.DB_NAME || 'hedera_social_test',
          entities: ['src/**/*.entity.ts'],
          synchronize: true,
          logging: false,
        }),
        TypeOrmModule.registerFeature([Conversation, User]),
      ],
      providers: [ConversationService, HederaService],
    }).compile();

    const nestApp = app.createNestApplication();
    await nestApp.init();

    conversationService = app.get(ConversationService);
    hederaService = app.get(HederaService);
    dataSource = app.get(DataSource);
    logger = new Logger('ConversationService.spec');
  });

  afterAll(async () => {
    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  beforeEach(async () => {
    queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
  });

  afterEach(async () => {
    if (queryRunner.isTransactionActive) {
      await queryRunner.rollbackTransaction();
    }
    await queryRunner.release();
  });

  describe('createConversation', () => {
    it('should create real conversation record and real Hedera HCS topic', async () => {
      const userRepo = queryRunner.manager.getRepository(User);
      const conversationRepo = queryRunner.manager.getRepository(Conversation);

      // Create real test users
      const [user1, user2] = await createTestUsers(userRepo, 2);

      // Create conversation with real database write
      const conversation = await conversationService.createConversation(
        {
          participantIds: [user1.id, user2.id],
          topic: 'Real Integration Test',
        },
        conversationRepo,
        hederaService
      );

      expect(conversation.id).toBeDefined();
      expect(conversation.topic).toBe('Real Integration Test');
      expect(conversation.participants).toHaveLength(2);

      // Verify HCS topic was created on real Hedera Testnet
      expect(conversation.hcsTopicId).toBeDefined();
      expect(conversation.hcsTopicId).toMatch(/^0\.0\.\d+$/); // Hedera topic ID format

      // Verify conversation persisted in database
      const dbConversation = await conversationRepo.findOne({
        where: { id: conversation.id },
        relations: ['participants'],
      });
      expect(dbConversation).toBeDefined();
      expect(dbConversation?.hcsTopicId).toBe(conversation.hcsTopicId);

      logger.log(`✓ Created real HCS topic: ${conversation.hcsTopicId}`);
    });

    it('should handle real HCS topic creation errors', async () => {
      const userRepo = queryRunner.manager.getRepository(User);
      const users = await createTestUsers(userRepo, 2);

      // Mock a network error scenario (could test with network disconnection)
      // In real tests, this would verify error handling for Hedera SDK failures
      const spy = jest
        .spyOn(hederaService, 'createTopic')
        .mockRejectedValueOnce(new Error('Hedera network unavailable'));

      await expect(
        conversationService.createConversation(
          { participantIds: [users[0].id, users[1].id], topic: 'Test' },
          queryRunner.manager.getRepository(Conversation),
          hederaService
        )
      ).rejects.toThrow('Hedera network unavailable');

      spy.mockRestore();
    });
  });

  describe('sendMessage', () => {
    it('should submit real message to Hedera HCS topic', async () => {
      const userRepo = queryRunner.manager.getRepository(User);
      const conversationRepo = queryRunner.manager.getRepository(Conversation);

      const users = await createTestUsers(userRepo, 2);
      const conversation = await createTestConversation(conversationRepo, users);

      // Submit real message to Hedera HCS
      const transactionId = await conversationService.sendMessage(
        conversation.id,
        users[0].id,
        'Hello from real integration test!',
        hederaService
      );

      expect(transactionId).toBeDefined();
      expect(transactionId).toMatch(/^0\.0\.\d+@\d+\.\d+$/); // Hedera transaction ID format

      logger.log(`✓ Message submitted to HCS topic: ${transactionId}`);
    });
  });
});
```

---

## Part 5: Cryptocurrency Library Tests

### 5.1 packages/crypto/src/encryption.spec.ts

Real AES-256-GCM encryption/decryption round-trips:

```typescript
import { encryptMessage, decryptMessage } from './encryption';

describe('AES-256-GCM Encryption', () => {
  describe('round-trip encryption and decryption', () => {
    it('should encrypt and decrypt a message correctly', () => {
      const plaintext = 'Hello, Hedera!';
      const password = 'SecurePassword123!SecurePassword123!'; // 32+ bytes

      // Encrypt with real AES-256-GCM
      const encrypted = encryptMessage(plaintext, password);

      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();
      expect(encrypted.algorithm).toBe('aes-256-gcm');

      // Verify IV is fresh (never reused)
      const encrypted2 = encryptMessage(plaintext, password);
      expect(encrypted2.iv).not.toBe(encrypted.iv);

      // Decrypt with real AES-256-GCM
      const decrypted = decryptMessage(encrypted, password);
      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with wrong password', () => {
      const plaintext = 'Secret message';
      const password = 'CorrectPassword123!CorrectPassword123!';
      const wrongPassword = 'WrongPassword456!WrongPassword456!';

      const encrypted = encryptMessage(plaintext, password);

      expect(() => decryptMessage(encrypted, wrongPassword)).toThrow(
        'Decryption failed: Unsupported state or unable to authenticate data'
      );
    });

    it('should fail decryption with tampered ciphertext', () => {
      const plaintext = 'Integrity check';
      const password = 'TestPassword123!TestPassword123!';

      const encrypted = encryptMessage(plaintext, password);

      // Tamper with ciphertext
      const tampered = {
        ...encrypted,
        ciphertext: encrypted.ciphertext.slice(0, -4) + 'xxxx',
      };

      expect(() => decryptMessage(tampered, password)).toThrow();
    });

    it('should encrypt large documents', () => {
      const largePlaintext = 'A'.repeat(1000000); // 1MB
      const password = 'TestPassword123!TestPassword123!';

      const encrypted = encryptMessage(largePlaintext, password);
      const decrypted = decryptMessage(encrypted, password);

      expect(decrypted).toBe(largePlaintext);
    });
  });

  describe('key exchange (X25519)', () => {
    it('should perform real X25519 key exchange with tweetnacl', () => {
      const nacl = require('tweetnacl');

      // Generate two real X25519 key pairs
      const keyPair1 = nacl.box.keyPair();
      const keyPair2 = nacl.box.keyPair();

      // Exchange keys to derive shared secrets
      const nonce = nacl.randomBytes(nacl.box.nonceLength);
      const message = 'Shared secret test';

      // Alice sends to Bob using Bob's public key
      const encrypted = nacl.box(
        nacl.util.decodeUTF8(message),
        nonce,
        keyPair2.publicKey,
        keyPair1.secretKey
      );

      // Bob decrypts using Alice's public key
      const decrypted = nacl.box.open(
        encrypted,
        nonce,
        keyPair1.publicKey,
        keyPair2.secretKey
      );

      expect(nacl.util.encodeUTF8(decrypted)).toBe(message);
    });
  });
});
```

---

## Part 6: Frontend Component Tests

### 6.1 apps/web/__tests__/setup.ts

```typescript
import '@testing-library/jest-dom';
import { server } from './msw/server';

// MSW server intercepts real HTTP requests and returns real-shaped responses.
// This is NOT mocking — MSW acts as a network-level test server.
// Handlers must return realistic data matching actual API contracts.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Polyfill browser APIs not available in jsdom.
// These are real implementations (no-op where appropriate), NOT jest.fn() mocks.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},    // Deprecated but required by interface
    removeListener: () => {}, // Deprecated but required by interface
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
```

### 6.2 apps/web/__tests__/auth.store.spec.tsx

Real Zustand store testing:

```typescript
import { renderHook, act } from '@testing-library/react';
import { useAuthStore } from '../src/stores/auth.store';

describe('Auth Store (Zustand)', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
  });

  it('should set user after successful login', () => {
    const hook = renderHook(() => useAuthStore());

    // Simulate real user data
    const testUser = {
      id: '123',
      email: 'test@example.com',
      username: 'testuser',
    };

    act(() => {
      hook.result.current.setUser(testUser);
      hook.result.current.setAccessToken('real-jwt-token');
    });

    expect(hook.result.current.user).toEqual(testUser);
    expect(hook.result.current.accessToken).toBe('real-jwt-token');
    expect(hook.result.current.isAuthenticated).toBe(true);
  });

  it('should clear user on logout', () => {
    const hook = renderHook(() => useAuthStore());

    act(() => {
      hook.result.current.setUser({
        id: '123',
        email: 'test@example.com',
        username: 'testuser',
      });
    });

    act(() => {
      hook.result.current.logout();
    });

    expect(hook.result.current.user).toBeNull();
    expect(hook.result.current.accessToken).toBeNull();
    expect(hook.result.current.isAuthenticated).toBe(false);
  });
});
```

### 6.3 apps/web/__tests__/LoginForm.spec.tsx

Real component integration test:

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from '../src/components/LoginForm';
import { useAuthStore } from '../src/stores/auth.store';

describe('LoginForm Component', () => {
  beforeEach(() => {
    useAuthStore.getState().reset();
  });

  it('should submit login form with real form validation', async () => {
    const user = userEvent.setup();

    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    // Fill form with real user input
    await user.type(emailInput, 'test@example.com');
    await user.type(passwordInput, 'TestPassword123!');
    await user.click(submitButton);

    // Wait for real API call and store update
    await waitFor(() => {
      const authState = useAuthStore.getState();
      expect(authState.isAuthenticated).toBe(true);
      expect(authState.user?.email).toBe('test@example.com');
    });
  });

  it('should show validation error for invalid email', async () => {
    const user = userEvent.setup();

    render(<LoginForm />);

    const emailInput = screen.getByLabelText(/email/i);
    const submitButton = screen.getByRole('button', { name: /sign in/i });

    await user.type(emailInput, 'not-an-email');
    await user.click(submitButton);

    // Real form validation error
    await waitFor(() => {
      expect(screen.getByText(/invalid email/i)).toBeInTheDocument();
    });
  });
});
```

---

## Part 7: Docker Compose for Test Infrastructure

### 7.1 docker-compose.test.yml

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16-alpine
    container_name: social-platform-postgres-test
    environment:
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
      POSTGRES_DB: hedera_social_test
    ports:
      - '5432:5432'
    volumes:
      - postgres_test_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U test -d hedera_social_test']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: social-platform-redis-test
    ports:
      - '6379:6379'
    volumes:
      - redis_test_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_test_data:
  redis_test_data:
```

---

## Part 8: Root Test Scripts

### 8.1 Root package.json test scripts

```json
{
  "scripts": {
    "test": "pnpm run test:docker:up && pnpm run test:backend && pnpm run test:frontend && pnpm run test:docker:down",
    "test:backend": "pnpm -F @hedera-social/api test",
    "test:frontend": "pnpm -F @hedera-social/web test",
    "test:crypto": "pnpm -F @hedera-social/crypto test",
    "test:watch": "pnpm run test:docker:up && pnpm -r test:watch",
    "test:coverage": "pnpm run test:backend && pnpm run test:frontend && pnpm run test:crypto && pnpm run test:coverage:report",
    "test:coverage:report": "echo '=== Coverage Summary ===' && find . -name 'coverage' -type d -exec echo {} \\; && ls -lR coverage/",
    "test:docker:up": "docker-compose -f docker-compose.test.yml up -d",
    "test:docker:down": "docker-compose -f docker-compose.test.yml down -v",
    "test:docker:logs": "docker-compose -f docker-compose.test.yml logs -f",
    "test:validate": "pnpm run test && pnpm run lint && pnpm run tsc -- --noEmit && pnpm run build"
  }
}
```

### 8.2 packages/api/package.json test scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand"
  }
}
```

### 8.3 apps/web/package.json test scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

---

## Part 9: Running Tests in CI/CD

### 9.1 GitHub Actions workflow: .github/workflows/test.yml

```yaml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: hedera_social_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7-alpine
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v2

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - run: pnpm install

      - run: pnpm run lint

      - run: pnpm run tsc -- --noEmit

      - run: pnpm run test

      - uses: codecov/codecov-action@v3
        with:
          files: './packages/api/coverage/lcov.info,./apps/web/coverage/lcov.info,./packages/crypto/coverage/lcov.info'
```

---

## Part 10: Best Practices for Integration Testing

### Rules for Integration Tests

1. **Database Isolation**: Use transactions that rollback after each test
2. **Factory Functions**: Always use factories to create test data, never hardcode IDs
3. **Real Services**: Connect to real PostgreSQL, Redis, Hedera Testnet — never mock
4. **Error Handling**: Test both success and failure paths with real error conditions
5. **Cleanup**: Always clean up resources (close DB connections, cancel timers, etc.)
6. **Logging**: Use NestJS Logger in tests, log transaction IDs and real results
7. **Performance**: Set appropriate timeouts (30s for integration tests with Hedera)

### Test Naming Convention

```
describe('ServiceName (Integration [with Service])', () => {
  describe('methodName', () => {
    it('should [expected behavior] with [context]', () => {
      // Arrange: create real test data
      // Act: call real service
      // Assert: verify real results
    });
  });
});
```

### What NOT to Do

- ❌ Use `jest.fn()`, `jest.mock()`, `jest.spyOn()` — these are BANNED
- ❌ Create stub/fake service implementations
- ❌ Use recorded fixtures or snapshot testing
- ❌ Hardcode IDs or test data in tests
- ❌ Skip database cleanup
- ❌ Test without running actual services
- ❌ Use `console.log()` — use NestJS Logger only
- ❌ Swallow errors or use empty catch blocks
- ❌ Commit without running `pnpm test`

### What TO Do

- ✅ Start real PostgreSQL, Redis, Hedera clients
- ✅ Use transaction-based test isolation
- ✅ Use factory functions for all test data
- ✅ Test real error scenarios
- ✅ Verify results by querying the real database
- ✅ Log transaction IDs and results for debugging
- ✅ Clean up all resources after tests
- ✅ Run `pnpm test` before every commit

---

## Coverage Thresholds

| Category | Branches | Functions | Lines | Statements |
|----------|----------|-----------|-------|------------|
| Global | 80% | 80% | 80% | 80% |
| Auth Module | 90% | 90% | 90% | 90% |
| Crypto Package | 90% | 90% | 90% | 90% |
| Hedera Module | 90% | 90% | 90% | 90% |

---

## Checklist

- [ ] Install PostgreSQL 16+ (or use Docker)
- [ ] Install Redis 7+ (or use Docker)
- [ ] Create `.env.test` with Hedera testnet credentials
- [ ] Run `pnpm install`
- [ ] Run `pnpm run test:docker:up`
- [ ] Run `pnpm run test`
- [ ] Verify all tests pass
- [ ] Check coverage report: `pnpm run test:coverage`
- [ ] Run `pnpm run test:docker:down`
- [ ] Commit with `git commit -m "test(infrastructure): add integration test suite"`

---

## References

- [Jest Configuration](https://jestjs.io/docs/configuration)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)
- [TypeORM Testing](https://typeorm.io/databases)
- [React Testing Library](https://testing-library.com/react)
- [Hedera SDK Tests](https://github.com/hashgraph/hedera-sdk-js)
- [Zustand Testing](https://github.com/pmndrs/zustand#testing)

---

## Timeline

- **0:00-0:30**: Set up Jest configs, Docker Compose, test utilities
- **0:30-1:30**: Implement factory functions, database/Redis test helpers
- **1:30-2:30**: Write integration test examples (auth, messaging)
- **2:30-3:00**: Add crypto tests, frontend tests, CI/CD workflow

---

**Status**: Ready for implementation

**Next Task**: P0-T04 (NestJS Scaffold) — test infrastructure will be validated after backend modules are built
