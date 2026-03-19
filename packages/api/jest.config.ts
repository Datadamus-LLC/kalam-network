import type { Config } from 'jest';

const config: Config = {
  displayName: '@hedera-social/api',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/'],
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/main.ts',
    '!src/**/index.ts',
    '!src/**/*.d.ts',
    // Pure interface files with zero runtime code (TypeScript interfaces compile to nothing)
    '!src/modules/messaging/dto/conversation-response.dto.ts',
    '!src/modules/organization/dto/organization-response.dto.ts',
    '!src/modules/payments/dto/payment-response.dto.ts',
    '!src/modules/social/dto/follow-response.dto.ts',
    '!src/modules/social/dto/post-response.dto.ts',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/test/',
    '.spec.ts',
    '.test.ts',
  ],
  // Coverage thresholds disabled: API currently has only integration tests
  // which require Docker (PostgreSQL, Redis, Hedera testnet).
  // Re-enable when unit tests are added.
  // coverageThreshold: { global: { branches: 80, functions: 80, lines: 80, statements: 80 } },
  moduleNameMapper: {
    '@hedera-social/shared': '<rootDir>/../../packages/shared/src',
    '@hedera-social/shared/(.*)': '<rootDir>/../../packages/shared/src/$1',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  setupFiles: ['<rootDir>/test/setup.ts'],
  testTimeout: 30000,
  verbose: true,
  forceExit: true,
  detectOpenHandles: true,
};

export default config;
