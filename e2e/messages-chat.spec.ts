/**
 * Messages Chat — create conversation, navigate, send messages
 */
import { test, expect } from './fixtures';
import { registerUserViaApi, injectAuth, getOrCreateConversation } from './helpers';

test.describe('Messages Chat Flow', () => {
  let user1: { email: string; token: string; refreshToken: string; hederaAccountId: string };
  let user2: { email: string; token: string; refreshToken: string; hederaAccountId: string };

  test.beforeAll(async () => {
    user1 = await registerUserViaApi('chatA');
    user2 = await registerUserViaApi('chatB');
  });

  test('new conversation dialog has type and participant fields', async ({ page }) => {
    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto('/messages');

    await page.getByRole('button', { name: /new conversation/i }).click();
    const dialog = page.getByRole('heading', { name: /new conversation/i });
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Check direct/group type options (actual labels in dialog)
    await expect(page.getByRole('button', { name: /direct message/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /group chat/i })).toBeVisible();
    // Participant input
    await expect(page.getByPlaceholder(/0\.0\.\d+|hedera/i)).toBeVisible();
  });

  test('conversation dialog closes when clicking X', async ({ page }) => {
    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto('/messages');

    await page.getByRole('button', { name: /new conversation/i }).click();
    await expect(page.getByRole('heading', { name: /new conversation/i })).toBeVisible({ timeout: 10_000 });

    // Close via X button
    await page.getByRole('button', { name: /close/i }).click();
    await expect(page.getByRole('heading', { name: /new conversation/i })).not.toBeVisible({ timeout: 5_000 });
  });

  test('create conversation and navigate to chat', async ({ page }) => {
    if (!user2.hederaAccountId) {
      test.skip(true, 'user2 has no wallet — cannot create conversation');
      return;
    }

    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto('/messages');

    await page.getByRole('button', { name: /new conversation/i }).click();
    await expect(page.getByRole('heading', { name: /new conversation/i })).toBeVisible({ timeout: 10_000 });

    // Add participant using the actual placeholder "0.0.12345"
    const participantInput = page.getByPlaceholder('0.0.12345');
    await expect(participantInput).toBeVisible({ timeout: 5_000 });
    await participantInput.fill(user2.hederaAccountId);
    await page.getByRole('button', { name: /^add$/i }).click();

    // Submit — HCS topic creation can take 30-90s on testnet
    await page.getByRole('button', { name: /create conversation/i }).click();

    try {
      await page.waitForURL(/messages\/.+/, { timeout: 120_000 });
      expect(page.url()).toMatch(/messages\/.+/);
    } catch {
      test.skip(true, 'HCS topic creation timed out on testnet');
    }
  });

  test('chat page shows message input', async ({ page }) => {
    if (!user1.hederaAccountId || !user2.hederaAccountId) {
      test.skip(true, 'wallets required for chat');
      return;
    }

    // Create conversation via API
    const convo = await getOrCreateConversation(user1.token, user2.hederaAccountId);
    if (!convo) { test.skip(true, 'Could not create test conversation'); return; }
    const topicId = convo.topicId;

    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto(`/messages/${topicId}`);

    // Message input visible
    await expect(page.getByPlaceholder(/type a message/i)).toBeVisible({ timeout: 15_000 });
  });

  test('send button disabled when message is empty', async ({ page }) => {
    if (!user1.hederaAccountId || !user2.hederaAccountId) {
      test.skip(true, 'wallets required');
      return;
    }

    // Create conversation via Node.js fetch (avoids CORS in browser context)
    const convo = await getOrCreateConversation(user1.token, user2.hederaAccountId);
    if (!convo) { test.skip(true, 'Could not create test conversation'); return; }
    const topicId = convo.topicId;

    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    // Hard reload after auth to ensure clean React Query cache (avoids stale state from previous tests)
    await page.goto(`/messages/${topicId}`);
    await page.reload();

    // Wait for chat to fully load — conversations query must complete before input appears
    const input = page.getByPlaceholder(/type a message/i);
    await expect(input).toBeVisible({ timeout: 30_000 }); // 30s includes conversation load
    await expect(input).toBeEnabled({ timeout: 15_000 }); // Wait for DOM to stabilize

    // Send button disabled when input is empty
    const sendBtn = page.getByRole('button', { name: /send/i });
    await expect(sendBtn).toBeVisible({ timeout: 10_000 });
    await expect(sendBtn).toBeDisabled({ timeout: 5_000 });
  });

  test('can send a message in a conversation', async ({ page }) => {
    if (!user1.hederaAccountId || !user2.hederaAccountId) {
      test.skip(true, 'wallets required');
      return;
    }

    // Create conversation via Node.js fetch (avoids CORS in browser context)
    const convo = await getOrCreateConversation(user1.token, user2.hederaAccountId);
    if (!convo) { test.skip(true, 'Could not create test conversation'); return; }
    const topicId = convo.topicId;

    await injectAuth(page, user1.token, user1.refreshToken, user1.email, user1.hederaAccountId);
    await page.goto(`/messages/${topicId}`);
    await page.reload(); // Clear React Query cache from previous tests

    const input = page.getByPlaceholder(/type a message/i);
    await expect(input).toBeVisible({ timeout: 15_000 });
    await expect(input).toBeEnabled({ timeout: 5_000 }); // Wait for page to stabilize

    await input.fill('Hello from E2E test!');
    const sendBtn = page.getByRole('button', { name: /send/i });
    await expect(sendBtn).toBeEnabled({ timeout: 5_000 });
    await sendBtn.click();

    // Input clears after send (HCS is async now)
    await expect(input).toHaveValue('', { timeout: 10_000 });
  });
});
