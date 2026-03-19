/**
 * Extended Playwright test fixture.
 *
 * Adds a minimum slot time between tests to prevent Tamam Custody API rate-limiting.
 * The slot only adds delay when tests complete faster than the minimum — fast tests
 * (pure UI, no wallet creation) rarely trigger the full wait.
 *
 * Wallet-creating operations (registerUserViaApi + /wallet/create) use deterministic
 * emails, so wallets are only created ONCE per prefix on first run.
 * Subsequent runs reuse the existing wallet — no HBAR spent, no rate limit hit.
 */
import { test as base, expect } from '@playwright/test';

// 3 seconds between tests — enough to prevent bursting without slowing suite much
const MIN_SLOT_MS = 3_000;

export const test = base.extend<{ _slot: void }>({
  _slot: [
    async ({}, use) => {
      const start = Date.now();
      await use();
      const elapsed = Date.now() - start;
      const remaining = MIN_SLOT_MS - elapsed;
      if (remaining > 200) {
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
    },
    { auto: true },
  ],
});

export { expect };
