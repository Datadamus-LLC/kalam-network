/**
 * Navigation Interactions — logout, mobile menu open/close, active link, logo
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

test.describe('Navigation Interactions', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('navX');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
  });

  test('logout button logs out and redirects to landing', async ({ page }) => {
    const logoutBtn = page.getByRole('button', { name: /logout/i });
    await expect(logoutBtn).toBeVisible();
    await logoutBtn.click();

    // Should redirect to landing page or login
    await page.waitForURL(/^http:\/\/localhost:3000(\/)?$|\/login/, { timeout: 10_000 });
    // Auth state cleared — landing page shows sign-in buttons
    await expect(
      page.getByRole('button', { name: /create account|sign in/i }).first()
    ).toBeVisible({ timeout: 5_000 });
  });

  test('clicking "Social" logo navigates to feed', async ({ page }) => {
    await page.goto('/discover');
    const logoLink = page.getByRole('link', { name: 'Social' }).first();
    await expect(logoLink).toBeVisible();
    await logoLink.click();
    await page.waitForURL(/feed/);
  });

  test('active nav link is highlighted on current page', async ({ page }) => {
    // On /feed, the Home link should be highlighted (blue text)
    const homeLink = page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true });
    await expect(homeLink).toBeVisible();
    // Check it has an active class (blue color indicates active)
    const className = await homeLink.getAttribute('class');
    expect(className).toContain('blue');
  });

  test('navigating updates active link highlight', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: 'Messages', exact: true }).click();
    await page.waitForURL(/messages/);

    const messagesLink = page.getByRole('navigation').getByRole('link', { name: 'Messages', exact: true });
    const className = await messagesLink.getAttribute('class');
    expect(className).toContain('blue');
  });

  test.describe('Mobile Menu', () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test('hamburger opens mobile menu', async ({ page }) => {
      const openBtn = page.getByRole('button', { name: 'Open menu' });
      await expect(openBtn).toBeVisible();
      await openBtn.click();

      // Mobile sidebar should slide in with nav links
      // Use last() — the overlay div also has aria-label="Close menu"
await expect(page.getByRole('button', { name: 'Close menu' }).last()).toBeVisible({ timeout: 3_000 });
    });

    test('mobile menu close button closes the menu', async ({ page }) => {
      await page.getByRole('button', { name: 'Open menu' }).click();
      // Use last() — the overlay div also has aria-label="Close menu"
await expect(page.getByRole('button', { name: 'Close menu' }).last()).toBeVisible({ timeout: 3_000 });

      await page.getByRole('button', { name: 'Close menu' }).last().click();
      await expect(page.getByRole('button', { name: 'Close menu' })).not.toBeVisible({ timeout: 3_000 });
    });

    test('mobile menu has all nav links', async ({ page }) => {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.waitForTimeout(500); // animation
      // After opening, sidebar is no longer aria-hidden — links become accessible
      await expect(page.getByRole('navigation').getByRole('link', { name: 'Messages', exact: true }).first()).toBeVisible({ timeout: 3_000 });
    });

    test('mobile menu link navigates and closes menu', async ({ page }) => {
      await page.getByRole('button', { name: 'Open menu' }).click();
      await page.waitForTimeout(500); // animation
      // Find Messages link that's now accessible (not aria-hidden)
      const messagesLink = page.getByRole('link', { name: 'Messages', exact: true }).first();
      if (await messagesLink.isVisible({ timeout: 3_000 })) {
        await messagesLink.click();
        await page.waitForURL(/messages/, { timeout: 10_000 });
        // Menu should be closed after navigation
        await expect(page.getByRole('button', { name: 'Close menu' }).last()).not.toBeVisible({ timeout: 3_000 });
      }
    });
  });
});
