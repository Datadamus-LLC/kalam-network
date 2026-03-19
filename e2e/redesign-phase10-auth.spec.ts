/**
 * Phase 10 — Auth Pages: Playwright E2E Tests
 *
 * Covers: landing page (logo, lemon Create Account, ghost Sign In),
 * login page (pill input, lemon Continue), register page (same pattern),
 * no old slate-800 cards, no blue buttons, multi-resolution screenshots.
 */
import { test, expect } from './fixtures';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

// ── Landing page ─────────────────────────────────────────────────────────────

test.describe('Auth landing page (/)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('/', { timeout: 10_000 });
  });

  test('shows Hedera Social wordmark', async ({ page }) => {
    await expect(page.getByText(the platform).first()).toBeVisible();
  });

  test('Create Account button exists and is pill-shaped', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: 'Create Account', exact: true });
    await expect(createBtn).toBeVisible();
    const cls = await createBtn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('Create Account button has lemon fill', async ({ page }) => {
    const createBtn = page.getByRole('button', { name: 'Create Account', exact: true });
    const bg = await createBtn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    expect(bg).toBe('rgb(240, 208, 96)');
  });

  test('Sign In button is a ghost pill (no lemon fill)', async ({ page }) => {
    const signInBtn = page.getByRole('button', { name: 'Sign In', exact: true });
    await expect(signInBtn).toBeVisible();
    const bg = await signInBtn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    // Ghost = transparent, NOT lemon
    expect(bg).not.toBe('rgb(240, 208, 96)');
    const cls = await signInBtn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('no old slate-800 card backgrounds', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toContain('bg-slate-800');
    expect(html).not.toContain('from-slate-900');
  });

  test('clicking Create Account navigates to /register', async ({ page }) => {
    await page.getByRole('button', { name: 'Create Account', exact: true }).click();
    await page.waitForURL(/register/, { timeout: 10_000 });
  });

  test('clicking Sign In navigates to /login', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await page.waitForURL(/login/, { timeout: 10_000 });
  });
});

// ── Login page ────────────────────────────────────────────────────────────────

test.describe('Login page (/login)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForURL(/login/, { timeout: 10_000 });
  });

  test('shows "Welcome back" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Welcome back', level: 1 })).toBeVisible();
  });

  test('email input is pill-shaped', async ({ page }) => {
    const input = page.getByLabel('Email Address');
    await expect(input).toBeVisible();
    const cls = await input.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('Sign In button has lemon fill', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Sign In', exact: true });
    await expect(btn).toBeVisible();
    const bg = await btn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    expect(bg).toBe('rgb(240, 208, 96)');
  });

  test('Sign In button is pill-shaped', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Sign In', exact: true });
    const cls = await btn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('Sign In button is disabled when email is empty', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Sign In', exact: true });
    await expect(btn).toBeDisabled();
  });

  test('Register link is visible', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Register' })).toBeVisible();
  });

  test('no old blue-600 button background', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toContain('bg-blue-600');
    expect(html).not.toContain('bg-slate-800');
  });
});

// ── Register page ─────────────────────────────────────────────────────────────

test.describe('Register page (/register)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register');
    await page.waitForURL(/register/, { timeout: 10_000 });
  });

  test('shows "Create your account" heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Create your account', level: 1 })).toBeVisible();
  });

  test('email input is pill-shaped', async ({ page }) => {
    const input = page.getByLabel('Email Address');
    await expect(input).toBeVisible();
    const cls = await input.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('Continue button has lemon fill', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Continue', exact: true });
    await expect(btn).toBeVisible();
    const bg = await btn.evaluate(
      (el) => getComputedStyle(el as HTMLElement).backgroundColor,
    );
    expect(bg).toBe('rgb(240, 208, 96)');
  });

  test('Continue button is pill-shaped', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Continue', exact: true });
    const cls = await btn.getAttribute('class');
    expect(cls).toMatch(/rounded-full/);
  });

  test('Continue button is disabled when email is empty', async ({ page }) => {
    const btn = page.getByRole('button', { name: 'Continue', exact: true });
    await expect(btn).toBeDisabled();
  });

  test('Continue button enables after entering email', async ({ page }) => {
    await page.getByLabel('Email Address').fill('test@example.com');
    await expect(page.getByRole('button', { name: 'Continue', exact: true })).not.toBeDisabled();
  });

  test('Log in link is visible', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  });

  test('no old blue-600 or slate-800 backgrounds', async ({ page }) => {
    const html = await page.content();
    expect(html).not.toContain('bg-blue-600');
    expect(html).not.toContain('bg-slate-800');
  });
});

// ── Multi-resolution screenshots ───────────────────────────────────────────

test.describe('Multi-resolution screenshots', () => {
  for (const vp of VIEWPORTS) {
    test(`landing at ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');
      await page.waitForURL('/');
      await expect(page.getByText(the platform).first()).toBeVisible();
      await page.screenshot({ path: `test-screenshots/phase10-auth-landing-${vp.name}.png` });
    });

    test(`login at ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');
      await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
      await page.screenshot({ path: `test-screenshots/phase10-auth-login-${vp.name}.png` });
    });

    test(`register at ${vp.name} (${vp.width}×${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/register');
      await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
      await page.screenshot({ path: `test-screenshots/phase10-auth-register-${vp.name}.png` });
    });
  }
});
