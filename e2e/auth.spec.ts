/**
 * Authentication E2E Tests — Registration, Login, OTP, Onboarding
 *
 * This is the FIRST test file to run. It creates the test users
 * that subsequent test files depend on.
 */
import { test, expect } from './fixtures';
import { testEmail } from './helpers';

const TEST_OTP = '123123';

test.describe('Authentication', () => {
  test.describe('Landing Page', () => {
    test('shows register and login options', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByText(/hedera social/i)).toBeVisible();
      // Landing page uses buttons (not links) to navigate to register/login
      await expect(
        page.getByRole('button', { name: /create account|register/i }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: /sign in|log in/i }),
      ).toBeVisible();
    });
  });

  test.describe('Registration Flow', () => {
    const email = testEmail('reg');

    test('shows registration form', async ({ page }) => {
      await page.goto('/register');
      await expect(page.getByRole('heading', { name: /register/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /continue/i })).toBeVisible();
    });

    test('validates empty email', async ({ page }) => {
      await page.goto('/register');
      const btn = page.getByRole('button', { name: /continue/i });
      // Button should be disabled when email is empty
      await expect(btn).toBeDisabled();
    });

    test('validates invalid email format', async ({ page }) => {
      await page.goto('/register');
      await page.getByLabel(/email/i).fill('notanemail');
      await page.getByRole('button', { name: /continue/i }).click();
      await expect(page.getByText(/valid email/i)).toBeVisible({ timeout: 5_000 });
    });

    test('sends OTP on valid email', async ({ page }) => {
      await page.goto('/register');
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole('button', { name: /continue/i }).click();

      // Should show OTP verification screen
      await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });
    });

    test('completes registration with OTP', async ({ page }) => {
      await page.goto('/register');
      await page.getByLabel(/email/i).fill(email);
      await page.getByRole('button', { name: /continue/i }).click();

      // Wait for OTP screen
      await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });

      // Fill OTP
      const otpInputs = page.locator('input[maxlength="1"], input[type="tel"]');
      const count = await otpInputs.count();
      if (count >= 6) {
        for (let i = 0; i < 6; i++) {
          await otpInputs.nth(i).fill(TEST_OTP[i]);
        }
      } else {
        await page.locator('input').last().fill(TEST_OTP);
      }

      // Submit
      const verifyBtn = page.getByRole('button', { name: /verify|submit|confirm/i });
      if (await verifyBtn.isVisible()) {
        await verifyBtn.click();
      }

      // Should proceed to wallet creation or KYC
      await page.waitForURL(/onboarding\/wallet|onboarding\/kyc|feed/, { timeout: 30_000 });
    });

    test('shows wallet creation progress', async ({ page }) => {
      // Register a fresh user to see wallet flow
      const freshEmail = testEmail('wallet');
      await page.goto('/register');
      await page.getByLabel(/email/i).fill(freshEmail);
      await page.getByRole('button', { name: /continue/i }).click();

      await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });

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

      // On wallet page, should see creating state
      await page.waitForURL(/onboarding\/wallet/, { timeout: 15_000 });
      await expect(page.getByText(/creating wallet|generating|hedera account/i).first()).toBeVisible();

      // Wait for wallet creation — skip if Tamam Custody is rate-limited
      const walletCreated = await page.getByRole('heading', { name: /wallet created/i })
        .isVisible({ timeout: 90_000 })
        .catch(() => false);
      if (!walletCreated) {
        test.skip(true, 'Wallet creation failed — Tamam Custody may be rate-limited');
        return;
      }
      await expect(page.getByText(/0\.0\.\d+/)).toBeVisible();

      // Continue button navigates to KYC
      await page.getByRole('button', { name: /continue to verification/i }).click();
      await page.waitForURL(/onboarding\/kyc|onboarding\/success|feed/, { timeout: 15_000 });
    });
  });

  test.describe('Login Flow', () => {
    test('shows login form', async ({ page }) => {
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
      await expect(page.getByLabel(/email/i)).toBeVisible();
      await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
    });

    test('validates empty email', async ({ page }) => {
      await page.goto('/login');
      const btn = page.getByRole('button', { name: /sign in/i });
      await expect(btn).toBeDisabled();
    });

    test('shows error for non-existent account', async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill('nonexistent@test.hedera.social');
      await page.getByRole('button', { name: /sign in/i }).click();

      // Specific error text — avoids strict mode on role=alert (toast also has that role)
      await expect(page.getByText(/no account found|not found/i)).toBeVisible({ timeout: 10_000 });
    });

    test('has link to register page', async ({ page }) => {
      await page.goto('/login');
      const regLink = page.getByRole('link', { name: /register/i });
      await expect(regLink).toBeVisible();
    });
  });

  test.describe('Route Guards', () => {
    test('redirects unauthenticated user from /feed to /', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL('/');
    });

    test('redirects unauthenticated user from /messages to /', async ({ page }) => {
      await page.goto('/messages');
      await page.waitForURL('/');
    });

    test('redirects unauthenticated user from /payments to /', async ({ page }) => {
      await page.goto('/payments');
      await page.waitForURL('/');
    });
  });
});
