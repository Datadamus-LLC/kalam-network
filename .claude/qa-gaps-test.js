#!/usr/bin/env node
/**
 * QA Test Runner — GAP-013, GAP-035, GAP-036, GAP-037
 *
 * Tests the REAL running API at localhost:3001
 * No mocks, no fakes, no stubs — real HTTP, real Redis, real Hedera, real PostgreSQL
 *
 * Coverage:
 *   GAP-035 — Conversation unread counts
 *   GAP-036 — Organization ownership transfer
 *   GAP-037 — Payment auto-expire cron
 *   GAP-013 — Business broadcast feature
 *
 * Prerequisites:
 *   - API running at localhost:3001
 *   - Redis at localhost:6382
 *   - PostgreSQL connected
 *   - Hedera testnet operator configured
 */

const http = require('http');
const net = require('net');
const crypto = require('crypto');

const BASE = 'http://localhost:3001';
const API = `${BASE}/api/v1`;
const REDIS_HOST = 'localhost';
const REDIS_PORT = 6382;
const RUN_ID = `gap-${crypto.randomBytes(4).toString('hex')}`;

// ─── Shared Test State ───
const results = [];
let user1Token = null;
let user2Token = null;
let user3Token = null;
let user1AccountId = null;
let user2AccountId = null;
let user3AccountId = null;
let user1Id = null;
let user2Id = null;
let user3Id = null;
let orgId = null;
let conversationId = null;
let conversationTopicId = null;

// ─── HTTP Helper ───
function request(method, url, body, token, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
    const parsed = new URL(fullUrl);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error(`Request timeout after ${timeoutMs}ms`)); });
    req.on('error', reject);
    if (body && method !== 'GET' && method !== 'HEAD') req.write(JSON.stringify(body));
    req.end();
  });
}

// ─── Redis Helper (raw TCP) ───
function redisGet(key) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(REDIS_PORT, REDIS_HOST, () => {
      client.write(`GET ${key}\r\n`);
    });
    let data = '';
    client.on('data', (chunk) => {
      data += chunk.toString();
      if (data.includes('\r\n') && !data.startsWith('$-1')) {
        const lines = data.split('\r\n');
        client.destroy();
        resolve(lines[1] || null);
      } else if (data.includes('$-1')) {
        client.destroy();
        resolve(null);
      }
    });
    client.on('error', reject);
    setTimeout(() => { client.destroy(); resolve(null); }, 5000);
  });
}

// ─── Test Logger ───
function record(suite, num, name, status, evidence) {
  results.push({ suite, num, name, status, evidence: String(evidence).substring(0, 400) });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⊘';
  console.log(`  ${icon} ${num} ${name}: ${status}`);
  if (status === 'FAIL') console.log(`      → ${String(evidence).substring(0, 200)}`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── JWT decoder (base64url → JSON) ───
function decodeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
  } catch { return {}; }
}

// ─── User Registration Helper ───
async function registerUser(emailPrefix) {
  const email = `${RUN_ID}-${emailPrefix}@test.hedera.social`;

  // Register
  const reg = await request('POST', '/auth/register', { email });
  if (reg.status !== 201 && reg.status !== 200) {
    return { error: `register failed: status=${reg.status} body=${JSON.stringify(reg.body).substring(0, 200)}` };
  }

  await sleep(500);

  // Get OTP from Redis
  const otp = await redisGet(`otp:${email}`);
  if (!otp) return { error: `no OTP in Redis for ${email}` };

  // Verify OTP
  const verify = await request('POST', '/auth/verify-otp', { email, otp });
  if (verify.status !== 200) return { error: `verify failed: status=${verify.status}` };

  const accessToken = verify.body?.data?.accessToken;
  const refreshToken = verify.body?.data?.refreshToken;
  if (!accessToken) return { error: 'no accessToken in verify response' };

  // Extract userId from JWT sub claim
  const userId = decodeJwt(accessToken).sub;

  // Create wallet (real Hedera testnet account)
  const wallet = await request('POST', '/wallet/create', {}, accessToken);
  const accountId = wallet.body?.data?.hederaAccountId;
  console.log(`    Wallet: ${accountId} (status=${wallet.status})`);

  // Refresh token to get hederaAccountId embedded in JWT
  const refresh = await request('POST', '/auth/refresh', { refreshToken }, accessToken);
  const newToken = refresh.body?.data?.accessToken;
  if (!newToken) {
    console.log(`    WARNING: token refresh failed (status=${refresh.status}), using original`);
    return { token: accessToken, refreshToken, accountId, userId };
  }

  return { token: newToken, refreshToken, accountId, userId };
}

