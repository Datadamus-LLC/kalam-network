/**
 * Username/Handle System E2E Tests
 *
 * Tests the @username system added in Task 2:
 * - check-username availability API
 * - Setting username via profile update
 * - Username displayed on profile page
 * - Search finds users by username
 * - Settings page has username input
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth } from './helpers';

const API = 'http://localhost:3001/api/v1';

test.describe('Username/Handle System', () => {
  let authData: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    authData = await registerUserViaApi('uhandle');
  });

  test.beforeEach(async ({ page }) => {
    await injectAuth(page, authData.token, authData.refreshToken, authData.email, authData.hederaAccountId);
  });

  test('check-username API returns available:true for unclaimed handle', async () => {
    const uniqueHandle = `testhandle${Date.now().toString(36)}`;
    const res = await fetch(`${API}/profile/check-username/${uniqueHandle}`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { data?: { available: boolean }; available?: boolean };
    const available = (body.data ?? body as unknown as { available: boolean }).available;
    expect(available).toBe(true);
  });

  test('check-username API returns available:false for invalid format (too short)', async () => {
    const res = await fetch(`${API}/profile/check-username/ab`);
    if (res.status === 200) {
      const body = await res.json() as { data?: { available: boolean }; available?: boolean };
      const available = (body.data ?? body as unknown as { available: boolean }).available;
      expect(available).toBe(false);
    } else {
      expect(res.status).toBe(400);
    }
  });

  test('check-username returns available:false for special characters', async () => {
    const res = await fetch(`${API}/profile/check-username/bad%20handle!`);
    if (res.status === 200) {
      const body = await res.json() as { data?: { available: boolean }; available?: boolean };
      const available = (body.data ?? body as unknown as { available: boolean }).available;
      expect(available).toBe(false);
    } else {
      expect([400, 404]).toContain(res.status);
    }
  });

  test('can set username via profile update API and it is stored lowercase', async () => {
    const rawUsername = `Handle${Date.now().toString(36)}`;
    const expectedLower = rawUsername.toLowerCase();

    const res = await fetch(`${API}/profile/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.token}`,
      },
      body: JSON.stringify({ username: rawUsername }),
    });
    expect(res.ok).toBe(true);

    // Fetch profile and verify username is lowercased
    const profileRes = await fetch(`${API}/profile/me`, {
      headers: { Authorization: `Bearer ${authData.token}` },
    });
    expect(profileRes.ok).toBe(true);
    const profile = await profileRes.json() as { data?: { username?: string }; username?: string };
    const username = (profile.data ?? profile as unknown as { username: string }).username;
    expect(username).toBe(expectedLower);
  });

  test('claimed username becomes unavailable', async () => {
    const claimedHandle = `claimed${Date.now().toString(36)}`;
    // Claim it
    await fetch(`${API}/profile/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.token}`,
      },
      body: JSON.stringify({ username: claimedHandle }),
    });

    // Now check availability
    const checkRes = await fetch(`${API}/profile/check-username/${claimedHandle}`);
    expect(checkRes.ok).toBe(true);
    const body = await checkRes.json() as { data?: { available: boolean }; available?: boolean };
    const available = (body.data ?? body as unknown as { available: boolean }).available;
    expect(available).toBe(false);
  });

  test('settings page has username input field', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible({ timeout: 15_000 });
    // Username input should be visible in the Profile tab
    const usernameInput = page.locator('input[id="username"], input[name="username"], input[placeholder*="username" i]').first();
    await expect(usernameInput).toBeVisible({ timeout: 10_000 });
  });

  test('profile page shows @username after it is set', async ({ page }) => {
    const profileUsername = `profile${Date.now().toString(36)}`;
    // Set via API
    await fetch(`${API}/profile/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.token}`,
      },
      body: JSON.stringify({ username: profileUsername }),
    });

    await page.goto('/profile/me');
    // The page should show @username
    await expect(page.getByText(new RegExp(`@${profileUsername}`, 'i'))).toBeVisible({ timeout: 15_000 });
  });

  test('search finds user by username', async () => {
    const searchUsername = `search${Date.now().toString(36)}`;
    // Set username
    await fetch(`${API}/profile/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authData.token}`,
      },
      body: JSON.stringify({ username: searchUsername }),
    });

    // Search by username
    const searchRes = await fetch(`${API}/profile/search?query=${searchUsername}`, {
      headers: { Authorization: `Bearer ${authData.token}` },
    });
    expect(searchRes.ok).toBe(true);
    const body = await searchRes.json() as { data?: { users?: Array<{ username?: string }> }; users?: Array<{ username?: string }> };
    const users = body.data?.users ?? (body as unknown as { users: Array<{ username?: string }> }).users ?? [];
    expect(Array.isArray(users)).toBe(true);
    const found = users.some((u) => u.username === searchUsername);
    expect(found).toBe(true);
  });
});
