/**
 * Navigation & Layout E2E Tests — Sidebar, mobile menu, route guards
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Navigation & Layout', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('nav');
  });

  test.describe('Sidebar Navigation', () => {
    test.beforeEach(async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
      await page.goto('/feed');
      await page.waitForURL(/feed/);
    });

    test('shows all nav links', async ({ page }) => {
      // Use the nav element to scope to the sidebar navigation
      const nav = page.locator('nav').first();
      await expect(nav.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Messages', exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Discover', exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Payments', exact: true })).toBeVisible();
      await expect(nav.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
      // Settings is in the sidebar footer (below nav)
      await expect(page.getByRole('complementary').getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
    });

    test('navigates to messages', async ({ page }) => {
      await page.getByRole('navigation').getByRole('link', { name: 'Messages', exact: true }).click();
      await page.waitForURL(/messages/);
      await expect(page).toHaveURL(/messages/);
    });

    test('navigates to discover', async ({ page }) => {
      await page.getByRole('navigation').getByRole('link', { name: 'Discover', exact: true }).click();
      await page.waitForURL(/discover/);
    });

    test('navigates to payments', async ({ page }) => {
      await page.getByRole('navigation').getByRole('link', { name: 'Payments', exact: true }).click();
      await page.waitForURL(/payments/);
    });

    test('navigates to notifications', async ({ page }) => {
      await page.getByRole('navigation').getByRole('link', { name: 'Notifications', exact: true }).click();
      await page.waitForURL(/notifications/);
    });

    test('navigates to settings', async ({ page }) => {
      // Settings is in sidebar footer, scope to the aside
      await page.getByRole('complementary').getByRole('link', { name: 'Settings', exact: true }).click();
      await page.waitForURL(/settings/);
    });
  });

  test.describe('Mobile Responsive', () => {
    test.use({ viewport: { width: 375, height: 812 } }); // iPhone X

    test.beforeEach(async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
      await page.goto('/feed');
    });

    test('shows hamburger menu on mobile', async ({ page }) => {
      // The "Open menu" button is in the header (md:hidden)
      await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
    });
  });
});
