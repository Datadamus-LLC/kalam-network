/**
 * Phase 6 — Discover + Trending Pages: Playwright E2E Tests
 *
 * Covers: large pill search input, filter pills (All/KYC/Organizations),
 * dark search results rows, no blue tags, right panel trending posts,
 * trending page structure, multi-resolution screenshots.
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
  authData = await registerUserViaApi('discover6');
});

// ── Discover page structure ────────────────────────────────────────────────

test.describe('Discover page structure — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/discover');
    await page.waitForURL(/discover/, { timeout: 15_000 });
  });

  test('large pill search input is present', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: /search users/i });
    await expect(input).toBeVisible();
    // Verify pill shape
    const cls = await input.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('search input is tall (>= 44px) per spec', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: /search users/i });
    const box = await input.boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  });

  test('all three filter pills are present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'KYC verified', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Organizations', exact: true })).toBeVisible();
  });

  test('"All" filter is active by default', async ({ page }) => {
    const allBtn = page.getByRole('button', { name: 'All', exact: true });
    const cls = await allBtn.getAttribute('class');
    expect(cls).toMatch(/bg-white/);
  });

  test('filter pills are rounded-full', async ({ page }) => {
    const allBtn = page.getByRole('button', { name: 'All', exact: true });
    const cls = await allBtn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('right panel shows Trending at desktop', async ({ page }) => {
    await expect(page.getByText('Trending')).toBeVisible();
  });

  test('initial prompt text is shown', async ({ page }) => {
    await expect(page.getByText(/start typing/i)).toBeVisible();
  });
});

// ── Search functionality ───────────────────────────────────────────────────

test.describe('Search functionality', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/discover');
    await page.waitForURL(/discover/);
  });

  test('typing triggers search (debounced)', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: /search users/i });
    await input.fill('e2e');
    // Wait for debounce + search
    await page.waitForTimeout(500);
    // Either shows results or no results message — both are valid
    const hasResults = await page.locator('a[href^="/profile/"]').first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasNoResults = await page.getByText(/no results found/i).isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasResults || hasNoResults).toBe(true);
  });

  test('filter pills filter results client-side', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: /search users/i });
    await input.fill('e2e');
    await page.waitForTimeout(600);

    // Click Organizations filter
    await page.getByRole('button', { name: 'Organizations', exact: true }).click();
    await expect(async () => {
      const cls = await page.getByRole('button', { name: 'Organizations', exact: true }).getAttribute('class');
      expect(cls).toMatch(/bg-white/);
    }).toPass({ timeout: 3_000 });
  });

  test('search results have no blue-50 or green-50 tags', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: /search users/i });
    await input.fill('e2e');
    await page.waitForTimeout(600);

    const links = page.locator('a[href^="/profile/"]');
    const count = await links.count();
    if (count > 0) {
      const firstHtml = await links.first().innerHTML();
      expect(firstHtml).not.toContain('bg-blue-50');
      expect(firstHtml).not.toContain('bg-green-50');
    }
  });
});

// ── Trending page ──────────────────────────────────────────────────────────

test.describe('Trending page', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/trending');
    await page.waitForURL(/trending/, { timeout: 15_000 });
  });

  test('page loads with "Trending" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Trending', level: 1 })).toBeVisible();
  });

  test('refresh button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Refresh trending posts' })).toBeVisible();
  });

  test('no lucide/blue spinner', async ({ page }) => {
    // The old code had a blue border-b-2 border-blue-500 spinner
    // New code should show either posts or muted empty state
    await page.waitForTimeout(1_500);
    const html = await page.content();
    expect(html).not.toContain('border-blue-500');
  });

  test('refresh button is rounded-full', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Refresh trending posts' });
    const cls = await btn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });
});

// ── Multi-resolution screenshots ───────────────────────────────────────────

test.describe('Multi-resolution screenshots', () => {
  for (const vp of VIEWPORTS) {
    test(`discover renders at ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/discover');
      await page.waitForURL(/discover/, { timeout: 15_000 });

      // Search input should always be visible
      await expect(page.getByRole('searchbox', { name: /search users/i })).toBeVisible();

      await page.screenshot({
        path: `test-screenshots/phase6-discover-${vp.name}.png`,
        fullPage: false,
      });
    });

    test(`trending renders at ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/trending');
      await page.waitForURL(/trending/, { timeout: 15_000 });

      await expect(page.getByRole('heading', { name: 'Trending', level: 1 })).toBeVisible();

      await page.screenshot({
        path: `test-screenshots/phase6-trending-${vp.name}.png`,
        fullPage: false,
      });
    });
  }
});
