const Redis = require('/Users/bedtreep/Documents/GitHub/social-platform/node_modules/.pnpm/ioredis@5.10.0/node_modules/ioredis');

const API = 'http://localhost:3001/api/v1';
const redis = new Redis({ host: '127.0.0.1', port: 6382 });
const results = [];
let user1Token, user2Token, user1Account, user2Account, user1Refresh, user2Refresh;
const suffix = Date.now().toString().slice(-5);

function log(suite, test, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ suite, test, status, detail });
  console.log(`[${status}] ${suite} > ${test}: ${detail.substring(0, 150)}`);
}

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['Authorization'] = 'Bearer ' + token;
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + path, opts);
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: r.status, json, text };
}

async function registerAndVerify(identifier) {
  const isPhone = identifier.startsWith('+');
  const body = isPhone ? { phone: identifier } : { email: identifier };
  const reg = await api('POST', '/auth/register', body);
  if (reg.status !== 201) return { error: 'register ' + reg.status + ': ' + reg.text.substring(0, 100) };

  await new Promise(r => setTimeout(r, 500));
  const otp = await redis.get('otp:' + identifier);
  if (!otp) return { error: 'no OTP in Redis for ' + identifier };

  const verifyBody = isPhone ? { phone: identifier, otp } : { email: identifier, otp };
  const verify = await api('POST', '/auth/verify-otp', verifyBody);
  if (verify.status !== 200 && verify.status !== 201) return { error: 'verify ' + verify.status };

  const accessToken = verify.json?.data?.accessToken;
  const refreshToken = verify.json?.data?.refreshToken;
  if (!accessToken) return { error: 'no accessToken' };

  // Create wallet
  const wallet = await api('POST', '/wallet/create', {}, accessToken);
  const account = wallet.json?.data?.hederaAccountId;
  console.log('  Wallet:', account, '(status=' + wallet.status + ')');

  // CRITICAL: Refresh token to get hederaAccountId in JWT
  const refresh = await api('POST', '/auth/refresh', { refreshToken }, accessToken);
  const newToken = refresh.json?.data?.accessToken || refresh.json?.accessToken;
  if (!newToken) {
    console.log('  WARNING: refresh failed, using original token. Refresh status:', refresh.status, refresh.text?.substring(0, 100));
    return { token: accessToken, refreshToken, account, userId: verify.json?.data?.user?.id };
  }

  console.log('  Token refreshed with hederaAccountId');
  return { token: newToken, refreshToken, account, userId: verify.json?.data?.user?.id };
}

