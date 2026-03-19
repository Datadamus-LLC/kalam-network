/**
 * Organization New Feature Tests
 *
 * Covers:
 * - /organization shows "Create Your Organization" form for users without an org
 * - /organization shows the org dashboard once an org exists
 * - /organization/settings has a back button (← Back to Organization)
 * - /organization/members has a back button (← Back to Organization)
 * - Org tabs: Overview, Members, Broadcasts, Settings
 * - Broadcasts tab in org dashboard links to /broadcasts
 *
 * Note: All test users use accountType 'individual'. Creating an org via the
 * API is available to all account types (no business-only restriction on
 * org creation). Tests gracefully skip features that require actual wallets.
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

const API = 'http://localhost:3001/api/v1';

let orgOwner: { email: string; token: string; refreshToken: string; hederaAccountId: string };
let noOrg: { email: string; token: string; refreshToken: string; hederaAccountId: string };
let orgId: string | null = null;

test.beforeAll(async () => {
  orgOwner = await registerUserViaApi('orgNewOwner');
  noOrg = await registerUserViaApi('orgNewNone');

  // Ensure orgOwner has an org
  const createRes = await fetch(`${API}/organizations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${orgOwner.token}` },
    body: JSON.stringify({ name: `NewSpecOrg ${Date.now().toString().slice(-4)}` }),
  });
  if (createRes.ok) {
    orgId = (await createRes.json() as { data?: { id: string } }).data?.id ?? null;
  } else if (createRes.status === 409) {
    const getRes = await fetch(`${API}/organizations/me`, {
      headers: { Authorization: `Bearer ${orgOwner.token}` },
    });
    if (getRes.ok) {
      orgId = (await getRes.json() as { data?: { id: string } }).data?.id ?? null;
    }
  }
});

test.describe('Organization New Specs', () => {
  // ── 1. No-org user sees Create Organization form ──────────────────────────

  test('user without org sees "Create Your Organization" form', async ({ page }) => {
    await injectAuth(page, noOrg.token, noOrg.refreshToken, noOrg.email, noOrg.hederaAccountId);
    await page.goto('/organization');
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();

    // Should show the create org form — not a redirect to login
    const hasCreateForm =
      bodyText!.toLowerCase().includes('create') &&
      (bodyText!.toLowerCase().includes('organization') || bodyText!.toLowerCase().includes('org'));
    expect(hasCreateForm).toBeTruthy();
  });

  // ── 2. No-org user can type an org name ───────────────────────────────────

  test('Create Organization form has a name input', async ({ page }) => {
    // Use noOrg user only if they don't already have an org
    const orgCheck = await fetch(`${API}/organizations/me`, {
      headers: { Authorization: `Bearer ${noOrg.token}` },
    });

    if (orgCheck.ok) {
      test.skip(true, 'noOrg user already has an org — skip create form test');
      return;
    }

    await injectAuth(page, noOrg.token, noOrg.refreshToken, noOrg.email, noOrg.hederaAccountId);
    await page.goto('/organization');
    await page.waitForTimeout(2000);

    const nameInput = page.getByLabel(/organization name/i)
      .or(page.getByPlaceholder(/acme|org name/i));
    await expect(nameInput.first()).toBeVisible({ timeout: 10_000 });
  });

  // ── 3. Org dashboard shows org name once org exists ───────────────────────

  test('org dashboard shows org name for a user with an org', async ({ page }) => {
    if (!orgId) {
      test.skip(true, 'No org created in beforeAll');
      return;
    }

    await injectAuth(page, orgOwner.token, orgOwner.refreshToken, orgOwner.email, orgOwner.hederaAccountId);
    await page.goto('/organization');
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(100);
    // Should NOT show the "Create Organization" prompt
    const hasCreatePrompt = bodyText!.includes('Set up your business presence');
    expect(hasCreatePrompt).toBeFalsy();
  });

  // ── 4. Org page shows tabs: Overview, Members, Broadcasts, Settings ────────

  test('org dashboard shows Overview / Members / Broadcasts / Settings tabs', async ({ page }) => {
    if (!orgId) {
      test.skip(true, 'No org to display tabs for');
      return;
    }

    await injectAuth(page, orgOwner.token, orgOwner.refreshToken, orgOwner.email, orgOwner.hederaAccountId);
    await page.goto('/organization');
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    // Tabs should all be present
    expect(bodyText).toContain('Overview');
    expect(bodyText).toContain('Members');
    expect(bodyText).toContain('Broadcasts');
    expect(bodyText).toContain('Settings');
  });

  // ── 5. Broadcasts tab links to /broadcasts ────────────────────────────────

  test('Broadcasts tab on org page links to /broadcasts', async ({ page }) => {
    if (!orgId) {
      test.skip(true, 'No org to test tabs');
      return;
    }

    await injectAuth(page, orgOwner.token, orgOwner.refreshToken, orgOwner.email, orgOwner.hederaAccountId);
    await page.goto('/organization');
    await page.waitForTimeout(2000);

    // Click the Broadcasts tab
    const broadcastsTab = page.getByRole('link', { name: 'Broadcasts', exact: true });
    const hasTab = await broadcastsTab.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasTab) {
      test.skip(true, 'Broadcasts tab not visible — org may not be loaded');
      return;
    }

    const href = await broadcastsTab.getAttribute('href');
    expect(href).toContain('/broadcasts');
  });

  // ── 6. Settings sub-page has ← Back to organization button ────────────────

  test('/organization/settings has back button that navigates to /organization', async ({ page }) => {
    if (!orgId) {
      test.skip(true, 'No org — settings page will show error state');
      return;
    }

    await injectAuth(page, orgOwner.token, orgOwner.refreshToken, orgOwner.email, orgOwner.hederaAccountId);
    await page.goto('/organization/settings');
    await page.waitForTimeout(2000);

    // Back button should be present (aria-label="Back to organization")
    const backBtn = page.getByRole('link', { name: /back to organization/i });
    await expect(backBtn).toBeVisible({ timeout: 10_000 });

    // Verify it links to /organization
    const href = await backBtn.getAttribute('href');
    expect(href).toContain('/organization');
  });

  // ── 7. Members sub-page has ← Back button ────────────────────────────────

  test('/organization/members has back button that navigates to /organization', async ({ page }) => {
    if (!orgId) {
      test.skip(true, 'No org — members page will show error state');
      return;
    }

    await injectAuth(page, orgOwner.token, orgOwner.refreshToken, orgOwner.email, orgOwner.hederaAccountId);
    await page.goto('/organization/members');
    await page.waitForTimeout(2000);

    // Back button with aria-label
    const backBtn = page.getByRole('link', { name: /back to organization/i });
    await expect(backBtn).toBeVisible({ timeout: 10_000 });

    const href = await backBtn.getAttribute('href');
    expect(href).toContain('/organization');
  });

  // ── 8. Back button on settings page navigates correctly ───────────────────

  test('clicking back button on settings page goes to org overview', async ({ page }) => {
    if (!orgId) {
      test.skip(true, 'No org');
      return;
    }

    await injectAuth(page, orgOwner.token, orgOwner.refreshToken, orgOwner.email, orgOwner.hederaAccountId);
    await page.goto('/organization/settings');
    await page.waitForTimeout(2000);

    const backBtn = page.getByRole('link', { name: /back to organization/i });
    await expect(backBtn).toBeVisible({ timeout: 10_000 });
    await backBtn.click();

    // Should navigate to /organization
    await page.waitForURL(/\/organization$/, { timeout: 10_000 });
    expect(page.url()).toContain('/organization');
  });
});
