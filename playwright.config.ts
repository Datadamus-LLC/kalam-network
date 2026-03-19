import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for Hedera Social Platform.
 *
 * Assumes:
 * - API running at http://localhost:3001
 * - Frontend running at http://localhost:3000
 * - PostgreSQL + Redis via docker-compose.test.yml
 * - Hedera testnet credentials in .env
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000, // 2.5min — wallet creation + KYC can take 60-90s on testnet
  expect: { timeout: 15_000 },

  fullyParallel: false,
  workers: 1,
  retries: 1,

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'on',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