// ═══════════════════════════════════════════════════════════════
// SETUP: Register 3 test users
// ═══════════════════════════════════════════════════════════════
async function setup() {
  console.log('\n═══ SETUP: Register Test Users ═══');

  const u1 = await registerUser('u1');
  if (u1.error) { console.log(`  FATAL: user1: ${u1.error}`); return false; }
  user1Token = u1.token; user1AccountId = u1.accountId; user1Id = u1.userId;
  console.log(`  User1: ${u1.accountId} (id=${u1.userId})`);

  await sleep(300);

  const u2 = await registerUser('u2');
  if (u2.error) { console.log(`  FATAL: user2: ${u2.error}`); return false; }
  user2Token = u2.token; user2AccountId = u2.accountId; user2Id = u2.userId;
  console.log(`  User2: ${u2.accountId} (id=${u2.userId})`);

  await sleep(300);

  const u3 = await registerUser('u3');
  if (u3.error) { console.log(`  FATAL: user3: ${u3.error}`); return false; }
  user3Token = u3.token; user3AccountId = u3.accountId; user3Id = u3.userId;
  console.log(`  User3: ${u3.accountId} (id=${u3.userId})`);

  return true;
}

// ═══════════════════════════════════════════════════════════════
// GAP-035: Conversation Unread Counts
// ═══════════════════════════════════════════════════════════════
async function suiteGap035() {
  console.log('\n═══ GAP-035: CONVERSATION UNREAD COUNTS ═══');

  // 35.1 Create a direct conversation between user1 and user2
  try {
    const r = await request('POST', '/conversations', {
      participantAccountIds: [user2AccountId],
      type: 'direct',
    }, user1Token);
    const ok = (r.status === 200 || r.status === 201) && r.body?.data;
    conversationId = r.body?.data?.id;
    conversationTopicId = r.body?.data?.hcsTopicId;
    record('GAP-035', '35.1', 'Create direct conversation', ok ? 'PASS' : 'FAIL',
      `status=${r.status} id=${conversationId} topicId=${conversationTopicId}`);

    // Check unreadCount=0 for brand new conversation
    const hasUnread = r.body?.data?.unreadCount !== undefined;
    record('GAP-035', '35.2', 'New conversation has unreadCount field', hasUnread ? 'PASS' : 'FAIL',
      `unreadCount=${r.body?.data?.unreadCount} (expect 0)`);

    const isZero = r.body?.data?.unreadCount === 0;
    record('GAP-035', '35.3', 'New conversation unreadCount=0', isZero ? 'PASS' : 'FAIL',
      `unreadCount=${r.body?.data?.unreadCount}`);
  } catch (e) {
    record('GAP-035', '35.1', 'Create direct conversation', 'FAIL', e.message);
    record('GAP-035', '35.2', 'New conversation has unreadCount field', 'FAIL', 'BLOCKED: no conversation');
    record('GAP-035', '35.3', 'New conversation unreadCount=0', 'FAIL', 'BLOCKED: no conversation');
  }

  // 35.4 Send a message from user1 to conversation (to update lastMessageSeq)
  if (conversationTopicId) {
    try {
      const r = await request('POST', `/conversations/${conversationTopicId}/messages`, {
        text: `GAP-035 test message ${RUN_ID}`,
      }, user1Token);
      const ok = r.status === 200 || r.status === 201;
      record('GAP-035', '35.4', 'Send message to conversation', ok ? 'PASS' : 'FAIL',
        `status=${r.status} body=${JSON.stringify(r.body).substring(0, 150)}`);
    } catch (e) {
      record('GAP-035', '35.4', 'Send message to conversation', 'FAIL', e.message);
    }
  } else {
    record('GAP-035', '35.4', 'Send message to conversation', 'FAIL', 'BLOCKED: no topicId');
  }

  // 35.5 Wait for message indexing, then check unread count for user2
  await sleep(2000);

  if (conversationId) {
    // List conversations for user2 (who has NOT read the message)
    try {
      const r = await request('GET', '/conversations', null, user2Token);
      const ok = r.status === 200;
      const convList = r.body?.data?.data || r.body?.data || [];
      const targetConv = Array.isArray(convList) ? convList.find(c => c.id === conversationId) : null;
      const unread = targetConv?.unreadCount;

      record('GAP-035', '35.5', 'User2 sees unreadCount in conversation list', ok && unread !== undefined ? 'PASS' : 'FAIL',
        `status=${r.status} unreadCount=${unread} conversationFound=${!!targetConv}`);

      const hasUnreads = typeof unread === 'number' && unread > 0;
      record('GAP-035', '35.6', 'User2 unreadCount > 0 after message', hasUnreads ? 'PASS' : 'FAIL',
        `unreadCount=${unread} (expect > 0)`);
    } catch (e) {
      record('GAP-035', '35.5', 'User2 sees unreadCount in conversation list', 'FAIL', e.message);
      record('GAP-035', '35.6', 'User2 unreadCount > 0 after message', 'FAIL', e.message);
    }

    // 35.7 Get single conversation for user2 — should also have unreadCount
    try {
      const r = await request('GET', `/conversations/${conversationId}`, null, user2Token);
      const ok = r.status === 200;
      const unread = r.body?.data?.unreadCount;
      record('GAP-035', '35.7', 'Get single conversation includes unreadCount', ok && unread !== undefined ? 'PASS' : 'FAIL',
        `status=${r.status} unreadCount=${unread}`);
    } catch (e) {
      record('GAP-035', '35.7', 'Get single conversation includes unreadCount', 'FAIL', e.message);
    }

    // 35.8 User1 (who sent the message) should have unreadCount=0 (they're the sender)
    try {
      const r = await request('GET', `/conversations/${conversationId}`, null, user1Token);
      const unread = r.body?.data?.unreadCount;
      // After sending, user1's lastReadSeq gets updated in real HCS flow
      record('GAP-035', '35.8', 'Sender has unreadCount field present', r.status === 200 && unread !== undefined ? 'PASS' : 'FAIL',
        `status=${r.status} unreadCount=${unread}`);
    } catch (e) {
      record('GAP-035', '35.8', 'Sender has unreadCount field present', 'FAIL', e.message);
    }
  } else {
    ['35.5', '35.6', '35.7', '35.8'].forEach(n =>
      record('GAP-035', n, 'BLOCKED', 'FAIL', 'No conversation ID'));
  }
}

