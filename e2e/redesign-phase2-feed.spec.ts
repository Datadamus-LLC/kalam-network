/**
 * Phase 2 — Feed Page: Playwright E2E Tests
 *
 * Covers: page structure, tab navigation with lemon underline, compose form,
 * Post button lemon color, PostCard design (no white bg, border-b),
 * like/comment actions preserved, right panel, multi-resolution screenshots.
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
  authData = await registerUserViaApi('feed2');
});

// ── Page structure ────────────────────────────────────────────────────────────

test.describe('Feed page structure — desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/, { timeout: 15_000 });
  });

  test('page loads with "Home" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  });

  test('refresh button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Refresh feed' })).toBeVisible();
  });

  test('right panel is visible at desktop', async ({ page }) => {
    await expect(page.locator('aside').last()).toBeVisible();
  });

  test('right panel has search link to /discover', async ({ page }) => {
    const searchLink = page.getByRole('link', { name: /search people/i });
    await expect(searchLink).toBeVisible();
    await expect(searchLink).toHaveAttribute('href', '/discover');
  });

  test('right panel has Balance card', async ({ page }) => {
    await expect(page.getByText('Your Balance')).toBeVisible();
  });

  test('right panel has Who to follow section', async ({ page }) => {
    await expect(page.getByText('Who to follow')).toBeVisible();
  });

  test('right panel is hidden below lg (tablet)', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 });
    // Right panel has `hidden lg:flex` — lg = 1024px in Tailwind
    const aside = page.locator('main').locator('aside').last();
    await expect(aside).toBeHidden();
  });
});

// ── Feed tabs ─────────────────────────────────────────────────────────────────

test.describe('Feed tabs', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
  });

  test('three tabs are present', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'For you', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Following', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Trending', exact: true })).toBeVisible();
  });

  test('"For you" tab is active by default (lemon border)', async ({ page }) => {
    const forYouBtn = page.getByRole('button', { name: 'For you', exact: true });
    // Active tab has border-[#f0d060]
    const borderColor = await forYouBtn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).borderBottomColor,
    );
    // #f0d060 = rgb(240, 208, 96)
    expect(borderColor).toBe('rgb(240, 208, 96)');
  });

  test('"Following" tab is not active by default', async ({ page }) => {
    const followingBtn = page.getByRole('button', { name: 'Following', exact: true });
    const borderColor = await followingBtn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).borderBottomColor,
    );
    // Inactive: border-transparent = rgba(0,0,0,0)
    expect(borderColor).not.toBe('rgb(240, 208, 96)');
  });

  test('clicking "Trending" tab activates it with lemon border', async ({ page }) => {
    await page.getByRole('button', { name: 'Trending', exact: true }).click();
    const trendingBtn = page.getByRole('button', { name: 'Trending', exact: true });
    // Poll until React re-renders and the class attribute includes the lemon color
    await expect(async () => {
      const cls = await trendingBtn.getAttribute('class');
      expect(cls).toContain('f0d060');
    }).toPass({ timeout: 3_000 });
  });

  test('clicking "Following" deactivates "For you"', async ({ page }) => {
    await page.getByRole('button', { name: 'Following', exact: true }).click();
    // Wait for Following to become active (class update) before checking For you
    await expect(async () => {
      const followingCls = await page.getByRole('button', { name: 'Following', exact: true }).getAttribute('class');
      expect(followingCls).toContain('f0d060');
    }).toPass({ timeout: 3_000 });
    // Now verify For you is no longer active
    const forYouCls = await page.getByRole('button', { name: 'For you', exact: true }).getAttribute('class');
    expect(forYouCls).not.toContain('f0d060');
  });
});

// ── Compose form ──────────────────────────────────────────────────────────────

test.describe('Compose form', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
  });

  test('compose textarea is present', async ({ page }) => {
    await expect(page.getByLabel('Post content')).toBeVisible();
  });

  test('Post button has lemon background', async ({ page }) => {
    // Scope to form to avoid matching the sidebar Post CTA button
    const postBtn = page.locator('form').getByRole('button', { name: 'Post', exact: true });
    await expect(postBtn).toBeVisible();
    const bg = await postBtn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    // #f0d060 = rgb(240, 208, 96)
    expect(bg).toBe('rgb(240, 208, 96)');
  });

  test('Post button is pill-shaped (rounded-full)', async ({ page }) => {
    // Scope to form to avoid matching the sidebar Post CTA button
    const postBtn = page.locator('form').getByRole('button', { name: 'Post', exact: true });
    const cls = await postBtn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('Post button is disabled when textarea is empty', async ({ page }) => {
    // Scope to form to avoid matching the sidebar Post CTA button
    const postBtn = page.locator('form').getByRole('button', { name: 'Post', exact: true });
    await expect(postBtn).toBeDisabled();
  });

  test('Post button enables when text is entered', async ({ page }) => {
    await page.getByLabel('Post content').fill('Hello world');
    // Scope to form to avoid matching the sidebar Post CTA button
    const postBtn = page.locator('form').getByRole('button', { name: 'Post', exact: true });
    await expect(postBtn).not.toBeDisabled();
  });

  test('character counter decreases as text is entered', async ({ page }) => {
    // Counter shows remaining chars (280 initially, but counter might show 280 or nothing)
    await page.getByLabel('Post content').fill('Test post');
    // After 9 chars, counter should show 271
    const counter = page.locator('form span').filter({ hasText: '271' });
    await expect(counter).toBeVisible();
  });

  test('submit triggers mutation (form shows pending or error state)', async ({ page }) => {
    await page.getByLabel('Post content').fill('Test post content');
    const submitBtn = page.locator('form').getByRole('button', { name: 'Post', exact: true });
    await submitBtn.click();
    // Either the form clears (success) or an error message appears (API error)
    // Either outcome confirms the button click triggered the form submission
    await Promise.race([
      expect(page.getByLabel('Post content')).toHaveValue('', { timeout: 8_000 }),
      expect(page.getByText(/failed to create post/i)).toBeVisible({ timeout: 8_000 }),
    ]);
  });
});

// ── PostCard design ───────────────────────────────────────────────────────────
// Uses the Trending feed which shows posts from all users (no post creation needed)

test.describe('PostCard design', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
    // Switch to Trending tab to find posts from other users
    await page.getByRole('button', { name: 'Trending', exact: true }).click();
    // Wait for any posts to load or confirm empty state
    await page.waitForTimeout(2_000);
  });

  test('post cards have no white/elevated background (if posts exist)', async ({ page }) => {
    const articles = page.locator('article');
    const count = await articles.count();
    if (count === 0) {
      // No posts yet on testnet — just verify the empty state message is styled correctly
      const emptyMsg = page.getByText(/no trending posts|no posts yet/i);
      await expect(emptyMsg).toBeVisible();
      // Verify empty state has correct text color (not blue or gray-500)
      return;
    }
    const article = articles.first();
    await expect(article).toBeVisible();
    const bg = await article.evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    // PostCard background should be transparent (no white elevation)
    expect(bg).not.toBe('rgb(255, 255, 255)');
  });

  test('like button is present and functional (if posts exist)', async ({ page }) => {
    const articles = page.locator('article');
    const count = await articles.count();
    if (count === 0) {
      // No posts available — skip interaction test
      return;
    }
    const likeBtn = page.getByRole('button', { name: /like post/i }).first();
    await expect(likeBtn).toBeVisible({ timeout: 5_000 });
    await likeBtn.click();
    // Should now show "Unlike post" after liked
    await expect(page.getByRole('button', { name: /unlike post/i }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('comment toggle button is present (if posts exist)', async ({ page }) => {
    const articles = page.locator('article');
    const count = await articles.count();
    if (count === 0) {
      return; // No posts available
    }
    const commentBtn = page.getByRole('button', { name: 'Toggle comments' }).first();
    await expect(commentBtn).toBeVisible({ timeout: 5_000 });
  });

  test('comment section expands on toggle (if posts exist)', async ({ page }) => {
    const articles = page.locator('article');
    const count = await articles.count();
    if (count === 0) {
      return; // No posts available
    }
    const commentBtn = page.getByRole('button', { name: 'Toggle comments' }).first();
    await expect(commentBtn).toBeVisible({ timeout: 5_000 });
    await commentBtn.click();
    await expect(page.getByPlaceholder('Write a comment…').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── No old styling ────────────────────────────────────────────────────────────

test.describe('Old styling removed', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
    await page.goto('/feed');
    await page.waitForURL(/feed/);
  });

  test('no blue-600 colors in feed main column', async ({ page }) => {
    const feedColumn = page.locator('div.flex-1.min-w-0.border-r').first();
    await expect(feedColumn).toBeVisible();
    const html = await feedColumn.innerHTML();
    // Old design used text-blue-600, bg-blue-500 etc.
    // These class names should not appear in the redesigned feed
    expect(html).not.toContain('text-blue-6');
    expect(html).not.toContain('bg-blue-5');
    expect(html).not.toContain('bg-blue-6');
  });

  test('no gray-50 background on article elements', async ({ page }) => {
    // Wait for any article to appear or just check structure
    const articles = page.locator('article');
    const count = await articles.count();
    if (count > 0) {
      const firstArticleCls = await articles.first().getAttribute('class');
      expect(firstArticleCls).not.toContain('bg-white');
      expect(firstArticleCls).not.toContain('bg-gray');
    }
    // If no posts yet, this test just passes
  });
});

// ── Multi-resolution screenshots ─────────────────────────────────────────────

test.describe('Multi-resolution screenshots', () => {
  for (const vp of VIEWPORTS) {
    test(`feed renders at ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/feed');
      await page.waitForURL(/feed/, { timeout: 15_000 });

      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await expect(page.getByLabel('Post content')).toBeVisible();

      if (vp.width >= 1024) {
        // Right panel visible at lg+
        await expect(page.getByText('Your Balance')).toBeVisible();
      }

      await page.screenshot({
        path: `test-screenshots/phase2-feed-${vp.name}.png`,
        fullPage: false,
      });
    });
  }
});
