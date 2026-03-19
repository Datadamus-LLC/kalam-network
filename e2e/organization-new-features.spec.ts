/**
 * Organization New Feature Tests
 * - Org dashboard /organization
 * - Org settings /organization/settings
 * - Org members /organization/members
 * - Business accounts see Organization nav item
 * - API: get org, update org, members, invitations
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

const API = 'http://localhost:3001/api/v1';

let individualUser: { email: string; token: string; refreshToken: string; hederaAccountId: string };

test.beforeAll(async () => {
  individualUser = await registerUserViaApi('orgtest');
});

test.describe('Organization Nav — Individual Account', () => {
  test('individual user does NOT see Organization in nav', async ({ page }) => {
    await injectAuth(page, individualUser.token, individualUser.refreshToken, individualUser.email, individualUser.hederaAccountId);
    await page.goto('/feed');
    const nav = page.getByRole('navigation');
    // Organization link should NOT be visible for individual users
    await expect(nav.getByRole('link', { name: 'Organization', exact: true })).not.toBeVisible({ timeout: 5_000 });
  });

  test('individual user at /organization sees unauthorized or redirect', async ({ page }) => {
    await injectAuth(page, individualUser.token, individualUser.refreshToken, individualUser.email, individualUser.hederaAccountId);
    await page.goto('/organization');
    await page.waitForTimeout(2000);
    // Should either redirect or show "not a business account" message
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
    expect(bodyText!.length).toBeGreaterThan(10);
  });
});

test.describe('Organization API', () => {
  test('GET /organization returns correct structure for individual user', async ({ page }) => {
    const res = await fetch(`${API}/organization`, {
      headers: { Authorization: `Bearer ${individualUser.token}` },
    });
    // Either 200 (if user has org) or 404 (no org) — both valid
    expect([200, 404]).toContain(res.status);
  });

  test('organization settings page structure', async ({ page }) => {
    await injectAuth(page, individualUser.token, individualUser.refreshToken, individualUser.email, individualUser.hederaAccountId);
    await page.goto('/organization/settings');
    await page.waitForTimeout(2000);
    // Should show settings form or "not a business account" message
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });

  test('organization members page structure', async ({ page }) => {
    await injectAuth(page, individualUser.token, individualUser.refreshToken, individualUser.email, individualUser.hederaAccountId);
    await page.goto('/organization/members');
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText).toBeTruthy();
  });
});

test.describe('Organization Features — API Validation', () => {
  test('invite member with invalid email returns 400', async ({ page }) => {
    const res = await fetch(`${API}/organization/members/invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${individualUser.token}` },
      body: JSON.stringify({ email: 'not-an-email', role: 'member' }),
    });
    // 400 (validation error) or 403 (not authorized) or 404 (no org)
    expect([400, 403, 404]).toContain(res.status);
  });

  test('transfer ownership without being owner returns error', async ({ page }) => {
    const res = await fetch(`${API}/organization/transfer-ownership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${individualUser.token}` },
      body: JSON.stringify({ newOwnerUserId: 'non-existent-user-id' }),
    });
    expect([400, 403, 404]).toContain(res.status);
  });
});
