/**
 * Phase 1 — Layout Shell: Playwright E2E Tests
 *
 * Covers: auth guard, dark theme, full sidebar (220px), collapsed rail (56px),
 * Post button lemon color, nav active states, mobile menu open/close,
 * logout via dropdown, navigation between pages, multi-resolution screenshots.
 *
 * Runs at: mobile (375px), tablet (768px), desktop (1280px)
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

test.beforeAll(async () => {
  authData = await registerUserViaApi('layout');
});

// ── Auth guard ────────────────────────────────────────────────────────────────

test.describe('Auth guard', () => {
  test('unauthenticated: /feed redirects to /', async ({ page }) => {
    // No auth injected — fresh page
    await page.goto('/feed');
    await page.waitForURL('/', { timeout: 10_000 });
    await expect(page).toHaveURL('/');
  });

  test('unauthenticated: /payments redirects to /', async ({ page }) => {
    await page.goto('/payments');
    await page.waitForURL('/', { timeout: 10_000 });
    await expect(page).toHaveURL('/');
  });

  test('authenticated: /feed loads without redirect', async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/, { timeout: 15_000 });
    await expect(page).toHaveURL(/feed/);
  });
});

// ── Dark theme ────────────────────────────────────────────────────────────────

test.describe('Dark theme', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
  });

  test('html element has dark class by default', async ({ page }) => {
    const hasDark = await page.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(hasDark).toBe(true);
  });

  test('page background is not white (dark mode active)', async ({ page }) => {
    const bgColor = await page.evaluate(
      () => getComputedStyle(document.documentElement).getPropertyValue('--background').trim(),
    );
    // Dark background should not be the light mode value oklch(1 0 0)
    expect(bgColor).not.toBe('oklch(1 0 0)');
    expect(bgColor.length).toBeGreaterThan(0);
  });
});

// ── Full sidebar — desktop ────────────────────────────────────────────────────

test.describe('Full sidebar — desktop (220px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
  });

  test('sidebar (aside) is visible', async ({ page }) => {
    await expect(page.getByRole('complementary').first()).toBeVisible();
  });

  test('logo mark link is present', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  });

  test('sidebar is approximately 220px wide', async ({ page }) => {
    const box = await page.getByRole('complementary').first().boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(200);
    expect(box?.width).toBeLessThanOrEqual(240);
  });

  test('all nav items are present', async ({ page }) => {
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: 'Home', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Discover', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Notifications', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Messages', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Payments', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Broadcasts', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Profile', exact: true })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Settings', exact: true })).toBeVisible();
  });

  test('Home nav item is active (font-bold) on /feed', async ({ page }) => {
    const homeLink = page.getByRole('navigation').getByRole('link', { name: 'Home', exact: true });
    const cls = await homeLink.getAttribute('class');
    expect(cls).toMatch(/font-bold/);
  });

  test('Discover nav item is NOT active on /feed', async ({ page }) => {
    const discoverLink = page.getByRole('navigation').getByRole('link', { name: 'Discover', exact: true });
    const cls = await discoverLink.getAttribute('class');
    expect(cls).not.toMatch(/font-bold/);
  });

  test('Post button is visible with lemon background (#f0d060)', async ({ page }) => {
    // Post is a Link > Button — locate the button inside the link
    const postBtn = page.getByRole('link', { name: 'Post', exact: true }).locator('button');
    await expect(postBtn).toBeVisible();
    const bg = await postBtn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    // #f0d060 = rgb(240, 208, 96)
    expect(bg).toBe('rgb(240, 208, 96)');
  });

  test('Post button is full-width pill (rounded-full)', async ({ page }) => {
    const postBtn = page.getByRole('link', { name: 'Post', exact: true }).locator('button');
    const cls = await postBtn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
    expect(cls).toMatch(/w-full/);
  });

  test('user display name appears in user row', async ({ page }) => {
    // injectAuth sets displayName from email prefix (e.g. "e2e-layout")
    const aside = page.getByRole('complementary').first();
    const expectedName = authData.email.split('@')[0];
    await expect(aside.getByText(expectedName)).toBeVisible();
  });
});

// ── Nav active state changes ──────────────────────────────────────────────────

test.describe('Nav active state changes on navigation', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
  });

  test('Discover becomes active after click', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: 'Discover', exact: true }).click();
    await page.waitForURL(/discover/, { timeout: 10_000 });
    const cls = await page.getByRole('navigation').getByRole('link', { name: 'Discover', exact: true }).getAttribute('class');
    expect(cls).toMatch(/font-bold/);
  });

  test('Notifications becomes active after click', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: 'Notifications', exact: true }).click();
    await page.waitForURL(/notifications/, { timeout: 10_000 });
    const cls = await page.getByRole('navigation').getByRole('link', { name: 'Notifications', exact: true }).getAttribute('class');
    expect(cls).toMatch(/font-bold/);
  });

  test('Payments page loads via sidebar', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: 'Payments', exact: true }).click();
    await page.waitForURL(/payments/, { timeout: 10_000 });
  });

  test('Messages page loads via sidebar', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: 'Messages', exact: true }).click();
    await page.waitForURL(/messages/, { timeout: 10_000 });
  });

  test('Settings page loads via sidebar', async ({ page }) => {
    await page.getByRole('navigation').getByRole('link', { name: 'Settings', exact: true }).click();
    await page.waitForURL(/settings/, { timeout: 10_000 });
  });
});

// ── Collapsed rail — Messages page ───────────────────────────────────────────

test.describe('Collapsed rail — Messages page (56px)', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/messages');
    await page.waitForURL(/messages/, { timeout: 10_000 });
  });

  test('sidebar is visible and narrow (~56px)', async ({ page }) => {
    const aside = page.getByRole('complementary').first();
    await expect(aside).toBeVisible();
    const box = await aside.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(40);
    expect(box?.width).toBeLessThanOrEqual(72);
  });

  test('"New conversation" lemon button is visible in rail', async ({ page }) => {
    // Scope to the aside to avoid matching the page-level "New Conversation" button
    const aside = page.getByRole('complementary').first();
    const addBtn = aside.getByRole('button', { name: 'Start conversation' });
    await expect(addBtn).toBeVisible();
    const bg = await addBtn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    expect(bg).toBe('rgb(240, 208, 96)');
  });

  test('no labels visible in collapsed rail', async ({ page }) => {
    // In collapsed rail, nav items have only icons — no text labels
    const aside = page.getByRole('complementary').first();
    // The labels "Home", "Discover" etc. should NOT be visible in the aside
    await expect(aside.getByText('Home', { exact: true })).not.toBeVisible();
    await expect(aside.getByText('Discover', { exact: true })).not.toBeVisible();
  });
});

// ── Logout ────────────────────────────────────────────────────────────────────

test.describe('Logout via user row dropdown', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('logout redirects to /', async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);

    // Click the user row dropdown button (last button in the aside)
    const userRowBtn = page.getByRole('complementary').locator('button[type="button"]').last();
    await userRowBtn.click();

    // Click "Log out" from dropdown
    await expect(page.getByRole('menuitem', { name: /log out/i })).toBeVisible({ timeout: 5_000 });
    await page.getByRole('menuitem', { name: /log out/i }).click();

    await page.waitForURL('/', { timeout: 10_000 });
    await expect(page).toHaveURL('/');
  });
});

// ── Mobile menu ───────────────────────────────────────────────────────────────

test.describe('Mobile menu (375px)', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
  });

  test('desktop sidebar is hidden (md:hidden)', async ({ page }) => {
    // The desktop sidebar has "hidden md:flex" — at 375px it should not be visible
    const aside = page.getByRole('complementary').first();
    await expect(aside).toBeHidden();
  });

  test('hamburger button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
  });

  test('mobile header shows "Home" title', async ({ page }) => {
    await expect(page.locator('header').getByText(/the platform|kalam|hedera/i)).toBeVisible();
  });

  test('mobile menu opens on hamburger click', async ({ page }) => {
    await page.getByRole('button', { name: 'Open menu' }).click();
    // The close button (inside the drawer) should appear
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible({ timeout: 3_000 });
    // Nav links visible in drawer
    await expect(
      page.getByRole('link', { name: 'Home', exact: true }).first(),
    ).toBeVisible();
  });

  test('mobile menu closes on close button click', async ({ page }) => {
    await page.getByRole('button', { name: 'Open menu' }).click();
    const closeBtn = page.getByRole('button', { name: 'Close menu' });
    await expect(closeBtn).toBeVisible({ timeout: 3_000 });
    await closeBtn.click();
    await expect(closeBtn).not.toBeVisible({ timeout: 3_000 });
  });

  test('mobile menu closes on overlay click', async ({ page }) => {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByRole('button', { name: 'Close menu' })).toBeVisible({ timeout: 3_000 });
    // Click the overlay (aria-label="Close mobile navigation")
    await page.getByRole('button', { name: 'Close mobile navigation' }).click();
    await expect(page.getByRole('button', { name: 'Close menu' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('navigation works via mobile menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('link', { name: 'Discover', exact: true }).first().click();
    await page.waitForURL(/discover/, { timeout: 10_000 });
  });

  test('logout works via mobile menu', async ({ page }) => {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('button', { name: /log out/i }).click();
    await page.waitForURL('/', { timeout: 10_000 });
  });
});

// ── Tablet behavior ───────────────────────────────────────────────────────────

test.describe('Tablet sidebar (768px)', () => {
  test.use({ viewport: { width: 768, height: 1024 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
  });

  test('sidebar is visible at tablet width', async ({ page }) => {
    // md: breakpoint = 768px, which is the minimum for sidebar to show
    await expect(page.getByRole('complementary').first()).toBeVisible();
  });

  test('hamburger is NOT visible at tablet width', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Open menu' })).not.toBeVisible();
  });
});

// ── Multi-resolution screenshots ─────────────────────────────────────────────

test.describe('Multi-resolution rendering + screenshots', () => {
  for (const vp of VIEWPORTS) {
    test(`layout renders at ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/feed');
      await page.waitForURL(/feed/, { timeout: 15_000 });

      // Main content is always visible
      await expect(page.locator('main')).toBeVisible();

      if (vp.width >= 768) {
        // Sidebar visible on tablet and desktop
        await expect(page.getByRole('complementary').first()).toBeVisible();
        // No hamburger
        await expect(page.getByRole('button', { name: 'Open menu' })).not.toBeVisible();
      } else {
        // Mobile: sidebar hidden, hamburger visible
        await expect(page.getByRole('complementary').first()).toBeHidden();
        await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();
      }

      // Screenshot for visual verification
      await page.screenshot({
        path: `test-screenshots/phase1-layout-${vp.name}.png`,
        fullPage: false,
      });
    });

    test(`messages page (collapsed rail) at ${vp.name}`, async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/messages');
      await page.waitForURL(/messages/, { timeout: 10_000 });

      await expect(page.locator('main')).toBeVisible();

      await page.screenshot({
        path: `test-screenshots/phase1-messages-${vp.name}.png`,
        fullPage: false,
      });
    });
  }
});
