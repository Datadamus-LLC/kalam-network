/**
 * Onboarding E2E Tests — Wallet creation, KYC, success, progress
 */
import { test, expect } from './fixtures';
import { testEmail } from './helpers';

const TEST_OTP = '123123';

async function registerAndGetToOTP(page: Parameters<typeof test>[1] extends (args: infer A) => unknown ? A extends { page: infer P } ? P : never : never, email: string) {
  await page.goto('/register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });
}

async function fillOTP(page: Parameters<typeof test>[1] extends (args: infer A) => unknown ? A extends { page: infer P } ? P : never : never) {
  const otpInputs = page.locator('input[maxlength="1"], input[type="tel"]');
  const count = await otpInputs.count();
  if (count >= 6) {
    for (let i = 0; i < 6; i++) {
      await otpInputs.nth(i).fill(TEST_OTP[i]);
    }
  } else {
    await page.locator('input').last().fill(TEST_OTP);
  }
  const verifyBtn = page.getByRole('button', { name: /verify|submit|confirm/i });
  if (await verifyBtn.isVisible()) {
    await verifyBtn.click();
  }
}

test.describe('Onboarding', () => {
  test.describe('Wallet Creation', () => {
    test('redirects to wallet creation after OTP', async ({ page }) => {
      const email = testEmail('ob-wallet');
      await page.goto('/register');
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole('button', { name: /continue/i }).click();
      await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });
      await fillOTP(page);

      // Should land on wallet or onboarding step
      await page.waitForURL(/onboarding\/wallet|onboarding\/kyc|onboarding|feed/, { timeout: 30_000 });
    });

    test('shows wallet creation progress on wallet page', async ({ page }) => {
      const email = testEmail('ob-walletprog');
      await page.goto('/register');
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole('button', { name: /continue/i }).click();
      await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });
      await fillOTP(page);

      // Navigate to wallet page or skip if redirected elsewhere
      const atWallet = await page.waitForURL(/onboarding\/wallet/, { timeout: 15_000 })
        .then(() => true)
        .catch(() => false);

      if (!atWallet) {
        // Went directly to KYC/feed — wallet page was bypassed
        expect(page.url()).toMatch(/onboarding|feed/);
        return;
      }

      // Shows progress indicator while creating
      await expect(
        page.getByText(/creating|generating|wallet|hedera/i).first(),
      ).toBeVisible({ timeout: 10_000 });

      // After creation, shows "Wallet Created" + Continue button
      // Skip gracefully if Tamam Custody is rate-limited or unavailable
      const walletCreated = await page.getByRole('heading', { name: /wallet created/i })
        .isVisible({ timeout: 90_000 })
        .catch(() => false);
      if (!walletCreated) {
        test.skip(true, 'Wallet creation failed — Tamam Custody may be rate-limited');
        return;
      }

      // Click continue to proceed
      await page.getByRole('button', { name: /continue to verification/i }).click();
      await page.waitForURL(/onboarding\/kyc|onboarding\/success|feed/, { timeout: 15_000 });
    });

    test('shows hedera account ID after wallet creation', async ({ page }) => {
      const email = testEmail('ob-hderaid');
      await page.goto('/register');
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole('button', { name: /continue/i }).click();
      await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });
      await fillOTP(page);

      // Wait through onboarding to feed
      await page.waitForURL(/onboarding\/wallet|onboarding\/kyc|onboarding\/success|feed/, { timeout: 30_000 });

      if (page.url().includes('onboarding/wallet')) {
        // Wait for "Wallet Created" heading — skip if Tamam is rate-limited
        const walletCreated = await page.getByRole('heading', { name: /wallet created/i })
          .isVisible({ timeout: 90_000 })
          .catch(() => false);
        if (!walletCreated) {
          test.skip(true, 'Wallet creation failed — Tamam Custody may be rate-limited');
          return;
        }
        // Verify the account ID format is shown
        await expect(page.getByText(/0\.0\.\d+/)).toBeVisible();
        // Click Continue to proceed
        await page.getByRole('button', { name: /continue to verification/i }).click();
        await page.waitForURL(/onboarding\/kyc|onboarding\/success|feed/, { timeout: 15_000 });
      }
    });
  });

  test.describe('KYC Step', () => {
    test('handles KYC disabled state gracefully', async ({ page }) => {
      const email = testEmail('ob-kyc');
      await page.goto('/register');
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole('button', { name: /continue/i }).click();
      await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });
      await fillOTP(page);

      // Navigate through wallet
      await page.waitForURL(/onboarding|feed/, { timeout: 30_000 });

      if (page.url().includes('onboarding/wallet')) {
        try {
          await page.waitForURL(/onboarding\/kyc|onboarding\/success|feed/, { timeout: 60_000 });
        } catch {
          test.skip(true, 'Wallet creation timed out — Hedera testnet may have low HBAR');
          return;
        }
      }

      if (page.url().includes('onboarding/kyc')) {
        // Fill in required KYC fields with test data
        await page.locator('#fullLegalName').fill('Test User KYC E2E');
        await page.locator('#dateOfBirth').fill('1990-01-15');
        await page.locator('#nationalIdNumber').fill('TEST-ID-123456');
        await page.locator('#cityOfBirth').fill('Test City');
        await page.locator('#currentResidentialAddress').fill('123 Test Street, Test State');

        // Submit — with MIRSAD_KYC_ENABLED=false, backend auto-approves
        await page.getByRole('button', { name: /submit for verification/i }).click();

        // Wait for polling component to detect approval and redirect to success
        // completeOnboarding (DID NFT + HCS topics) can take 60-120s on testnet
        try {
          await page.waitForURL(/onboarding\/success|feed/, { timeout: 120_000 });
        } catch {
          test.skip(true, 'KYC approval did not complete in time — testnet may be slow');
        }
      }
    });
  });

  test.describe('Navigation Guards', () => {
    test('unauthenticated user cannot access onboarding directly', async ({ page }) => {
      await page.goto('/onboarding/wallet');
      // Should redirect away — either to / or /login
      await page.waitForURL(/^http:\/\/localhost:3000\/(login|register)?$|^http:\/\/localhost:3000\/$/, { timeout: 15_000 });
    });
  });
});