(async () => {
  try {
    console.log('=== REGISTERING TEST USERS ===');
    const u1 = await registerAndVerify('rt2a-' + suffix + '@test.hedera.social');
    if (u1.error) { console.log('FATAL: user1:', u1.error); await redis.quit(); return; }
    user1Token = u1.token; user1Account = u1.account; user1Refresh = u1.refreshToken;
    console.log('User1:', u1.account);

    await new Promise(r => setTimeout(r, 300));

    const u2 = await registerAndVerify('rt2b-' + suffix + '@test.hedera.social');
    if (u2.error) { console.log('FATAL: user2:', u2.error); await redis.quit(); return; }
    user2Token = u2.token; user2Account = u2.account; user2Refresh = u2.refreshToken;
    console.log('User2:', u2.account);

    // Set displayName for search tests
    await api('PUT', '/identity/profile', { displayName: 'QaSearch' + suffix }, user1Token);
    await new Promise(r => setTimeout(r, 300));

    // === SUITE 4: SEARCH ===
    console.log('\n=== SUITE 4: SEARCH ===');

    let r = await api('GET', '/users/search?q=QaSearch' + suffix, null, user1Token);
    log('Search', 'by displayName', r.status === 200 && (r.json?.data?.length || 0) > 0,
      'status=' + r.status + ' count=' + (r.json?.data?.length || 0) + ' data=' + JSON.stringify(r.json?.data?.[0])?.substring(0, 80));

    if (user1Account) {
      r = await api('GET', '/users/search?q=' + user1Account, null, user1Token);
      log('Search', 'by accountId', r.status === 200 && (r.json?.data?.length || 0) > 0,
        'status=' + r.status + ' count=' + (r.json?.data?.length || 0));
    }

    r = await api('GET', '/users/search?q=rt2a-' + suffix, null, user1Token);
    log('Search', 'by email prefix', r.status === 200 && (r.json?.data?.length || 0) > 0,
      'status=' + r.status + ' count=' + (r.json?.data?.length || 0));

    r = await api('GET', '/users/search?q=a', null, user1Token);
    log('Search', 'too short 400', r.status === 400, 'status=' + r.status);

    // === SUITE 5: POSTS ===
    console.log('\n=== SUITE 5: POSTS ===');

    // Create post with 'text' field
    r = await api('POST', '/posts', { text: 'QA retest post ' + suffix }, user1Token);
    log('Posts', 'create', r.status === 201 || r.status === 200,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));
    const postId = r.json?.data?.id || r.json?.data?.postId;

    if (postId) {
      r = await api('GET', '/posts/' + postId, null, user1Token);
      log('Posts', 'get by id', r.status === 200, 'status=' + r.status + ' text=' + (r.json?.data?.text || '').substring(0, 40));

      r = await api('POST', '/posts/' + postId + '/like', {}, user2Token);
      log('Posts', 'like', r.status === 200 || r.status === 201, 'status=' + r.status);

      r = await api('DELETE', '/posts/' + postId + '/like', null, user2Token);
      log('Posts', 'unlike', r.status === 200 || r.status === 204, 'status=' + r.status);

      r = await api('POST', '/posts/' + postId + '/comments', { text: 'Comment ' + suffix }, user1Token);
      log('Posts', 'add comment', r.status === 200 || r.status === 201, 'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 100));

      r = await api('GET', '/posts/' + postId + '/comments', null, user1Token);
      log('Posts', 'get comments', r.status === 200, 'status=' + r.status);

      // Feed
      r = await api('GET', '/posts/feed?limit=5', null, user1Token);
      log('Posts', 'feed', r.status === 200, 'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 120));

      // Trending
      r = await api('GET', '/posts/trending?limit=5', null, user1Token);
      log('Posts', 'trending', r.status === 200, 'status=' + r.status);

      // User posts
      r = await api('GET', '/posts/user/' + user1Account + '?limit=5', null, user1Token);
      log('Posts', 'user posts', r.status === 200, 'status=' + r.status);

      // Delete
      r = await api('DELETE', '/posts/' + postId, null, user1Token);
      log('Posts', 'delete', r.status === 200 || r.status === 204, 'status=' + r.status);
    } else {
      ['get by id', 'like', 'unlike', 'add comment', 'get comments', 'feed', 'trending', 'user posts', 'delete'].forEach(t =>
        log('Posts', t, false, 'BLOCKED: no postId'));
    }

    // Post with empty text (should 400)
    r = await api('POST', '/posts', { text: '' }, user1Token);
    log('Posts', 'empty text 400', r.status === 400, 'status=' + r.status);

    // === SUITE 7: CONVERSATIONS ===
    console.log('\n=== SUITE 7: CONVERSATIONS ===');

    r = await api('POST', '/conversations', {
      participantAccountIds: [user2Account],
      type: 'direct'
    }, user1Token);
    log('Conversations', 'create direct', r.status === 200 || r.status === 201,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));
    const topicId = r.json?.data?.topicId || r.json?.data?.id;

    if (topicId) {
      r = await api('POST', '/conversations/' + topicId + '/messages', { content: 'Hello QA ' + suffix }, user1Token);
      log('Conversations', 'send message', r.status === 200 || r.status === 201,
        'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 100));

      r = await api('GET', '/conversations/' + topicId + '/messages', null, user1Token);
      log('Conversations', 'get messages', r.status === 200, 'status=' + r.status);

      r = await api('GET', '/conversations', null, user1Token);
      log('Conversations', 'list user1', r.status === 200, 'status=' + r.status + ' count=' + (r.json?.data?.length || 0));

      r = await api('GET', '/conversations', null, user2Token);
      log('Conversations', 'list user2', r.status === 200 && (r.json?.data?.length || 0) > 0,
        'status=' + r.status + ' count=' + (r.json?.data?.length || 0));
    } else {
      ['send message', 'get messages', 'list user1', 'list user2'].forEach(t =>
        log('Conversations', t, false, 'BLOCKED: no topicId'));
    }

    // Group conversation
    r = await api('POST', '/conversations', {
      participantAccountIds: [user2Account],
      type: 'group',
      groupName: 'QA Group ' + suffix
    }, user1Token);
    log('Conversations', 'create group', r.status === 200 || r.status === 201,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 120));

    // No auth
    r = await api('POST', '/conversations', { participantAccountIds: ['0.0.1'], type: 'direct' }, null);
    log('Conversations', 'no auth 401', r.status === 401, 'status=' + r.status);

    // === SUITE 8: PAYMENTS (request needs topicId + currency) ===
    console.log('\n=== SUITE 8: PAYMENTS ===');

    // Payment request requires a conversation topicId — use one if we have it
    if (topicId) {
      r = await api('POST', '/payments/request', {
        amount: 1,
        currency: 'HBAR',
        topicId: topicId
      }, user1Token);
      log('Payments', 'create request', r.status === 200 || r.status === 201,
        'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));
    } else {
      log('Payments', 'create request', false, 'BLOCKED: no topicId for payment request');
    }

    // Payment send to non-existent account
    r = await api('POST', '/payments/send', {
      recipientAccountId: '0.0.9999999',
      amount: 0.01,
      currency: 'HBAR'
    }, user1Token);
    log('Payments', 'send to non-existent', r.status === 404 || r.status === 400,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 100));

    // === SUITE 9: NOTIFICATIONS (cursor pagination) ===
    console.log('\n=== SUITE 9: NOTIFICATIONS ===');
    r = await api('GET', '/notifications?limit=5', null, user1Token);
    log('Notifications', 'cursor pagination', r.status === 200, 'status=' + r.status);

    // === SUITE 10: ORGANIZATIONS (routes use /me) ===
    console.log('\n=== SUITE 10: ORGANIZATIONS ===');

    r = await api('POST', '/organizations', { name: 'QA Org ' + suffix }, user1Token);
    log('Orgs', 'create', r.status === 201, 'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 150));

    // Get my org via /me (not /:id)
    r = await api('GET', '/organizations/me', null, user1Token);
    log('Orgs', 'get my org', r.status === 200, 'status=' + r.status + ' body=' + JSON.stringify(r.json?.data)?.substring(0, 100));

    // Update via PUT /me
    r = await api('PUT', '/organizations/me', { name: 'QA Org Updated ' + suffix }, user1Token);
    log('Orgs', 'update', r.status === 200, 'status=' + r.status);

    // List members via /me/members
    r = await api('GET', '/organizations/me/members', null, user1Token);
    log('Orgs', 'list members', r.status === 200, 'status=' + r.status + ' count=' + (r.json?.data?.length || 0));

    // Create invitation via /me/invitations
    r = await api('POST', '/organizations/me/invitations', {
      inviteeAccountId: user2Account,
      role: 'member'
    }, user1Token);
    log('Orgs', 'invite member', r.status === 201 || r.status === 200,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 150));
    const inviteToken = r.json?.data?.token;

    // List invitations
    r = await api('GET', '/organizations/me/invitations', null, user1Token);
    log('Orgs', 'list invitations', r.status === 200, 'status=' + r.status + ' count=' + (r.json?.data?.length || 0));

    // Accept invitation
    if (inviteToken) {
      r = await api('POST', '/organizations/invitations/' + inviteToken + '/accept', {}, user2Token);
      log('Orgs', 'accept invitation', r.status === 200 || r.status === 201,
        'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 100));
    } else {
      log('Orgs', 'accept invitation', false, 'BLOCKED: no invite token');
    }

    // User without org
    r = await api('GET', '/organizations/me', null, user2Token);
    // user2 might now be a member but not owner, so this could 404
    log('Orgs', 'non-owner get /me', r.status === 404 || r.status === 200, 'status=' + r.status + ' (expected 404 for non-owner)');

    // No auth
    r = await api('POST', '/organizations', { name: 'No Auth Org' }, null);
    log('Orgs', 'no auth 401', r.status === 401, 'status=' + r.status);

    // === SUMMARY ===
    console.log('\n====================================');
    console.log('=== RE-TEST v2 SUMMARY ===');
    console.log('====================================');
    const pass = results.filter(r => r.status === 'PASS').length;
    const fail = results.filter(r => r.status === 'FAIL').length;
    console.log('PASS:', pass, '| FAIL:', fail, '| TOTAL:', results.length);
    console.log('PASS RATE:', (pass / results.length * 100).toFixed(1) + '%');
    console.log('');

    const suites = {};
    results.forEach(r => {
      if (!suites[r.suite]) suites[r.suite] = { pass: 0, fail: 0 };
      suites[r.suite][r.status === 'PASS' ? 'pass' : 'fail']++;
    });
    Object.entries(suites).forEach(([suite, counts]) => {
      console.log(`  ${suite}: ${counts.pass}/${counts.pass + counts.fail} (${(counts.pass / (counts.pass + counts.fail) * 100).toFixed(0)}%)`);
    });

    console.log('\nDetailed:');
    results.forEach(r => {
      console.log(`  [${r.status}] ${r.suite} > ${r.test}: ${r.detail.substring(0, 120)}`);
    });

    await redis.quit();
  } catch (e) {
    console.error('FATAL:', e);
    await redis.quit();
  }
})();