// ═══════════════════════════════════════════════════════════════
// GAP-036: Organization Ownership Transfer
// ═══════════════════════════════════════════════════════════════
async function suiteGap036() {
  console.log('\n═══ GAP-036: ORGANIZATION OWNERSHIP TRANSFER ═══');

  // 36.1 Create org with user1 as owner
  try {
    const r = await request('POST', '/organizations', { name: `GAP036 Org ${RUN_ID}` }, user1Token);
    const ok = r.status === 201 || r.status === 200;
    orgId = r.body?.data?.id;
    record('GAP-036', '36.1', 'Create organization', ok && orgId ? 'PASS' : 'FAIL',
      `status=${r.status} orgId=${orgId} body=${JSON.stringify(r.body).substring(0, 200)}`);
  } catch (e) {
    record('GAP-036', '36.1', 'Create organization', 'FAIL', e.message);
  }

  if (!orgId) {
    ['36.2', '36.3', '36.4', '36.5', '36.6', '36.7', '36.8', '36.9', '36.10', '36.11'].forEach(n =>
      record('GAP-036', n, 'BLOCKED: no orgId', 'FAIL', 'Organization creation failed'));
    return;
  }

  // 36.2 Invite user2 to org
  let inviteToken = null;
  try {
    const r = await request('POST', '/organizations/me/invitations', {
      email: `${RUN_ID}-u2@test.hedera.social`,
      role: 'admin',
    }, user1Token);
    const ok = r.status === 201 || r.status === 200;
    inviteToken = r.body?.data?.token;
    record('GAP-036', '36.2', 'Invite user2 to org (as admin)', ok && inviteToken ? 'PASS' : 'FAIL',
      `status=${r.status} token=${inviteToken ? 'present' : 'missing'}`);
  } catch (e) {
    record('GAP-036', '36.2', 'Invite user2 to org', 'FAIL', e.message);
  }

  // 36.3 User2 accepts invitation
  if (inviteToken) {
    try {
      const r = await request('POST', `/organizations/invitations/${inviteToken}/accept`, {}, user2Token);
      const ok = r.status === 200 || r.status === 201;
      record('GAP-036', '36.3', 'User2 accepts invitation', ok ? 'PASS' : 'FAIL',
        `status=${r.status} body=${JSON.stringify(r.body).substring(0, 150)}`);
    } catch (e) {
      record('GAP-036', '36.3', 'User2 accepts invitation', 'FAIL', e.message);
    }
  } else {
    record('GAP-036', '36.3', 'User2 accepts invitation', 'FAIL', 'BLOCKED: no invite token');
  }

  await sleep(300);

  // 36.4 Verify user2 is a member
  try {
    const r = await request('GET', '/organizations/me/members', null, user1Token);
    const ok = r.status === 200;
    const members = Array.isArray(r.body?.data) ? r.body.data : [];
    const user2Member = members.find(m => m.userId === user2Id);
    record('GAP-036', '36.4', 'User2 is org member', ok && !!user2Member ? 'PASS' : 'FAIL',
      `status=${r.status} user2Found=${!!user2Member} role=${user2Member?.role} memberCount=${members.length} user2Id=${user2Id} memberUserIds=${JSON.stringify(members.map(m=>m.userId))}`);
  } catch (e) {
    record('GAP-036', '36.4', 'User2 is org member', 'FAIL', e.message);
  }

  // 36.5 Transfer ownership from user1 to user2
  try {
    const r = await request('POST', '/organizations/me/transfer-ownership', {
      newOwnerUserId: user2Id,
    }, user1Token);
    const ok = r.status === 200;
    record('GAP-036', '36.5', 'Transfer ownership to user2', ok ? 'PASS' : 'FAIL',
      `status=${r.status} body=${JSON.stringify(r.body).substring(0, 200)}`);
  } catch (e) {
    record('GAP-036', '36.5', 'Transfer ownership to user2', 'FAIL', e.message);
  }

  await sleep(300);

  // 36.6 Verify user2 is now owner (list members from user2's perspective)
  try {
    const r = await request('GET', '/organizations/me', null, user2Token);
    const ok = r.status === 200;
    const ownerUserId = r.body?.data?.ownerUserId;
    const isNewOwner = ownerUserId === user2Id;
    record('GAP-036', '36.6', 'User2 is new owner', ok && isNewOwner ? 'PASS' : 'FAIL',
      `status=${r.status} ownerUserId=${ownerUserId} expected=${user2Id}`);
  } catch (e) {
    record('GAP-036', '36.6', 'User2 is new owner', 'FAIL', e.message);
  }

  // 36.7 User1 should now be admin (not owner)
  try {
    const r = await request('GET', '/organizations/me/members', null, user2Token);
    const members = Array.isArray(r.body?.data) ? r.body.data : [];
    const user1Member = members.find(m => m.userId === user1Id);
    const isDemoted = user1Member?.role === 'admin';
    record('GAP-036', '36.7', 'Former owner (user1) demoted to admin', isDemoted ? 'PASS' : 'FAIL',
      `user1Role=${user1Member?.role} expected=admin`);
  } catch (e) {
    record('GAP-036', '36.7', 'Former owner demoted to admin', 'FAIL', e.message);
  }

  // 36.8 User1 (now admin) cannot transfer ownership
  try {
    const r = await request('POST', '/organizations/me/transfer-ownership', {
      newOwnerUserId: user1Id,
    }, user1Token);
    // Should fail — user1 is no longer owner; they may get 403 or 404 (no org as owner)
    const ok = r.status === 403 || r.status === 404;
    record('GAP-036', '36.8', 'Non-owner cannot transfer ownership', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 403 or 404) body=${JSON.stringify(r.body).substring(0, 150)}`);
  } catch (e) {
    record('GAP-036', '36.8', 'Non-owner cannot transfer ownership', 'FAIL', e.message);
  }

  // 36.9 Cannot transfer to yourself
  try {
    const r = await request('POST', '/organizations/me/transfer-ownership', {
      newOwnerUserId: user2Id,
    }, user2Token);
    const ok = r.status === 403 || r.status === 400;
    record('GAP-036', '36.9', 'Cannot transfer ownership to self', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 403) body=${JSON.stringify(r.body).substring(0, 150)}`);
  } catch (e) {
    record('GAP-036', '36.9', 'Cannot transfer to self', 'FAIL', e.message);
  }

  // 36.10 Cannot transfer to non-member
  try {
    const r = await request('POST', '/organizations/me/transfer-ownership', {
      newOwnerUserId: user3Id,
    }, user2Token);
    const ok = r.status === 404 || r.status === 400;
    record('GAP-036', '36.10', 'Cannot transfer to non-member', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 404) body=${JSON.stringify(r.body).substring(0, 150)}`);
  } catch (e) {
    record('GAP-036', '36.10', 'Cannot transfer to non-member', 'FAIL', e.message);
  }

  // 36.11 No auth — transfer endpoint rejects
  try {
    const r = await request('POST', '/organizations/me/transfer-ownership', {
      newOwnerUserId: user1Id,
    }, null);
    record('GAP-036', '36.11', 'No auth rejected on transfer', r.status === 401 ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) {
    record('GAP-036', '36.11', 'No auth rejected', 'FAIL', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// GAP-037: Payment Auto-Expire Cron
// ═══════════════════════════════════════════════════════════════
async function suiteGap037() {
  console.log('\n═══ GAP-037: PAYMENT AUTO-EXPIRE CRON ═══');

  // We need a conversation topicId to create a payment request
  // Use the one created in GAP-035, or create one if needed
  let paymentTopicId = conversationTopicId;

  if (!paymentTopicId) {
    try {
      const r = await request('POST', '/conversations', {
        participantAccountIds: [user2AccountId],
        type: 'direct',
      }, user1Token);
      paymentTopicId = r.body?.data?.hcsTopicId;
      console.log(`  Created fallback conversation: ${paymentTopicId}`);
    } catch (e) {
      console.log(`  Failed to create fallback conversation: ${e.message}`);
    }
  }

  if (!paymentTopicId) {
    ['37.1', '37.2', '37.3', '37.4', '37.5', '37.6'].forEach(n =>
      record('GAP-037', n, 'BLOCKED: no conversation topicId', 'FAIL', 'Cannot create payment request without a conversation'));
    return;
  }

  // 37.1 Create a payment request with a very short expiry (2 seconds from now)
  let requestId = null;
  try {
    const shortExpiry = new Date(Date.now() + 3000).toISOString(); // Expires in 3s — pending for immediate GET, expired after 5s wait
    const r = await request('POST', '/payments/request', {
      amount: 0.5,
      currency: 'HBAR',
      topicId: paymentTopicId,
      description: `Auto-expire test ${RUN_ID}`,
      expiresAt: shortExpiry,
    }, user1Token);
    const ok = (r.status === 200 || r.status === 201) && r.body?.data;
    requestId = r.body?.data?.id;
    const status = r.body?.data?.status;
    record('GAP-037', '37.1', 'Create short-expiry payment request', ok && requestId ? 'PASS' : 'FAIL',
      `status=${r.status} requestId=${requestId} paymentStatus=${status} expiresAt=${shortExpiry}`);
  } catch (e) {
    record('GAP-037', '37.1', 'Create short-expiry payment request', 'FAIL', e.message);
  }

  // 37.2 Immediately check — should be 'pending'
  if (requestId) {
    try {
      const r = await request('GET', `/payments/request/${requestId}`, null, user1Token);
      const ok = r.status === 200 && r.body?.data?.status === 'pending';
      record('GAP-037', '37.2', 'Payment request initially pending', ok ? 'PASS' : 'FAIL',
        `status=${r.status} paymentStatus=${r.body?.data?.status}`);
    } catch (e) {
      record('GAP-037', '37.2', 'Payment request initially pending', 'FAIL', e.message);
    }
  } else {
    record('GAP-037', '37.2', 'Payment request initially pending', 'FAIL', 'BLOCKED: no requestId');
  }

  // 37.3 Wait for the cron to run (runs every 60s, but also lazy-expire on read)
  // The request expires in 2s, so after 5s it should be expired
  console.log('  Waiting 5s for expiry...');
  await sleep(5000);

  if (requestId) {
    try {
      const r = await request('GET', `/payments/request/${requestId}`, null, user1Token);
      const ok = r.status === 200 && r.body?.data?.status === 'expired';
      record('GAP-037', '37.3', 'Payment request auto-expired after delay', ok ? 'PASS' : 'FAIL',
        `status=${r.status} paymentStatus=${r.body?.data?.status} (expect expired)`);
    } catch (e) {
      record('GAP-037', '37.3', 'Payment request auto-expired', 'FAIL', e.message);
    }
  } else {
    record('GAP-037', '37.3', 'Payment request auto-expired', 'FAIL', 'BLOCKED: no requestId');
  }

  // 37.4 Create another request with normal expiry to ensure it stays pending
  let normalRequestId = null;
  try {
    const r = await request('POST', '/payments/request', {
      amount: 1.0,
      currency: 'HBAR',
      topicId: paymentTopicId,
      description: `Normal expiry test ${RUN_ID}`,
    }, user1Token);
    const ok = (r.status === 200 || r.status === 201) && r.body?.data;
    normalRequestId = r.body?.data?.id;
    record('GAP-037', '37.4', 'Create normal-expiry payment request', ok && normalRequestId ? 'PASS' : 'FAIL',
      `status=${r.status} requestId=${normalRequestId}`);
  } catch (e) {
    record('GAP-037', '37.4', 'Create normal-expiry payment request', 'FAIL', e.message);
  }

  // 37.5 Verify normal-expiry request stays pending
  if (normalRequestId) {
    await sleep(2000);
    try {
      const r = await request('GET', `/payments/request/${normalRequestId}`, null, user1Token);
      const ok = r.status === 200 && r.body?.data?.status === 'pending';
      record('GAP-037', '37.5', 'Normal-expiry request remains pending', ok ? 'PASS' : 'FAIL',
        `status=${r.status} paymentStatus=${r.body?.data?.status}`);
    } catch (e) {
      record('GAP-037', '37.5', 'Normal-expiry request remains pending', 'FAIL', e.message);
    }
  } else {
    record('GAP-037', '37.5', 'Normal-expiry request remains pending', 'FAIL', 'BLOCKED: no normalRequestId');
  }

  // 37.6 Try to fulfill an expired request — should fail
  if (requestId) {
    try {
      const r = await request('POST', `/payments/request/${requestId}/pay`, {
        topicId: paymentTopicId,
      }, user2Token);
      const ok = r.status === 400 || r.status === 409 || r.status === 410;
      record('GAP-037', '37.6', 'Cannot fulfill expired request', ok ? 'PASS' : 'FAIL',
        `status=${r.status} (expect 400/409/410) body=${JSON.stringify(r.body).substring(0, 150)}`);
    } catch (e) {
      record('GAP-037', '37.6', 'Cannot fulfill expired request', 'FAIL', e.message);
    }
  } else {
    record('GAP-037', '37.6', 'Cannot fulfill expired request', 'FAIL', 'BLOCKED: no requestId');
  }
}

// ═══════════════════════════════════════════════════════════════
// GAP-013: Business Broadcast Feature
// ═══════════════════════════════════════════════════════════════
async function suiteGap013() {
  console.log('\n═══ GAP-013: BUSINESS BROADCAST FEATURE ═══');

  // We need an org with a broadcastTopicId. The org was created in GAP-036.
  // If that didn't work, create one now.
  let broadcastOrgId = orgId;

  if (!broadcastOrgId) {
    try {
      const r = await request('POST', '/organizations', { name: `Broadcast Org ${RUN_ID}` }, user1Token);
      broadcastOrgId = r.body?.data?.organization?.id || r.body?.data?.id;
      console.log(`  Created fallback org: ${broadcastOrgId}`);
    } catch (e) {
      console.log(`  Failed to create fallback org: ${e.message}`);
    }
  }

  // Note: The org needs a broadcastTopicId. Let's check if it has one.
  let hasBroadcastTopic = false;
  if (broadcastOrgId) {
    try {
      // The org owner might be user2 now (after ownership transfer). Try both.
      let r = await request('GET', '/organizations/me', null, user2Token);
      if (r.status !== 200) {
        r = await request('GET', '/organizations/me', null, user1Token);
      }
      const bt = r.body?.data?.organization?.broadcastTopicId || r.body?.data?.broadcastTopicId;
      hasBroadcastTopic = !!bt;
      console.log(`  Org ${broadcastOrgId} broadcastTopicId: ${bt || 'NOT SET'}`);
    } catch (e) {
      console.log(`  Failed to check broadcast topic: ${e.message}`);
    }
  }

  // 13.1 Subscribe to broadcasts (should work even without broadcastTopicId)
  try {
    const r = await request('POST', `/broadcasts/${broadcastOrgId}/subscribe`, {}, user3Token);
    const ok = r.status === 201 || r.status === 200;
    record('GAP-013', '13.1', 'Subscribe to org broadcasts', ok ? 'PASS' : 'FAIL',
      `status=${r.status} body=${JSON.stringify(r.body).substring(0, 200)}`);
  } catch (e) {
    record('GAP-013', '13.1', 'Subscribe to org broadcasts', 'FAIL', e.message);
  }

  // 13.2 Check subscription status
  try {
    const r = await request('GET', `/broadcasts/${broadcastOrgId}/subscribed`, null, user3Token);
    const ok = r.status === 200 && r.body?.data?.subscribed === true;
    record('GAP-013', '13.2', 'Verify subscription status', ok ? 'PASS' : 'FAIL',
      `status=${r.status} subscribed=${r.body?.data?.subscribed}`);
  } catch (e) {
    record('GAP-013', '13.2', 'Verify subscription status', 'FAIL', e.message);
  }

  // 13.3 Duplicate subscription should fail (409 Conflict)
  try {
    const r = await request('POST', `/broadcasts/${broadcastOrgId}/subscribe`, {}, user3Token);
    const ok = r.status === 409;
    record('GAP-013', '13.3', 'Duplicate subscription rejected (409)', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 409) body=${JSON.stringify(r.body).substring(0, 100)}`);
  } catch (e) {
    record('GAP-013', '13.3', 'Duplicate subscription rejected', 'FAIL', e.message);
  }

  // 13.4 Get subscriber count
  try {
    const r = await request('GET', `/broadcasts/${broadcastOrgId}/subscribers/count`, null, user2Token);
    const ok = r.status === 200 && typeof r.body?.data?.count === 'number' && r.body.data.count >= 1;
    record('GAP-013', '13.4', 'Subscriber count >= 1', ok ? 'PASS' : 'FAIL',
      `status=${r.status} count=${r.body?.data?.count}`);
  } catch (e) {
    record('GAP-013', '13.4', 'Subscriber count', 'FAIL', e.message);
  }

  // 13.5 User1 also subscribes
  try {
    const r = await request('POST', `/broadcasts/${broadcastOrgId}/subscribe`, {}, user1Token);
    const ok = r.status === 201 || r.status === 200;
    record('GAP-013', '13.5', 'User1 subscribes to broadcasts', ok ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) {
    record('GAP-013', '13.5', 'User1 subscribes', 'FAIL', e.message);
  }

  // 13.6 Subscriber count should now be 2
  try {
    const r = await request('GET', `/broadcasts/${broadcastOrgId}/subscribers/count`, null, user2Token);
    const ok = r.status === 200 && r.body?.data?.count >= 2;
    record('GAP-013', '13.6', 'Subscriber count >= 2 after second sub', ok ? 'PASS' : 'FAIL',
      `status=${r.status} count=${r.body?.data?.count}`);
  } catch (e) {
    record('GAP-013', '13.6', 'Subscriber count >= 2', 'FAIL', e.message);
  }

  // 13.7 Post a broadcast (owner/admin only — user2 is owner after transfer)
  // If no broadcastTopicId, expect a specific error
  const posterToken = user2Token; // user2 is now owner after GAP-036 transfer
  try {
    const r = await request('POST', `/broadcasts/${broadcastOrgId}`, {
      text: `GAP-013 broadcast test ${RUN_ID}`,
    }, posterToken);
    if (hasBroadcastTopic) {
      const ok = r.status === 201 || r.status === 200;
      record('GAP-013', '13.7', 'Post broadcast (owner)', ok ? 'PASS' : 'FAIL',
        `status=${r.status} body=${JSON.stringify(r.body).substring(0, 200)}`);
    } else {
      // Expect 404 (BROADCAST_TOPIC_NOT_FOUND) since no broadcastTopicId configured
      const ok = r.status === 404;
      record('GAP-013', '13.7', 'Post broadcast fails without topic (404)', ok ? 'PASS' : 'FAIL',
        `status=${r.status} (expect 404 without broadcastTopicId) body=${JSON.stringify(r.body).substring(0, 200)}`);
    }
  } catch (e) {
    record('GAP-013', '13.7', 'Post broadcast', 'FAIL', e.message);
  }

  // 13.8 Non-member user3 cannot post broadcasts
  try {
    const r = await request('POST', `/broadcasts/${broadcastOrgId}`, {
      text: 'Unauthorized broadcast',
    }, user3Token);
    const ok = r.status === 403 || r.status === 404;
    record('GAP-013', '13.8', 'Non-member cannot post broadcast', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 403 or 404)`);
  } catch (e) {
    record('GAP-013', '13.8', 'Non-member cannot post', 'FAIL', e.message);
  }

  // 13.9 Get org broadcast feed
  try {
    const r = await request('GET', `/broadcasts/${broadcastOrgId}`, null, user3Token);
    const ok = r.status === 200 && r.body?.data;
    const broadcasts = r.body?.data?.broadcasts || [];
    record('GAP-013', '13.9', 'Get org broadcast feed', ok ? 'PASS' : 'FAIL',
      `status=${r.status} broadcastCount=${broadcasts.length}`);
  } catch (e) {
    record('GAP-013', '13.9', 'Get org broadcast feed', 'FAIL', e.message);
  }

  // 13.10 Get subscribed feed (aggregated)
  try {
    const r = await request('GET', '/broadcasts/feed/subscribed', null, user3Token);
    const ok = r.status === 200 && r.body?.data;
    const broadcasts = r.body?.data?.broadcasts || [];
    record('GAP-013', '13.10', 'Get subscribed broadcast feed', ok ? 'PASS' : 'FAIL',
      `status=${r.status} broadcastCount=${broadcasts.length} hasMore=${r.body?.data?.hasMore}`);
  } catch (e) {
    record('GAP-013', '13.10', 'Get subscribed broadcast feed', 'FAIL', e.message);
  }

  // 13.11 Unsubscribe from broadcasts
  try {
    const r = await request('DELETE', `/broadcasts/${broadcastOrgId}/subscribe`, null, user3Token);
    const ok = r.status === 200;
    record('GAP-013', '13.11', 'Unsubscribe from broadcasts', ok ? 'PASS' : 'FAIL',
      `status=${r.status} body=${JSON.stringify(r.body).substring(0, 100)}`);
  } catch (e) {
    record('GAP-013', '13.11', 'Unsubscribe from broadcasts', 'FAIL', e.message);
  }

  // 13.12 Verify unsubscribed
  try {
    const r = await request('GET', `/broadcasts/${broadcastOrgId}/subscribed`, null, user3Token);
    const ok = r.status === 200 && r.body?.data?.subscribed === false;
    record('GAP-013', '13.12', 'Verify unsubscribed', ok ? 'PASS' : 'FAIL',
      `status=${r.status} subscribed=${r.body?.data?.subscribed}`);
  } catch (e) {
    record('GAP-013', '13.12', 'Verify unsubscribed', 'FAIL', e.message);
  }

  // 13.13 Duplicate unsubscribe should fail (400)
  try {
    const r = await request('DELETE', `/broadcasts/${broadcastOrgId}/subscribe`, null, user3Token);
    const ok = r.status === 400;
    record('GAP-013', '13.13', 'Duplicate unsubscribe rejected (400)', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 400)`);
  } catch (e) {
    record('GAP-013', '13.13', 'Duplicate unsubscribe rejected', 'FAIL', e.message);
  }

  // 13.14 Subscriber count after unsubscribe
  try {
    const r = await request('GET', `/broadcasts/${broadcastOrgId}/subscribers/count`, null, user2Token);
    const ok = r.status === 200 && typeof r.body?.data?.count === 'number';
    record('GAP-013', '13.14', 'Subscriber count after unsubscribe', ok ? 'PASS' : 'FAIL',
      `status=${r.status} count=${r.body?.data?.count}`);
  } catch (e) {
    record('GAP-013', '13.14', 'Subscriber count after unsub', 'FAIL', e.message);
  }

  // 13.15 Subscribe to non-existent org — 404
  try {
    const fakeOrgId = '00000000-0000-4000-8000-000000000000';
    const r = await request('POST', `/broadcasts/${fakeOrgId}/subscribe`, {}, user3Token);
    const ok = r.status === 404;
    record('GAP-013', '13.15', 'Subscribe to non-existent org (404)', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 404)`);
  } catch (e) {
    record('GAP-013', '13.15', 'Subscribe to non-existent org', 'FAIL', e.message);
  }

  // 13.16 No auth — all broadcast endpoints require JWT
  try {
    const r = await request('GET', `/broadcasts/${broadcastOrgId}`, null, null);
    record('GAP-013', '13.16', 'No auth rejected on broadcast feed', r.status === 401 ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) {
    record('GAP-013', '13.16', 'No auth rejected', 'FAIL', e.message);
  }

  // 13.17 Post broadcast without text — validation error (400)
  try {
    const r = await request('POST', `/broadcasts/${broadcastOrgId}`, {}, posterToken);
    const ok = r.status === 400;
    record('GAP-013', '13.17', 'Broadcast without text rejected (400)', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 400)`);
  } catch (e) {
    record('GAP-013', '13.17', 'Broadcast without text rejected', 'FAIL', e.message);
  }

  // 13.18 Invalid orgId format — 400
  try {
    const r = await request('POST', '/broadcasts/not-a-uuid/subscribe', {}, user3Token);
    const ok = r.status === 400 || r.status === 422;
    record('GAP-013', '13.18', 'Invalid orgId format rejected', ok ? 'PASS' : 'FAIL',
      `status=${r.status} (expect 400 or 422)`);
  } catch (e) {
    record('GAP-013', '13.18', 'Invalid orgId format', 'FAIL', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log('╔════════════════════════════════════════════════════╗');
  console.log('║  GAP Test Suite — Real E2E Tests                  ║');
  console.log('║  GAP-013 · GAP-035 · GAP-036 · GAP-037           ║');
  console.log(`║  Run ID: ${RUN_ID.padEnd(40)}║`);
  console.log('╚════════════════════════════════════════════════════╝');

  // Verify API is running
  try {
    const r = await request('GET', `${BASE}/health`);
    if (r.status !== 200) {
      console.log(`FATAL: API health check failed (status=${r.status}). Is the API running at ${BASE}?`);
      process.exit(1);
    }
    console.log('API health check: OK');
  } catch (e) {
    console.log(`FATAL: Cannot reach API at ${BASE}: ${e.message}`);
    console.log('Start the API with: pnpm dev');
    process.exit(1);
  }

  // Setup: register 3 users
  const setupOk = await setup();
  if (!setupOk) {
    console.log('\nFATAL: User setup failed. Cannot continue.');
    process.exit(1);
  }

  // Run test suites
  await suiteGap035();
  await suiteGap036();
  await suiteGap037();
  await suiteGap013();

  // ─── Summary ───
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║  TEST RESULTS SUMMARY                             ║');
  console.log('╚════════════════════════════════════════════════════╝');

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;
  const rate = total > 0 ? ((pass / total) * 100).toFixed(1) : '0.0';

  console.log(`\n  PASS: ${pass} | FAIL: ${fail} | TOTAL: ${total} | RATE: ${rate}%\n`);

  // Per-suite breakdown
  const suites = {};
  results.forEach(r => {
    if (!suites[r.suite]) suites[r.suite] = { pass: 0, fail: 0 };
    suites[r.suite][r.status === 'PASS' ? 'pass' : 'fail']++;
  });

  Object.entries(suites).forEach(([suite, counts]) => {
    const sTotal = counts.pass + counts.fail;
    const sRate = sTotal > 0 ? ((counts.pass / sTotal) * 100).toFixed(0) : '0';
    console.log(`  ${suite}: ${counts.pass}/${sTotal} (${sRate}%)`);
  });

  // Detailed failure list
  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length > 0) {
    console.log('\n  ─── FAILURES ───');
    failures.forEach(r => {
      console.log(`  ✗ ${r.num} ${r.name}`);
      console.log(`    ${r.evidence.substring(0, 200)}`);
    });
  }

  console.log(`\n  Run ID: ${RUN_ID}`);
  console.log(`  Completed at: ${new Date().toISOString()}`);

  // Exit with failure code if any tests failed
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('FATAL:', e);
  process.exit(1);
});
