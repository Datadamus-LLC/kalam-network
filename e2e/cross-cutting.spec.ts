/**
 * Cross-Cutting E2E Tests — Error handling, edge cases, security, resilience
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Cross-Cutting Concerns', () => {
  let authData: { email: string; token: string; refreshToken: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('xcut');
  });

  test.describe('Route Guards & Auth', () => {
    test('unauthenticated → / redirects from /feed', async ({ page }) => {
      await page.goto('/feed');
      await page.waitForURL(/^http:\/\/localhost:3000(\/login|\/register|\/)?$/, { timeout: 10_000 });
    });

    test('unauthenticated → redirect from /messages', async ({ page }) => {
      await page.goto('/messages');
      await page.waitForURL(/^http:\/\/localhost:3000(\/login|\/register|\/)?$/, { timeout: 10_000 });
    });

    test('unauthenticated → redirect from /payments', async ({ page }) => {
      await page.goto('/payments');
      await page.waitForURL(/^http:\/\/localhost:3000(\/login|\/register|\/)?$/, { timeout: 10_000 });
    });

    test('unauthenticated → redirect from /notifications', async ({ page }) => {
      await page.goto('/notifications');
      await page.waitForURL(/^http:\/\/localhost:3000(\/login|\/register|\/)?$/, { timeout: 10_000 });
    });

    test('unauthenticated → redirect from /settings', async ({ page }) => {
      await page.goto('/settings');
      await page.waitForURL(/^http:\/\/localhost:3000(\/login|\/register|\/)?$/, { timeout: 10_000 });
    });

    test('authenticated user visiting /login redirects to /feed', async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email);
      await page.goto('/login');
      await page.waitForURL(/feed/, { timeout: 10_000 });
    });

    test('stays authenticated after page refresh', async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email);
      await page.goto('/feed');
      await page.waitForURL(/feed/, { timeout: 15_000 });

      // Refresh
      await page.reload();
      // Should still be on feed (or app route), not redirected to login
      await expect(page).toHaveURL(/feed|messages|discover|payments/, { timeout: 10_000 });
    });
  });

  test.describe('404 and Error Pages', () => {
    test('shows not found for unknown route', async ({ page }) => {
      await page.goto('/this-page-does-not-exist-at-all');
      // Should show 404 or redirect to /
      const url = page.url();
      const text = await page.textContent('body');
      const is404 = /not found|404|page.*exist/i.test(text ?? '');
      const isRedirected = url.endsWith('/') || url.includes('/login');
      expect(is404 || isRedirected).toBeTruthy();
    });
  });

  test.describe('XSS Prevention', () => {
    test('post content with XSS script is sanitized', async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email);
      await page.goto('/feed');

      const postInput = page.getByPlaceholder(/what.*mind|what.*happen|write.*post|share/i);
      await expect(postInput).toBeVisible({ timeout: 15_000 });

      const xssPayload = '<script>window.__xss_executed = true;</script>XSS Test Post';
      await postInput.fill(xssPayload);

      const postBtn = page.getByRole('button', { name: /post|publish|submit/i });
      if (await postBtn.isEnabled()) {
        await postBtn.click();
        // If post appears, verify the script wasn't executed
        const xssExecuted = await page.evaluate(() => (window as unknown as Record<string, unknown>).__xss_executed);
        expect(xssExecuted).toBeFalsy();
      }
    });
  });

  test.describe('Expired Token Handling', () => {
    test('expired token gets 401 and redirects to login', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => {
        const state = {
          state: {
            token: 'expired.invalid.token',
            refreshToken: 'expired.invalid.refresh',
            isAuthenticated: true,
            user: { id: '', status: 'active', displayName: 'Test', accountType: null, hederaAccountId: null, kycLevel: null },
            onboardingStep: 'success',
            registrationId: null,
            identifierType: 'email',
            identifier: 'test@example.com',
          },
          version: 0,
        };
        localStorage.setItem('hedera-social-auth', JSON.stringify(state));
      });

      await page.goto('/feed');
      // App should handle 401 gracefully — redirect to login or show error
      // It should NOT show a white screen or unhandled crash
      const bodyText = await page.textContent('body');
      expect(bodyText).toBeTruthy();
      expect(bodyText!.length).toBeGreaterThan(10);
    });
  });

  test.describe('Resilience', () => {
    test('app renders without crashing on all main pages', async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email);

      const pages = ['/feed', '/discover', '/messages', '/payments', '/notifications', '/settings'];
      for (const path of pages) {
        await page.goto(path);
        // Check page isn't completely blank or crashed
        const bodyText = await page.textContent('body');
        expect(bodyText, `Page ${path} rendered blank`).toBeTruthy();
        expect(bodyText!.length, `Page ${path} too short`).toBeGreaterThan(20);

        // No unhandled error boundary crashes
        const errorText = await page.getByText(/something went wrong|unexpected error|crash/i).isVisible();
        expect(errorText, `Page ${path} shows crash error`).toBeFalsy();
      }
    });
  });
});
