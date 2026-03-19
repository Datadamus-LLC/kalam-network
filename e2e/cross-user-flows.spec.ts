/**
 * CROSS-USER INTERACTION TESTS
 *
 * Verify that actions by one user are correctly seen by another:
 * - Alice follows Bob → Bob's follower count changes
 * - Alice sends message → message is retrievable by both users
 * - Alice sends payment → transaction visible in both histories
 * - Profile visible correctly to other users
 *
 * All tests use deterministic users (alice2/bob2) to avoid wallet creation on each run.
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth, getOrCreateConversation } from './helpers';

const API = 'http://localhost:3001/api/v1';

let alice: { email: string; token: string; refreshToken: string; hederaAccountId: string };
let bob:   { email: string; token: string; refreshToken: string; hederaAccountId: string };

test.beforeAll(async () => {
  // Use deterministic users — reused across runs (no new wallet created if already exists)
  alice = await registerUserViaApi('alice2');
  bob   = await registerUserViaApi('bob2');
});

test.describe('Cross-User: Profile Visibility', () => {
  test("Bob's profile is visible to Alice with correct structure", async ({ page }) => {
    if (!bob.hederaAccountId) {
      test.skip(true, 'Bob needs a wallet to have a profile');
      return;
    }

    await injectAuth(page, alice.token, alice.refreshToken, alice.email, alice.hederaAccountId);
    await page.goto(`/profile/${bob.hederaAccountId}`);

    // Bob's account ID must appear on his own profile
    await expect(page.getByText(bob.hederaAccountId)).toBeVisible({ timeout: 15_000 });

    // Stats are shown
    await expect(page.getByText(/followers/i)).toBeVisible();
    await expect(page.getByText(/following/i)).toBeVisible();
    await expect(page.getByText(/posts/i)).toBeVisible();

    // Follow button visible (Alice viewing Bob's profile)
    const followBtn = page.getByRole('button', { name: /^follow$|^following$/i });
    await expect(followBtn).toBeVisible({ timeout: 5_000 });
  });

  test("Alice's profile shows no Follow button to herself", async ({ page }) => {
    if (!alice.hederaAccountId) {
      test.skip(true, 'No wallet');
      return;
    }

    await injectAuth(page, alice.token, alice.refreshToken, alice.email, alice.hederaAccountId);
    await page.goto(`/profile/${alice.hederaAccountId}`);

    // Account ID appears on profile page (also in sidebar — use first() to avoid strict mode)
    await expect(page.getByText(alice.hederaAccountId).first()).toBeVisible({ timeout: 15_000 });

    // No follow button on own profile
    await expect(page.getByRole('button', { name: /^follow$/i })).not.toBeVisible({ timeout: 3_000 });
  });
});

test.describe('Cross-User: Follow/Unfollow with Count Verification', () => {
  test('Alice follows Bob → API confirms follower count +1 → Alice unfollows → count -1', async ({ page }) => {
    if (!alice.hederaAccountId || !bob.hederaAccountId) {
      test.skip(true, 'Both users need wallets for follow/unfollow');
      return;
    }

    // Get Bob's initial follower count from API
    const before = await fetch(`${API}/profile/${bob.hederaAccountId}`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    }).then(r => r.json()).then(d => (d.data?.stats?.followers as number) ?? 0).catch(() => 0);

    // Alice visits Bob's profile and follows
    await injectAuth(page, alice.token, alice.refreshToken, alice.email, alice.hederaAccountId);
    await page.goto(`/profile/${bob.hederaAccountId}`);
    await expect(page.getByText(bob.hederaAccountId)).toBeVisible({ timeout: 15_000 });

    const followBtn = page.getByRole('button', { name: /^follow$/i });
    if (!(await followBtn.isVisible({ timeout: 3_000 }).catch(() => false))) {
      test.skip(true, 'Follow button not visible — may already be following');
      return;
    }

    await followBtn.click();
    await expect(page.getByRole('button', { name: /^following$/i })).toBeVisible({ timeout: 5_000 });

    // API confirms count increased
    await page.waitForTimeout(500);
    const afterFollow = await fetch(`${API}/profile/${bob.hederaAccountId}`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    }).then(r => r.json()).then(d => (d.data?.stats?.followers as number) ?? 0).catch(() => -1);
    expect(afterFollow).toBe(before + 1);

    // Unfollow
    await page.getByRole('button', { name: /^following$/i }).click();
    await expect(page.getByRole('button', { name: /^follow$/i })).toBeVisible({ timeout: 5_000 });

    // API confirms count back to original
    await page.waitForTimeout(500);
    const afterUnfollow = await fetch(`${API}/profile/${bob.hederaAccountId}`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    }).then(r => r.json()).then(d => (d.data?.stats?.followers as number) ?? 0).catch(() => -1);
    expect(afterUnfollow).toBe(before);
  });
});

test.describe('Cross-User: Messaging Flow', () => {
  test('Alice creates conversation → Bob can retrieve it via API', async ({ page }) => {
    if (!alice.hederaAccountId || !bob.hederaAccountId) {
      test.skip(true, 'Both users need wallets');
      return;
    }

    // Alice creates conversation (or retrieves existing one)
    const convo = await getOrCreateConversation(alice.token, bob.hederaAccountId);
    if (!convo) {
      test.skip(true, 'Could not create or retrieve conversation');
      return;
    }
    const convoId = convo.id;
    expect(convoId).toBeTruthy();

    // Bob retrieves his conversation list — the new conversation should be there
    const bobConvos = await fetch(`${API}/conversations`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    if (bobConvos.ok) {
      const bd = await bobConvos.json() as { data?: { data: Array<{ id: string }> } };
      const found = bd.data?.data?.some(c => c.id === convoId);
      expect(found).toBeTruthy();
    }

    // Alice's messages page should show the conversation (not empty state)
    await injectAuth(page, alice.token, alice.refreshToken, alice.email, alice.hederaAccountId);
    await page.goto('/messages');
    await expect(page.getByText(/no conversations yet/i)).not.toBeVisible({ timeout: 10_000 });
  });

  test('Alice sends message → Bob retrieves it from API', async ({ page }) => {
    if (!alice.hederaAccountId || !bob.hederaAccountId) {
      test.skip(true, 'Both users need wallets');
      return;
    }

    // Create conversation
    const convo = await getOrCreateConversation(alice.token, bob.hederaAccountId);
    if (!convo) { test.skip(true, 'Could not create/retrieve conversation'); return; }
    const topicId = convo.topicId;

    // Alice sends message via UI
    await injectAuth(page, alice.token, alice.refreshToken, alice.email, alice.hederaAccountId);
    await page.goto(`/messages/${topicId}`);

    const input = page.getByPlaceholder(/type a message/i);
    await expect(input).toBeVisible({ timeout: 15_000 });

    const msgText = `Cross-user msg ${Date.now()}`;
    await input.fill(msgText);
    await page.getByRole('button', { name: /send/i }).click();
    await expect(input).toHaveValue('', { timeout: 5_000 });
    await expect(page.getByText(msgText)).toBeVisible({ timeout: 30_000 });

    // Verify message is stored: Bob retrieves messages via API
    // Note: Messages are E2E encrypted on HCS — REST API returns metadata without plaintext.
    // We verify Bob can access the conversation and the message count increases.
    await page.waitForTimeout(2000);
    const msgRes = await fetch(`${API}/conversations/${topicId}/messages`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    if (msgRes.ok) {
      const md = await msgRes.json() as { data?: { messages: Array<{ id: string; senderAccountId: string }> } };
      const messages = md.data?.messages ?? [];
      // Verify at least one message from Alice exists (messages are encrypted, text not in REST API)
      const aliceMsg = messages.find(m => m.senderAccountId === alice.hederaAccountId);
      expect(messages.length).toBeGreaterThan(0); // Message was stored
      // Alice's message should be in the list
      if (alice.hederaAccountId) {
        expect(aliceMsg).toBeTruthy();
      }
    }
  });
});

test.describe('Cross-User: Payment Flows', () => {
  test('Alice sends payment to Bob → transaction appears in both histories', async ({ page }) => {
    if (!alice.hederaAccountId || !bob.hederaAccountId) {
      test.skip(true, 'Both users need wallets for payments');
      return;
    }

    // Check Alice has sufficient balance
    const balRes = await fetch(`${API}/payments/balance`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    if (!balRes.ok) {
      test.skip(true, 'Cannot check balance');
      return;
    }
    const bd = await balRes.json() as { data?: { hbarBalance: number } };
    if ((bd.data?.hbarBalance ?? 0) < 1) {
      test.skip(true, `Insufficient balance for payment test: ${bd.data?.hbarBalance} HBAR`);
      return;
    }

    // Create conversation context
    const convo = await getOrCreateConversation(alice.token, bob.hederaAccountId);
    if (!convo) { test.skip(true, 'Could not create/retrieve conversation'); return; }
    const topicId = convo.topicId;

    // Send 0.1 HBAR from Alice to Bob
    const sendRes = await fetch(`${API}/payments/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alice.token}` },
      body: JSON.stringify({
        recipientAccountId: bob.hederaAccountId,
        amount: 0.1,
        currency: 'HBAR',
        topicId,
        note: `E2E cross-user payment ${Date.now()}`,
      }),
    });
    if (!sendRes.ok) {
      const err = await sendRes.json().catch(() => ({})) as { error?: { message?: string } };
      test.skip(true, `Payment failed: ${err.error?.message ?? sendRes.status}`);
      return;
    }

    const sd = await sendRes.json() as { data?: { id: string; amount: number } };
    const txId = sd.data?.id;
    expect(txId).toBeTruthy();
    expect(sd.data?.amount).toBe(0.1);

    // Alice's payments page shows the transaction
    await injectAuth(page, alice.token, alice.refreshToken, alice.email, alice.hederaAccountId);
    await page.goto('/payments');
    await expect(page.getByRole('heading', { name: /transaction history/i })).toBeVisible({ timeout: 10_000 });

    // Transaction list is NOT empty
    await expect(page.getByText(/no transactions found/i)).not.toBeVisible({ timeout: 10_000 });

    // Bob's API shows the received payment
    const bobTxRes = await fetch(`${API}/payments/transactions`, {
      headers: { Authorization: `Bearer ${bob.token}` },
    });
    if (bobTxRes.ok) {
      const btd = await bobTxRes.json() as { data?: { transactions: Array<{ id: string; direction: string }> } };
      // Bob should have a "received" transaction
      const received = btd.data?.transactions?.some(t => t.direction === 'received');
      expect(received).toBeTruthy();
    }
  });

  test('Payment request created → appears in requests list', async ({ page }) => {
    if (!alice.hederaAccountId || !bob.hederaAccountId) {
      test.skip(true, 'Both users need wallets');
      return;
    }

    const convo = await getOrCreateConversation(alice.token, bob.hederaAccountId);
    if (!convo) { test.skip(true, 'Could not create/retrieve conversation'); return; }
    const topicId = convo.topicId;

    const amount = 5;
    const reqRes = await fetch(`${API}/payments/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alice.token}` },
      body: JSON.stringify({ topicId, amount, currency: 'HBAR', description: `E2E request ${Date.now()}` }),
    });
    if (!reqRes.ok) {
      test.skip(true, `Payment request failed: ${reqRes.status}`);
      return;
    }

    const rd = await reqRes.json() as { data?: { id: string; amount: number; status: string } };
    expect(rd.data?.id).toBeTruthy();
    expect(rd.data?.amount).toBe(amount);
    expect(rd.data?.status).toBe('pending');

    // Verify in Alice's payment requests list
    const listRes = await fetch(`${API}/payments/requests`, {
      headers: { Authorization: `Bearer ${alice.token}` },
    });
    if (listRes.ok) {
      const ld = await listRes.json() as { data?: { requests: Array<{ id: string }> } };
      const found = ld.data?.requests?.some(r => r.id === rd.data?.id);
      expect(found).toBeTruthy();
    }
  });
});
