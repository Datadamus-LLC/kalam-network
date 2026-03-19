import type { Config } from 'jest';

const config: Config = {
  displayName: '@hedera-social/web',
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/__tests__'],
  testMatch: [
    '**/__tests__/**/*.spec.ts?(x)',
    '**/__tests__/**/*.test.ts?(x)',
    '**/?(*.)+(spec|test).ts?(x)',
  ],
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
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '@hedera-social/shared': '<rootDir>/../../packages/shared/src',
    '@hedera-social/shared/(.*)': '<rootDir>/../../packages/shared/src/$1',
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
  setupFiles: ['<rootDir>/__tests__/setup.ts'],
  testTimeout: 10000,
};

export default config;
