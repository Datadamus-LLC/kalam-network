const Redis = require('/Users/bedtreep/Documents/GitHub/social-platform/node_modules/.pnpm/ioredis@5.10.0/node_modules/ioredis');

const API = 'http://localhost:3001/api/v1';
const redis = new Redis({ host: '127.0.0.1', port: 6382 });
const results = [];
let user1Token, user2Token, user1Account, user2Account;
const suffix = Date.now().toString().slice(-5);

function log(suite, test, pass, detail) {
  const status = pass ? 'PASS' : 'FAIL';
  results.push({ suite, test, status, detail });
  console.log(`[${status}] ${suite} > ${test}: ${detail.substring(0, 120)}`);
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
  if (reg.status !== 201) return { error: 'register failed: ' + reg.status + ' ' + reg.text };

  await new Promise(r => setTimeout(r, 500));
  const otp = await redis.get('otp:' + identifier);
  if (!otp) return { error: 'no OTP in Redis' };

  // VerifyOtpDto uses email/phone + otp (NOT identifier + code)
  const verifyBody = isPhone ? { phone: identifier, otp } : { email: identifier, otp };
  const verify = await api('POST', '/auth/verify-otp', verifyBody);
  if (verify.status !== 200 && verify.status !== 201) return { error: 'verify failed: ' + verify.status + ' ' + JSON.stringify(verify.json) };

  const token = verify.json?.data?.accessToken;
  if (!token) return { error: 'no token in verify response' };

  // Create wallet
  const wallet = await api('POST', '/wallet/create', {}, token);
  const account = wallet.json?.data?.hederaAccountId;

  return { token, account, userId: verify.json?.data?.user?.id };
}

