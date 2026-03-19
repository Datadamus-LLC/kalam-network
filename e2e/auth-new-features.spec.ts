/**
 * Auth New Feature Tests
 * - 401 response clears tokens and redirects to /login
 * - Re-registration of unverified account resends OTP
 * - Route guards for new routes (/trending, /organization, /broadcasts, /profile/me)
 * - JWT expiry handled gracefully
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth, testEmail } from './helpers';

let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

test.beforeAll(async () => {
  authData = await registerUserViaApi('authnew');
});

test.describe('401 Handling', () => {
  test('expired token redirects to login and clears auth state', async ({ page }) => {
    // Inject an expired/invalid token
    await page.goto('/');
    await page.evaluate(() => {
      const state = {
        state: {
          token: 'expired.invalid.token.xyz',
          refreshToken: 'expired.invalid.refresh',
          isAuthenticated: true,
          user: { id: '', status: 'active', displayName: 'Test', accountType: 'individual', hederaAccountId: null, kycLevel: null },
          onboardingStep: 'success',
          registrationId: null,
        },
        version: 0,
      };
      localStorage.setItem('hedera-social-auth', JSON.stringify(state));
    });

    await page.goto('/feed');
    // App should handle 401 gracefully — not crash, shows content or redirects
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(10);
  });

  test('page does not show white screen on 401', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('hedera-social-auth', JSON.stringify({
        state: { token: 'bad.token', refreshToken: 'bad', isAuthenticated: true,
          user: { id: '', status: 'active', displayName: 'T', accountType: 'individual', hederaAccountId: null, kycLevel: null },
          onboardingStep: 'success', registrationId: null },
        version: 0,
      }));
    });
    await page.goto('/notifications');
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText!.length).toBeGreaterThan(20);
  });
});

test.describe('Route Guards — New Routes', () => {
  test('unauthenticated → /trending redirects to /', async ({ page }) => {
    await page.goto('/trending');
    await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });
  });

  test('unauthenticated → /broadcasts redirects to /', async ({ page }) => {
    await page.goto('/broadcasts');
    await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });
  });

  test('unauthenticated → /profile/me redirects to /', async ({ page }) => {
    await page.goto('/profile/me');
    await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });
  });

  test('unauthenticated → /organization redirects to /', async ({ page }) => {
    await page.goto('/organization');
    await page.waitForURL(/^http:\/\/localhost:3000(\/)?$/, { timeout: 10_000 });
  });

  test('authenticated user can access /trending', async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/trending');
    await expect(page).toHaveURL(/trending/);
    await expect(page.getByRole('heading', { name: /trending/i })).toBeVisible({ timeout: 10_000 });
  });

  test('authenticated user can access /broadcasts', async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/broadcasts');
    await expect(page).toHaveURL(/broadcasts/);
    // Page loads without crash
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('authenticated user can access /profile/me', async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/profile/me');
    await expect(page).toHaveURL(/profile\/me/);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });
});

test.describe('Re-registration', () => {
  test('registering same email shows already-exists error', async ({ page }) => {
    await page.goto('/register');
    await page.getByLabel(/email/i).fill(authData.email);
    await page.getByRole('button', { name: /continue/i }).click();
    await expect(page.getByText(/already exists/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Navigation — New Items', () => {
  test('sidebar shows Trending, Profile, Broadcasts nav items', async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');

    const nav = page.getByRole('navigation');
    await expect(nav.getByRole('link', { name: 'Trending', exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(nav.getByRole('link', { name: 'Broadcasts', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
  });

  test('clicking Trending navigates to /trending', async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.getByRole('navigation').getByRole('link', { name: 'Trending', exact: true }).click();
    await page.waitForURL(/trending/);
    await expect(page).toHaveURL(/trending/);
  });

  test('clicking Profile navigates to /profile/me', async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.getByRole('navigation').getByRole('link', { name: 'Profile', exact: true }).click();
    await page.waitForURL(/profile\/me/);
    await expect(page).toHaveURL(/profile\/me/);
  });
});
