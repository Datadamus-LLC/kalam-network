/**
 * Auth Interactions — landing page buttons, login full flow, register already-exists error
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, testEmail } from './helpers';

test.describe('Auth Interactions', () => {
  test('Create Account button navigates to register', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL(/register/);
    await expect(page.getByRole('heading', { name: /register/i })).toBeVisible();
  });

  test('Sign In button navigates to login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/login/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('login with non-existent email shows error alert', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nonexistent@test.hedera.social');
    await page.getByRole('button', { name: /sign in/i }).click();
    // The error alert appears — use first() since toast container also has role=alert
    await expect(page.getByText(/no account found|not found/i)).toBeVisible({ timeout: 10_000 });
  });

  test('register with already-existing email shows conflict error', async ({ page }) => {
    const existingUser = await registerUserViaApi('authXexist');
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(existingUser.email);
    await page.getByRole('button', { name: /continue/i }).click();
    // Specific text check — avoids strict mode violation on role=alert (toast also has that role)
    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10_000 });
  });

  test('login flow: email → OTP → feed', async ({ page }) => {
    const user = await registerUserViaApi('authXlogin');
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(user.email);
    await page.getByRole('button', { name: /sign in/i }).click();

    // OTP screen must appear
    await expect(page.getByRole('heading', { name: /verify otp/i })).toBeVisible({ timeout: 15_000 });

    // Fill OTP inputs (6 individual inputs or single input, depending on render timing)
    const otpInputs = page.locator('input[maxlength="1"]');
    const inputCount = await otpInputs.count();
    const OTP = '123123';
    if (inputCount >= 6) {
      for (let i = 0; i < 6; i++) await otpInputs.nth(i).fill(OTP[i]);
    } else {
      // Fallback: single input or inputs not yet rendered — fill last input
      await page.locator('input').last().fill(OTP);
      const verifyBtn = page.getByRole('button', { name: /verify|confirm/i });
      if (await verifyBtn.isEnabled({ timeout: 3_000 }).catch(() => false)) {
        await verifyBtn.click();
      }
    }

    // Component auto-submits on 6th digit — wait for navigation
    // Use 60s — wallet creation (if needed) can take up to 30s
    await page.waitForURL(/feed|onboarding/, { timeout: 60_000 });
    expect(page.url()).toMatch(/feed|onboarding/);
  });

  test('register link on login page works', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: /register/i }).click();
    await page.waitForURL(/register/);
    await expect(page.getByRole('heading', { name: /register/i })).toBeVisible();
  });

  test('login link on register page works', async ({ page }) => {
    await page.goto('/register');
    await page.getByRole('link', { name: /log in/i }).click();
    await page.waitForURL(/login/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();
  });

  test('unauthenticated access to /discover redirects', async ({ page }) => {
    await page.goto('/discover');
    await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });
  });

  test('unauthenticated access to /settings redirects', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });
  });

  test('unauthenticated access to /notifications redirects', async ({ page }) => {
    await page.goto('/notifications');
    await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });
  });
});