(async () => {
  try {
    // Register users
    console.log('=== REGISTERING TEST USERS ===');
    const u1 = await registerAndVerify('retest1-' + suffix + '@test.hedera.social');
    if (u1.error) { console.log('FATAL: user1 reg failed:', u1.error); await redis.quit(); return; }
    user1Token = u1.token; user1Account = u1.account;
    console.log('User1:', u1.account);

    await new Promise(r => setTimeout(r, 300));

    const u2 = await registerAndVerify('retest2-' + suffix + '@test.hedera.social');
    if (u2.error) { console.log('FATAL: user2 reg failed:', u2.error); await redis.quit(); return; }
    user2Token = u2.token; user2Account = u2.account;
    console.log('User2:', u2.account);

    // Update profiles so search can find them
    await api('PUT', '/identity/profile', { displayName: 'SearchTestUser' + suffix }, user1Token);

    // === SUITE 4: SEARCH ===
    console.log('\n=== SUITE 4: SEARCH ===');
    await new Promise(r => setTimeout(r, 500));

    // Search by displayName
    let r = await api('GET', '/users/search?q=SearchTestUser' + suffix, null, user1Token);
    log('Search', 'by displayName', r.status === 200 && r.json?.data?.length > 0,
      'status=' + r.status + ' results=' + (r.json?.data?.length || 0) + ' body=' + JSON.stringify(r.json?.data?.[0])?.substring(0, 80));

    // Search by Hedera account ID
    r = await api('GET', '/users/search?q=' + user1Account, null, user1Token);
    log('Search', 'by accountId', r.status === 200 && r.json?.data?.length > 0,
      'status=' + r.status + ' results=' + (r.json?.data?.length || 0));

    // Search by email prefix
    r = await api('GET', '/users/search?q=retest1-' + suffix, null, user1Token);
    log('Search', 'by email prefix', r.status === 200 && r.json?.data?.length > 0,
      'status=' + r.status + ' results=' + (r.json?.data?.length || 0));

    // Search too short query
    r = await api('GET', '/users/search?q=a', null, user1Token);
    log('Search', 'too short query 400', r.status === 400, 'status=' + r.status);

    // === SUITE 5: POSTS (corrected DTO: 'text' not 'content') ===
    console.log('\n=== SUITE 5: POSTS ===');

    r = await api('POST', '/posts', { text: 'QA retest post ' + suffix }, user1Token);
    log('Posts', 'create post', r.status === 201 || r.status === 200,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));
    const postId = r.json?.data?.id || r.json?.data?.postId;

    if (postId) {
      // Get post
      r = await api('GET', '/posts/' + postId, null, user1Token);
      log('Posts', 'get by id', r.status === 200, 'status=' + r.status);

      // Like post
      r = await api('POST', '/posts/' + postId + '/like', {}, user2Token);
      log('Posts', 'like post', r.status === 200 || r.status === 201, 'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 100));

      // Unlike (DELETE)
      r = await api('DELETE', '/posts/' + postId + '/like', null, user2Token);
      log('Posts', 'unlike post', r.status === 200 || r.status === 204, 'status=' + r.status);

      // Comment on post
      r = await api('POST', '/posts/' + postId + '/comments', { text: 'Test comment ' + suffix }, user1Token);
      log('Posts', 'add comment', r.status === 200 || r.status === 201, 'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 100));

      // Get comments
      r = await api('GET', '/posts/' + postId + '/comments', null, user1Token);
      log('Posts', 'get comments', r.status === 200, 'status=' + r.status + ' count=' + (r.json?.data?.comments?.length || r.json?.data?.length || 0));

      // Feed (cursor-based)
      r = await api('GET', '/posts/feed?limit=5', null, user1Token);
      log('Posts', 'feed', r.status === 200, 'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 150));

      // Trending
      r = await api('GET', '/posts/trending?limit=5', null, user1Token);
      log('Posts', 'trending', r.status === 200, 'status=' + r.status);

      // User posts
      r = await api('GET', '/posts/user/' + user1Account + '?limit=5', null, user1Token);
      log('Posts', 'user posts', r.status === 200, 'status=' + r.status);

      // Delete post
      r = await api('DELETE', '/posts/' + postId, null, user1Token);
      log('Posts', 'delete post', r.status === 200 || r.status === 204, 'status=' + r.status);
    } else {
      ['get by id', 'like post', 'unlike post', 'add comment', 'get comments', 'feed', 'trending', 'user posts', 'delete post'].forEach(t =>
        log('Posts', t, false, 'BLOCKED: no postId from create'));
    }

    // === SUITE 7: CONVERSATIONS (corrected DTO) ===
    console.log('\n=== SUITE 7: CONVERSATIONS ===');

    r = await api('POST', '/conversations', {
      participantAccountIds: [user2Account],
      type: 'direct'
    }, user1Token);
    log('Conversations', 'create direct', r.status === 200 || r.status === 201,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));
    const topicId = r.json?.data?.topicId || r.json?.data?.id;

    if (topicId) {
      // Send message
      r = await api('POST', '/conversations/' + topicId + '/messages', { content: 'Hello from QA ' + suffix }, user1Token);
      log('Conversations', 'send message', r.status === 200 || r.status === 201,
        'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 100));

      // Get messages
      r = await api('GET', '/conversations/' + topicId + '/messages', null, user1Token);
      log('Conversations', 'get messages', r.status === 200,
        'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 100));

      // List conversations
      r = await api('GET', '/conversations', null, user1Token);
      log('Conversations', 'list conversations', r.status === 200,
        'status=' + r.status + ' count=' + (r.json?.data?.length || 0));

      // User2 sees conversation
      r = await api('GET', '/conversations', null, user2Token);
      log('Conversations', 'user2 sees conv', r.status === 200 && (r.json?.data?.length || 0) > 0,
        'status=' + r.status + ' count=' + (r.json?.data?.length || 0));
    } else {
      ['send message', 'get messages', 'list conversations', 'user2 sees conv'].forEach(t =>
        log('Conversations', t, false, 'BLOCKED: no topicId. Create response: ' + JSON.stringify(r.json)?.substring(0, 100)));
    }

    // Create group conversation
    r = await api('POST', '/conversations', {
      participantAccountIds: [user2Account],
      type: 'group',
      groupName: 'QA Test Group ' + suffix
    }, user1Token);
    log('Conversations', 'create group', r.status === 200 || r.status === 201,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 150));

    // === SUITE 8: PAYMENTS (request DTO check) ===
    console.log('\n=== SUITE 8: PAYMENTS ===');

    // Try payment request with various field combos
    r = await api('POST', '/payments/request', {
      amount: 1,
      recipientAccountId: user2Account,
      memo: 'QA test request'
    }, user1Token);
    log('Payments', 'request (recipientAccountId)', r.status === 200 || r.status === 201,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));

    if (r.status >= 400) {
      // Try with fromAccountId
      r = await api('POST', '/payments/request', {
        amount: 1,
        fromAccountId: user2Account,
        memo: 'QA test request v2'
      }, user1Token);
      log('Payments', 'request (fromAccountId)', r.status === 200 || r.status === 201,
        'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));
    }

    if (r.status >= 400) {
      // Try with requestFromAccountId
      r = await api('POST', '/payments/request', {
        amount: 1,
        requestFromAccountId: user2Account,
        memo: 'QA test request v3'
      }, user1Token);
      log('Payments', 'request (requestFromAccountId)', r.status === 200 || r.status === 201,
        'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));
    }

    // === SUITE 9: NOTIFICATIONS pagination (cursor-based) ===
    console.log('\n=== SUITE 9: NOTIFICATIONS ===');
    r = await api('GET', '/notifications?limit=5', null, user1Token);
    log('Notifications', 'cursor pagination', r.status === 200,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 150));

    // === SUITE 10: ORGANIZATIONS (corrected DTO: 'name' field) ===
    console.log('\n=== SUITE 10: ORGANIZATIONS ===');

    r = await api('POST', '/organizations', { name: 'QA Org ' + suffix }, user1Token);
    log('Orgs', 'create org', r.status === 200 || r.status === 201,
      'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 200));
    const orgId = r.json?.data?.id;

    if (orgId) {
      // Get my orgs
      r = await api('GET', '/organizations/me', null, user1Token);
      log('Orgs', 'list my orgs', r.status === 200,
        'status=' + r.status + ' count=' + (r.json?.data?.length || 0));

      // Get org details
      r = await api('GET', '/organizations/' + orgId, null, user1Token);
      log('Orgs', 'get org by id', r.status === 200,
        'status=' + r.status + ' body=' + JSON.stringify(r.json?.data)?.substring(0, 100));

      // Invite member
      r = await api('POST', '/organizations/' + orgId + '/invitations', {
        inviteeAccountId: user2Account,
        role: 'member'
      }, user1Token);
      log('Orgs', 'invite member', r.status === 200 || r.status === 201,
        'status=' + r.status + ' body=' + JSON.stringify(r.json)?.substring(0, 150));

      // List members
      r = await api('GET', '/organizations/' + orgId + '/members', null, user1Token);
      log('Orgs', 'list members', r.status === 200,
        'status=' + r.status + ' count=' + (r.json?.data?.length || 0));

      // Update org
      r = await api('PUT', '/organizations/' + orgId, { name: 'QA Org Updated ' + suffix }, user1Token);
      log('Orgs', 'update org', r.status === 200,
        'status=' + r.status);

      // List invitations
      r = await api('GET', '/organizations/' + orgId + '/invitations', null, user1Token);
      log('Orgs', 'list invitations', r.status === 200,
        'status=' + r.status + ' count=' + (r.json?.data?.length || 0));
    } else {
      ['list my orgs', 'get org by id', 'invite member', 'list members', 'update org', 'list invitations'].forEach(t =>
        log('Orgs', t, false, 'BLOCKED: no orgId. Create response: ' + JSON.stringify(r.json)?.substring(0, 100)));
    }

    // === SUMMARY ===
    console.log('\n====================================');
    console.log('=== RE-TEST SUMMARY ===');
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

    console.log('\nAll results:');
    results.forEach(r => {
      console.log(`  [${r.status}] ${r.suite} > ${r.test}: ${r.detail.substring(0, 100)}`);
    });

    await redis.quit();
  } catch (e) {
    console.error('FATAL ERROR:', e);
    await redis.quit();
  }
})();
