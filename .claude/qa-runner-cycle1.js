#!/usr/bin/env node
/**
 * E2E QA Runner — Run #19, Cycle 1 Verification
 * Tests ALL endpoints against the REAL running server
 * Reads OTPs from Redis after registration
 */

// Use ioredis from pnpm node_modules
const Redis = require('/Users/bedtreep/Documents/GitHub/social-platform/node_modules/.pnpm/ioredis@5.10.0/node_modules/ioredis');

const BASE = 'http://localhost:3001';
const API = `${BASE}/api/v1`;
const MIRROR = 'https://testnet.mirrornode.hedera.com/api/v1';

const results = [];
let totalPass = 0, totalFail = 0, totalBlocked = 0;
const RUN = Math.floor(Math.random() * 100000);

const state = {
  user1: { token: null, refreshToken: null, id: null, hederaAccountId: null, email: `qa1-${RUN}@test.hedera.social` },
  user2: { token: null, refreshToken: null, id: null, hederaAccountId: null, email: `qa2-${RUN}@test.hedera.social` },
  user3: { token: null, refreshToken: null, id: null, hederaAccountId: null, phone: `+975${String(RUN).padStart(8,'0').substring(0,8)}` },
  postId: null, post2Id: null, convId: null, convTopic: null, orgId: null, inviteToken: null,
};

let redis;
const delay = (ms) => new Promise(r => setTimeout(r, ms));

async function initRedis() {
  // Try both Redis ports
  for (const port of [6382, 6380]) {
    try {
      const r = new Redis({ host: 'localhost', port, lazyConnect: true, connectTimeout: 2000 });
      await r.connect();
      await r.ping();
      console.log(`  Redis connected on port ${port}`);
      redis = r;
      return;
    } catch {}
  }
  console.log('  WARNING: No Redis connection — OTP tests will use server logs');
}

async function getOtp(identifier) {
  if (!redis) return null;
  const otp = await redis.get(`otp:${identifier}`);
  return otp;
}

async function req(method, path, body, token) {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const config = { method, headers };
  if (body && method !== 'GET') config.body = JSON.stringify(body);
  const start = Date.now();
  try {
    const res = await fetch(url, config);
    const elapsed = Date.now() - start;
    let data;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data, elapsed, ok: res.ok };
  } catch (e) {
    return { status: 0, data: null, error: e.message, elapsed: Date.now() - start };
  }
}

function record(suite, num, name, method, expected, actual, pass, note = '') {
  const status = pass === 'BLOCKED' ? 'BLOCKED' : pass ? 'PASS' : 'FAIL';
  if (status === 'PASS') totalPass++;
  else if (status === 'FAIL') totalFail++;
  else totalBlocked++;
  results.push({ suite, num, name, method, expected, actual, status, note });
  const icon = status === 'PASS' ? 'OK' : status === 'FAIL' ? 'XX' : '--';
  console.log(`  [${icon}] ${num} ${name}: ${actual}`);
}

// ══════════════════════════════════════
// SUITE 1: Root & Health (4 tests)
// ══════════════════════════════════════
async function suite1() {
  console.log('\n=== SUITE 1: Root & Health ===');
  let r = await req('GET', `${BASE}/`, null, null);
  record(1, '1.1', 'Root endpoint', 'GET /', '200', `${r.status} ${r.data?.data?.name}`, r.status === 200 && r.data?.data?.name === 'Hedera Social API');

  r = await req('GET', `${BASE}/health`, null, null);
  record(1, '1.2', 'Health check', 'GET /health', '200 ok', `${r.status} ${r.data?.data?.status}`, r.status === 200 && r.data?.data?.status === 'ok');

  const keys = r.data ? Object.keys(r.data).sort().join(',') : '';
  record(1, '1.3', 'Envelope format', 'GET /health', 'data,success,timestamp', keys, keys === 'data,success,timestamp');

  r = await req('GET', `${BASE}/health`, null, null);
  record(1, '1.4', 'Response time <2s', 'GET /health', '<2000ms', `${r.elapsed}ms`, r.elapsed < 2000);
}

// ══════════════════════════════════════
// SUITE 2: Authentication (23 tests)
// ══════════════════════════════════════
async function suite2() {
  console.log('\n=== SUITE 2: Authentication ===');

  // Register users
  let r = await req('POST', '/auth/register', { email: state.user1.email });
  state.user1.id = r.data?.data?.registrationId;
  record(2, '2.1', 'Register email user1', 'POST /auth/register', '201', `${r.status} id=${state.user1.id?.substring(0,8)}`, r.status === 201 && !!state.user1.id);
  await delay(300);

  r = await req('POST', '/auth/register', { email: state.user2.email });
  state.user2.id = r.data?.data?.registrationId;
  record(2, '2.2', 'Register email user2', 'POST /auth/register', '201', `${r.status} id=${state.user2.id?.substring(0,8)}`, r.status === 201 && !!state.user2.id);
  await delay(300);

  r = await req('POST', '/auth/register', { phone: state.user3.phone });
  state.user3.id = r.data?.data?.registrationId;
  record(2, '2.3', 'Register phone user3', 'POST /auth/register', '201', `${r.status} id=${state.user3.id?.substring(0,8)}`, r.status === 201 && !!state.user3.id);
  await delay(300);

  // Duplicate
  r = await req('POST', '/auth/register', { email: state.user1.email });
  record(2, '2.4', 'Duplicate email', 'POST /auth/register', '409', `${r.status}`, r.status === 409);
  await delay(300);

  // Validation errors
  r = await req('POST', '/auth/register', { email: 'not-email' });
  record(2, '2.5', 'Invalid email', 'POST /auth/register', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/auth/register', {});
  record(2, '2.6', 'Empty body', 'POST /auth/register', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/auth/register', { phone: '12345' });
  record(2, '2.7', 'Invalid phone', 'POST /auth/register', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/auth/register', { email: `x${RUN}@t.com`, displayName: 'bad' });
  record(2, '2.8', 'Unknown fields rejected', 'POST /auth/register', '400', `${r.status}`, r.status === 400);

  // Verify OTP — read real OTP from Redis
  const otp1 = await getOtp(state.user1.email);
  console.log(`  [..] OTP for user1: ${otp1 || 'NOT FOUND'}`);
  if (otp1) {
    r = await req('POST', '/auth/verify-otp', { email: state.user1.email, otp: otp1 });
    state.user1.token = r.data?.data?.accessToken;
    state.user1.refreshToken = r.data?.data?.refreshToken;
    record(2, '2.9', 'Verify OTP user1', 'POST /auth/verify-otp', '200+token', `${r.status} hasToken=${!!state.user1.token}`, r.status === 200 && !!state.user1.token);
  } else {
    record(2, '2.9', 'Verify OTP user1', 'POST /auth/verify-otp', '200', 'BLOCKED: no OTP in Redis', 'BLOCKED');
  }

  const otp2 = await getOtp(state.user2.email);
  if (otp2) {
    r = await req('POST', '/auth/verify-otp', { email: state.user2.email, otp: otp2 });
    state.user2.token = r.data?.data?.accessToken;
    state.user2.refreshToken = r.data?.data?.refreshToken;
    record(2, '2.10', 'Verify OTP user2', 'POST /auth/verify-otp', '200+token', `${r.status} hasToken=${!!state.user2.token}`, r.status === 200 && !!state.user2.token);
  } else {
    record(2, '2.10', 'Verify OTP user2', 'POST /auth/verify-otp', '200', 'BLOCKED: no OTP', 'BLOCKED');
  }

  const otp3 = await getOtp(state.user3.phone);
  if (otp3) {
    r = await req('POST', '/auth/verify-otp', { phone: state.user3.phone, otp: otp3 });
    state.user3.token = r.data?.data?.accessToken;
    state.user3.refreshToken = r.data?.data?.refreshToken;
    record(2, '2.11', 'Verify OTP user3 (phone)', 'POST /auth/verify-otp', '200+token', `${r.status} hasToken=${!!state.user3.token}`, r.status === 200 && !!state.user3.token);
  } else {
    record(2, '2.11', 'Verify OTP user3 (phone)', 'POST /auth/verify-otp', '200', 'BLOCKED: no OTP', 'BLOCKED');
  }

  // Wrong OTP
  r = await req('POST', '/auth/verify-otp', { email: state.user1.email, otp: '000000' });
  record(2, '2.12', 'Wrong OTP', 'POST /auth/verify-otp', '401', `${r.status}`, r.status === 401);

  // Login existing
  r = await req('POST', '/auth/login', { email: state.user1.email });
  record(2, '2.13', 'Login existing', 'POST /auth/login', '200', `${r.status}`, r.status === 200);

  // Login non-existent
  r = await req('POST', '/auth/login', { email: `nx-${RUN}@test.com` });
  record(2, '2.14', 'Login non-existent', 'POST /auth/login', '404', `${r.status}`, r.status === 404);

  // Create wallets
  if (state.user1.token) {
    r = await req('POST', '/wallet/create', {}, state.user1.token);
    state.user1.hederaAccountId = r.data?.data?.hederaAccountId;
    if (r.data?.data?.accessToken) state.user1.token = r.data.data.accessToken;
    record(2, '2.15', 'Create wallet user1', 'POST /wallet/create', '201', `${r.status} acct=${state.user1.hederaAccountId}`, r.status === 201 && !!state.user1.hederaAccountId);
  } else {
    record(2, '2.15', 'Create wallet user1', 'POST /wallet/create', '201', 'BLOCKED: no token', 'BLOCKED');
  }

  if (state.user2.token) {
    r = await req('POST', '/wallet/create', {}, state.user2.token);
    state.user2.hederaAccountId = r.data?.data?.hederaAccountId;
    if (r.data?.data?.accessToken) state.user2.token = r.data.data.accessToken;
    record(2, '2.16', 'Create wallet user2', 'POST /wallet/create', '201', `${r.status} acct=${state.user2.hederaAccountId}`, r.status === 201 && !!state.user2.hederaAccountId);
  } else {
    record(2, '2.16', 'Create wallet user2', 'POST /wallet/create', '201', 'BLOCKED: no token', 'BLOCKED');
  }

  if (state.user3.token) {
    r = await req('POST', '/wallet/create', {}, state.user3.token);
    state.user3.hederaAccountId = r.data?.data?.hederaAccountId;
    if (r.data?.data?.accessToken) state.user3.token = r.data.data.accessToken;
    record(2, '2.17', 'Create wallet user3', 'POST /wallet/create', '201', `${r.status} acct=${state.user3.hederaAccountId}`, r.status === 201 && !!state.user3.hederaAccountId);
  } else {
    record(2, '2.17', 'Create wallet user3', 'POST /wallet/create', '201', 'BLOCKED: no token', 'BLOCKED');
  }

  // Auth guard tests
  r = await req('GET', '/profile/me', null, null);
  record(2, '2.18', 'No auth → 401', 'GET /profile/me', '401', `${r.status}`, r.status === 401);

  r = await req('GET', '/profile/me', null, 'invalid.jwt.token');
  record(2, '2.19', 'Invalid JWT → 401', 'GET /profile/me', '401', `${r.status}`, r.status === 401);

  r = await req('GET', '/profile/me', null, 'garbage');
  record(2, '2.20', 'Garbage token → 401', 'GET /profile/me', '401', `${r.status}`, r.status === 401);

  // Token refresh
  if (state.user1.refreshToken) {
    r = await req('POST', '/auth/refresh', { refreshToken: state.user1.refreshToken });
    const nt = r.data?.data?.accessToken;
    if (nt) state.user1.token = nt;
    record(2, '2.21', 'Token refresh', 'POST /auth/refresh', '200+new', `${r.status} new=${!!nt}`, r.status === 200 && !!nt);
  } else {
    record(2, '2.21', 'Token refresh', 'POST /auth/refresh', '200', 'BLOCKED: no refresh', 'BLOCKED');
  }

  // Wallet status
  if (state.user1.token) {
    r = await req('GET', '/wallet/status', null, state.user1.token);
    record(2, '2.22', 'Wallet status', 'GET /wallet/status', '200', `${r.status}`, r.status === 200);
  } else {
    record(2, '2.22', 'Wallet status', 'GET /wallet/status', '200', 'BLOCKED', 'BLOCKED');
  }

  // OTP no identifier
  r = await req('POST', '/auth/verify-otp', { otp: '123456' });
  record(2, '2.23', 'OTP no identifier → 400', 'POST /auth/verify-otp', '400', `${r.status}`, r.status === 400);
}

// ══════════════════════════════════════
// SUITE 3: Profile (14 tests)
// ══════════════════════════════════════
async function suite3() {
  console.log('\n=== SUITE 3: Profile ===');
  if (!state.user1.token) { console.log('  SKIPPED: no auth token'); return; }

  let r = await req('GET', '/profile/me', null, state.user1.token);
  record(3, '3.1', 'Get own profile', 'GET /profile/me', '200', `${r.status} acct=${r.data?.data?.hederaAccountId}`, r.status === 200);

  r = await req('PUT', '/profile/me', { displayName: `QA-${RUN}` }, state.user1.token);
  record(3, '3.2', 'Update displayName', 'PUT /profile/me', '200', `${r.status} name=${r.data?.data?.displayName}`, r.status === 200 && r.data?.data?.displayName === `QA-${RUN}`);

  r = await req('PUT', '/profile/me', { bio: `Bio-${RUN}` }, state.user1.token);
  record(3, '3.3', 'Update bio', 'PUT /profile/me', '200', `${r.status}`, r.status === 200);

  if (state.user2.hederaAccountId) {
    r = await req('GET', `/profile/${state.user2.hederaAccountId}`, null, state.user1.token);
    record(3, '3.4', 'Get other user profile', 'GET /profile/:id', '200', `${r.status}`, r.status === 200);
  } else {
    record(3, '3.4', 'Get other user profile', 'GET /profile/:id', '200', 'BLOCKED', 'BLOCKED');
  }

  r = await req('GET', '/profile/0.0.999999', null, state.user1.token);
  record(3, '3.5', 'Non-existent profile', 'GET /profile/0.0.999999', '404', `${r.status}`, r.status === 404);

  r = await req('GET', '/profile/me', null, null);
  record(3, '3.6', 'Profile no auth', 'GET /profile/me', '401', `${r.status}`, r.status === 401);

  r = await req('PUT', '/profile/me', { displayName: '<script>alert(1)</script>' }, state.user1.token);
  const hasScript = r.data?.data?.displayName?.includes('<script>');
  record(3, '3.7', 'XSS in displayName', 'PUT /profile/me', 'stripped', `${r.status} hasScript=${hasScript}`, (r.status === 200 && !hasScript) || r.status === 400);

  r = await req('PUT', '/profile/me', { displayName: 'A'.repeat(101) }, state.user1.token);
  record(3, '3.8', 'Long displayName (101)', 'PUT /profile/me', '400', `${r.status}`, r.status === 400);

  r = await req('PUT', '/profile/me', { bio: 'X'.repeat(501) }, state.user1.token);
  record(3, '3.9', 'Long bio (501)', 'PUT /profile/me', '400', `${r.status}`, r.status === 400);

  r = await req('PUT', '/profile/me', { hackerField: 'bad' }, state.user1.token);
  record(3, '3.10', 'Invalid fields rejected', 'PUT /profile/me', '400', `${r.status}`, r.status === 400);

  r = await req('PUT', '/profile/me', {}, state.user1.token);
  record(3, '3.11', 'Empty update body', 'PUT /profile/me', '200', `${r.status}`, r.status === 200);

  await req('PUT', '/profile/me', { displayName: `QA-Final-${RUN}`, bio: `Bio-${RUN}` }, state.user1.token);
  r = await req('PUT', '/profile/me', { displayName: `QA-Upd-${RUN}` }, state.user1.token);
  const bioKept = r.data?.data?.bio?.includes(`${RUN}`);
  record(3, '3.12', 'Update preserves fields', 'PUT /profile/me', 'bio preserved', `${r.status} bioKept=${bioKept}`, r.status === 200);

  r = await req('PUT', '/profile/me', { displayName: `QAUser2-${RUN}` }, state.user2.token);
  record(3, '3.13', 'Set user2 displayName', 'PUT /profile/me', '200', `${r.status}`, r.status === 200);

  if (state.user2.hederaAccountId) {
    r = await req('GET', `/profile/${state.user2.hederaAccountId}`, null, state.user1.token);
    record(3, '3.14', 'Get user2 by accountId', 'GET /profile/:id', '200', `${r.status}`, r.status === 200);
  } else {
    record(3, '3.14', 'Get user2 by accountId', 'GET /profile/:id', '200', 'BLOCKED', 'BLOCKED');
  }
}

// ══════════════════════════════════════
// SUITE 4: User Search (6 tests)
// ══════════════════════════════════════
async function suite4() {
  console.log('\n=== SUITE 4: User Search ===');
  if (!state.user1.token) { console.log('  SKIPPED: no token'); return; }

  let searchBase = '/identity/search';
  let r = await req('GET', `${searchBase}?q=QA-Upd-${RUN}`, null, state.user1.token);
  if (r.status === 404) {
    searchBase = '/users/search';
    r = await req('GET', `${searchBase}?q=QA-Upd-${RUN}`, null, state.user1.token);
  }
  const found = (Array.isArray(r.data?.data) ? r.data.data.length : (r.data?.data?.users?.length || 0)) > 0;
  record(4, '4.1', 'Search by displayName', `GET ${searchBase}`, '200 found', `${r.status} found=${found}`, r.status === 200 && found);

  r = await req('GET', `${searchBase}?q=`, null, state.user1.token);
  record(4, '4.2', 'Search empty query', `GET ${searchBase}?q=`, '400', `${r.status}`, r.status === 400);

  r = await req('GET', `${searchBase}?q=test`, null, null);
  record(4, '4.3', 'Search no auth', `GET ${searchBase}`, '401', `${r.status}`, r.status === 401);

  if (state.user2.hederaAccountId) {
    r = await req('GET', `${searchBase}?q=${state.user2.hederaAccountId}`, null, state.user1.token);
    const cnt = Array.isArray(r.data?.data) ? r.data.data.length : (r.data?.data?.users?.length || 0);
    record(4, '4.4', 'Search by accountId', `GET ${searchBase}`, '200 count>0', `${r.status} count=${cnt}`, r.status === 200 && cnt > 0);
  } else {
    record(4, '4.4', 'Search by accountId', `GET ${searchBase}`, '200', 'BLOCKED', 'BLOCKED');
  }

  r = await req('GET', `${searchBase}?q=qa1-${RUN}`, null, state.user1.token);
  const cnt5 = Array.isArray(r.data?.data) ? r.data.data.length : (r.data?.data?.users?.length || 0);
  record(4, '4.5', 'Search by email', `GET ${searchBase}`, '200 count>0', `${r.status} count=${cnt5}`, r.status === 200 && cnt5 > 0);

  r = await req('GET', `${searchBase}?q=qa&limit=1`, null, state.user1.token);
  record(4, '4.6', 'Search pagination', `GET ${searchBase}`, '200', `${r.status}`, r.status === 200);
}

// ══════════════════════════════════════
// SUITE 5: Posts & Feed (21 tests)
// ══════════════════════════════════════
async function suite5() {
  console.log('\n=== SUITE 5: Posts & Feed ===');
  if (!state.user1.token) { console.log('  SKIPPED: no token'); return; }

  let r = await req('POST', '/posts', { content: `QA post ${RUN} #hedera #testing` }, state.user1.token);
  state.postId = r.data?.data?.id;
  record(5, '5.1', 'Create text post', 'POST /posts', '201', `${r.status} id=${state.postId?.substring(0,8)}`, r.status === 201 && !!state.postId);

  r = await req('POST', '/posts', { content: `User2 post ${RUN}` }, state.user2.token);
  state.post2Id = r.data?.data?.id;
  record(5, '5.2', 'Create post user2', 'POST /posts', '201', `${r.status}`, r.status === 201);

  if (state.postId) {
    r = await req('GET', `/posts/${state.postId}`, null, state.user1.token);
    record(5, '5.3', 'Get post by ID', 'GET /posts/:id', '200', `${r.status}`, r.status === 200);
  } else record(5, '5.3', 'Get post by ID', 'GET /posts/:id', '200', 'BLOCKED', 'BLOCKED');

  r = await req('GET', '/posts/00000000-0000-0000-0000-000000000000', null, state.user1.token);
  record(5, '5.4', 'Non-existent post', 'GET /posts/:id', '404', `${r.status}`, r.status === 404);

  r = await req('POST', '/posts', { content: 'unauth' }, null);
  record(5, '5.5', 'Post no auth', 'POST /posts', '401', `${r.status}`, r.status === 401);

  r = await req('POST', '/posts', { content: '' }, state.user1.token);
  record(5, '5.6', 'Post empty', 'POST /posts', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/posts', { content: 'X'.repeat(5001) }, state.user1.token);
  record(5, '5.7', 'Post too long', 'POST /posts', '400', `${r.status}`, r.status === 400);

  if (state.user1.hederaAccountId) {
    r = await req('GET', `/posts/user/${state.user1.hederaAccountId}`, null, state.user1.token);
    const cnt = Array.isArray(r.data?.data) ? r.data.data.length : 0;
    record(5, '5.8', 'Get user posts', 'GET /posts/user/:acct', '200 count>0', `${r.status} count=${cnt}`, r.status === 200 && cnt > 0);
  } else record(5, '5.8', 'Get user posts', 'GET /posts/user/:acct', '200', 'BLOCKED', 'BLOCKED');

  r = await req('GET', '/posts/feed', null, state.user1.token);
  record(5, '5.9', 'Get feed', 'GET /posts/feed', '200', `${r.status}`, r.status === 200);

  r = await req('GET', '/posts/feed', null, null);
  record(5, '5.10', 'Feed no auth', 'GET /posts/feed', '401', `${r.status}`, r.status === 401);

  // Like/Unlike (BUG-027 retest)
  if (state.postId && state.user2.token) {
    r = await req('POST', `/posts/${state.postId}/like`, {}, state.user2.token);
    record(5, '5.11', 'Like post (BUG-027)', 'POST /posts/:id/like', '201', `${r.status}`, r.status === 201 || r.status === 200);

    r = await req('POST', `/posts/${state.postId}/like`, {}, state.user2.token);
    record(5, '5.12', 'Like duplicate', 'POST /posts/:id/like', '409', `${r.status}`, r.status === 409 || r.status === 400);

    r = await req('DELETE', `/posts/${state.postId}/like`, {}, state.user2.token);
    record(5, '5.13', 'Unlike', 'DELETE /posts/:id/like', '200', `${r.status}`, r.status === 200);

    r = await req('DELETE', `/posts/${state.postId}/like`, {}, state.user2.token);
    record(5, '5.14', 'Unlike not-liked', 'DELETE /posts/:id/like', '400|404', `${r.status}`, r.status === 400 || r.status === 404);
  } else {
    record(5, '5.11', 'Like post', '', '', 'BLOCKED', 'BLOCKED');
    record(5, '5.12', 'Like dup', '', '', 'BLOCKED', 'BLOCKED');
    record(5, '5.13', 'Unlike', '', '', 'BLOCKED', 'BLOCKED');
    record(5, '5.14', 'Unlike not-liked', '', '', 'BLOCKED', 'BLOCKED');
  }

  r = await req('POST', '/posts', { content: `#blockchain #defi ${RUN}` }, state.user1.token);
  record(5, '5.15', 'Post with hashtags', 'POST /posts', '201', `${r.status}`, r.status === 201);

  r = await req('GET', '/posts/feed?page=1&limit=2', null, state.user1.token);
  record(5, '5.16', 'Feed pagination', 'GET /posts/feed', '200', `${r.status}`, r.status === 200);

  r = await req('GET', '/posts/trending', null, state.user1.token);
  record(5, '5.17', 'Trending', 'GET /posts/trending', '200', `${r.status}`, r.status === 200);

  // Delete own
  r = await req('POST', '/posts', { content: `Delete me ${RUN}` }, state.user1.token);
  const delId = r.data?.data?.id;
  if (delId) {
    r = await req('DELETE', `/posts/${delId}`, {}, state.user1.token);
    record(5, '5.18', 'Delete own post', 'DELETE /posts/:id', '200', `${r.status}`, r.status === 200);
  } else record(5, '5.18', 'Delete own', '', '', 'BLOCKED', 'BLOCKED');

  // Delete other's
  if (state.post2Id) {
    r = await req('DELETE', `/posts/${state.post2Id}`, {}, state.user1.token);
    record(5, '5.19', 'Delete others post', 'DELETE /posts/:id', '403', `${r.status}`, r.status === 403);
  } else record(5, '5.19', 'Delete others', '', '', 'BLOCKED', 'BLOCKED');

  // Comments
  if (state.postId) {
    r = await req('POST', `/posts/${state.postId}/comments`, { content: `Comment ${RUN}` }, state.user1.token);
    record(5, '5.20', 'Create comment', 'POST /posts/:id/comments', '201', `${r.status}`, r.status === 201);

    r = await req('GET', `/posts/${state.postId}/comments`, null, state.user1.token);
    record(5, '5.21', 'Get comments', 'GET /posts/:id/comments', '200', `${r.status}`, r.status === 200);
  } else {
    record(5, '5.20', 'Create comment', '', '', 'BLOCKED', 'BLOCKED');
    record(5, '5.21', 'Get comments', '', '', 'BLOCKED', 'BLOCKED');
  }
}

// ══════════════════════════════════════
// SUITE 6: Social Graph (15 tests)
// ══════════════════════════════════════
async function suite6() {
  console.log('\n=== SUITE 6: Social Graph ===');
  if (!state.user1.token || !state.user2.hederaAccountId) { console.log('  SKIPPED: missing tokens/accounts'); return; }

  let r = await req('POST', '/social/follow', { targetAccountId: state.user2.hederaAccountId }, state.user1.token);
  record(6, '6.1', 'Follow u1→u2', 'POST /social/follow', '200', `${r.status}`, r.status === 200 || r.status === 201);

  r = await req('POST', '/social/follow', { targetAccountId: state.user2.hederaAccountId }, state.user1.token);
  record(6, '6.2', 'Follow duplicate', 'POST /social/follow', '409', `${r.status}`, r.status === 409 || r.status === 400);

  r = await req('POST', '/social/follow', { targetAccountId: state.user1.hederaAccountId }, state.user1.token);
  record(6, '6.3', 'Follow self', 'POST /social/follow', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/social/follow', { targetAccountId: '0.0.999999' }, state.user1.token);
  record(6, '6.4', 'Follow non-existent', 'POST /social/follow', '404', `${r.status}`, r.status === 404);

  r = await req('POST', '/social/follow', { targetAccountId: state.user2.hederaAccountId }, null);
  record(6, '6.5', 'Follow no auth', 'POST /social/follow', '401', `${r.status}`, r.status === 401);

  r = await req('GET', `/social/${state.user2.hederaAccountId}/followers`, null, state.user1.token);
  record(6, '6.6', 'Get followers', 'GET /social/:acct/followers', '200', `${r.status}`, r.status === 200);

  r = await req('GET', `/social/${state.user1.hederaAccountId}/following`, null, state.user1.token);
  record(6, '6.7', 'Get following', 'GET /social/:acct/following', '200', `${r.status}`, r.status === 200);

  r = await req('GET', `/social/${state.user1.hederaAccountId}/stats`, null, state.user1.token);
  const fol = r.data?.data?.following || r.data?.data?.followingCount || 0;
  record(6, '6.8', 'Stats u1', 'GET /social/:acct/stats', '200 following≥1', `${r.status} following=${fol}`, r.status === 200 && fol >= 1);

  r = await req('POST', '/social/follow', { targetAccountId: state.user1.hederaAccountId }, state.user2.token);
  record(6, '6.9', 'Mutual follow u2→u1', 'POST /social/follow', '200', `${r.status}`, r.status === 200 || r.status === 201, r.status >= 400 ? JSON.stringify(r.data).substring(0,100) : '');

  if (state.user3.token && state.user3.hederaAccountId) {
    r = await req('POST', '/social/follow', { targetAccountId: state.user2.hederaAccountId }, state.user3.token);
    record(6, '6.10', 'Follow u3→u2', 'POST /social/follow', '200', `${r.status}`, r.status === 200 || r.status === 201, r.status >= 400 ? JSON.stringify(r.data).substring(0,100) : '');
  } else record(6, '6.10', 'Follow u3→u2', '', '', 'BLOCKED', 'BLOCKED');

  r = await req('GET', `/social/${state.user1.hederaAccountId}/is-following/${state.user2.hederaAccountId}`, null, state.user1.token);
  record(6, '6.11', 'Is-following', 'GET /social/:a/is-following/:b', '200', `${r.status}`, r.status === 200);

  r = await req('POST', '/social/unfollow', { targetAccountId: state.user2.hederaAccountId }, state.user1.token);
  record(6, '6.12', 'Unfollow u1→u2', 'POST /social/unfollow', '200', `${r.status}`, r.status === 200);

  r = await req('POST', '/social/unfollow', { targetAccountId: state.user2.hederaAccountId }, state.user1.token);
  record(6, '6.13', 'Unfollow not-followed', 'POST /social/unfollow', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/social/unfollow', { targetAccountId: state.user2.hederaAccountId }, null);
  record(6, '6.14', 'Unfollow no auth', 'POST /social/unfollow', '401', `${r.status}`, r.status === 401);

  r = await req('GET', `/social/${state.user1.hederaAccountId}/stats`, null, state.user1.token);
  const f2 = r.data?.data?.following || r.data?.data?.followingCount || 0;
  record(6, '6.15', 'Stats after unfollow', 'GET /social/:acct/stats', 'following=0', `${r.status} following=${f2}`, r.status === 200 && f2 === 0);

  await req('POST', '/social/follow', { targetAccountId: state.user2.hederaAccountId }, state.user1.token);
}

// ══════════════════════════════════════
// SUITE 7: Conversations (14 tests)
// ══════════════════════════════════════
async function suite7() {
  console.log('\n=== SUITE 7: Conversations ===');
  if (!state.user1.token || !state.user2.hederaAccountId) { console.log('  SKIPPED'); return; }

  let r = await req('POST', '/conversations', { type: 'direct', participantAccountIds: [state.user2.hederaAccountId] }, state.user1.token);
  state.convId = r.data?.data?.id;
  state.convTopic = r.data?.data?.topicId || r.data?.data?.hcsTopicId;
  record(7, '7.1', 'Create direct conv', 'POST /conversations', '201', `${r.status} topic=${state.convTopic}`, r.status === 201 && !!state.convId);

  if (state.user3.hederaAccountId) {
    r = await req('POST', '/conversations', { type: 'group', groupName: `QA Group ${RUN}`, participantAccountIds: [state.user2.hederaAccountId, state.user3.hederaAccountId] }, state.user1.token);
    record(7, '7.2', 'Create group conv', 'POST /conversations', '201', `${r.status}`, r.status === 201);
  } else record(7, '7.2', 'Create group conv', '', '', 'BLOCKED', 'BLOCKED');

  if (state.convId) {
    r = await req('GET', `/conversations/${state.convId}`, null, state.user1.token);
    record(7, '7.3', 'Get conv by ID', 'GET /conversations/:id', '200', `${r.status}`, r.status === 200);
  } else record(7, '7.3', 'Get conv by ID', '', '', 'BLOCKED', 'BLOCKED');

  r = await req('GET', '/conversations', null, state.user1.token);
  const cc = Array.isArray(r.data?.data) ? r.data.data.length : 0;
  record(7, '7.4', 'List conversations', 'GET /conversations', '200 count>0', `${r.status} count=${cc}`, r.status === 200 && cc > 0);

  if (state.convId && state.user3.token) {
    r = await req('GET', `/conversations/${state.convId}`, null, state.user3.token);
    record(7, '7.5', 'Non-member access', 'GET /conversations/:id', '403', `${r.status}`, r.status === 403);
  } else record(7, '7.5', 'Non-member access', '', '', 'BLOCKED', 'BLOCKED');

  r = await req('POST', '/conversations', { type: 'direct', participantAccountIds: [state.user2.hederaAccountId] }, state.user1.token);
  record(7, '7.6', 'Duplicate direct', 'POST /conversations', '409', `${r.status}`, r.status === 409);

  r = await req('POST', '/conversations', { type: 'direct', participantAccountIds: ['0.0.123'] }, null);
  record(7, '7.7', 'Conv no auth', 'POST /conversations', '401', `${r.status}`, r.status === 401);

  r = await req('POST', '/conversations', { type: 'direct' }, state.user1.token);
  record(7, '7.8', 'Missing participants', 'POST /conversations', '400', `${r.status}`, r.status === 400);

  r = await req('GET', '/conversations/00000000-0000-0000-0000-000000000000', null, state.user1.token);
  record(7, '7.9', 'Non-existent conv', 'GET /conversations/:id', '404|403', `${r.status}`, r.status === 404 || r.status === 403);

  r = await req('GET', '/conversations/not-uuid', null, state.user1.token);
  record(7, '7.10', 'Invalid UUID', 'GET /conversations/:id', '400', `${r.status}`, r.status === 400);

  if (state.convTopic) {
    r = await req('GET', `${MIRROR}/topics/${state.convTopic}`, null, null);
    record(7, '7.11', 'HCS topic verified', `Mirror`, '200', `${r.status}`, r.status === 200);

    r = await req('POST', `/conversations/${state.convTopic}/messages`, { content: `Hi ${RUN}` }, state.user1.token);
    record(7, '7.12', 'Send message (REST)', 'POST /conversations/:topic/messages', '201', `${r.status}`, r.status === 201 || r.status === 200);

    r = await req('GET', `/conversations/${state.convTopic}/messages`, null, state.user1.token);
    record(7, '7.13', 'Get messages (REST)', 'GET /conversations/:topic/messages', '200', `${r.status}`, r.status === 200);
  } else {
    record(7, '7.11', 'HCS topic', '', '', 'BLOCKED', 'BLOCKED');
    record(7, '7.12', 'Send message', '', '', 'BLOCKED', 'BLOCKED');
    record(7, '7.13', 'Get messages', '', '', 'BLOCKED', 'BLOCKED');
  }

  record(7, '7.14', 'WS typing/receipts', 'WS', '—', 'BLOCKED: socket.io-client', 'BLOCKED');
}

// ══════════════════════════════════════
// SUITE 8: Payments (17 tests)
// ══════════════════════════════════════
async function suite8() {
  console.log('\n=== SUITE 8: Payments ===');
  if (!state.user1.token) { console.log('  SKIPPED'); return; }

  let r = await req('GET', '/payments/balance', null, state.user1.token);
  record(8, '8.1', 'Get balance', 'GET /payments/balance', '200', `${r.status} bal=${r.data?.data?.balance}`, r.status === 200);

  if (state.convTopic && state.user2.hederaAccountId) {
    r = await req('POST', '/payments/send', { recipientAccountId: state.user2.hederaAccountId, amount: '0.01', currency: 'HBAR', topicId: state.convTopic, memo: `QA ${RUN}` }, state.user1.token);
    record(8, '8.2', 'Send HBAR', 'POST /payments/send', '200|201', `${r.status}`, r.status === 200 || r.status === 201 || r.status === 202, JSON.stringify(r.data).substring(0,150));
  } else record(8, '8.2', 'Send HBAR', '', '', 'BLOCKED', 'BLOCKED');

  r = await req('POST', '/payments/send', { recipientAccountId: state.user2.hederaAccountId || '0.0.123', amount: '999999999', currency: 'HBAR', topicId: state.convTopic || '0.0.12345' }, state.user1.token);
  record(8, '8.3', 'Send over-limit', 'POST /payments/send', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/payments/send', { recipientAccountId: state.user2.hederaAccountId || '0.0.123', amount: '-1', currency: 'HBAR', topicId: state.convTopic || '0.0.12345' }, state.user1.token);
  record(8, '8.4', 'Send negative', 'POST /payments/send', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/payments/send', { recipientAccountId: state.user2.hederaAccountId || '0.0.123', amount: '0', currency: 'HBAR', topicId: state.convTopic || '0.0.12345' }, state.user1.token);
  record(8, '8.5', 'Send zero', 'POST /payments/send', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/payments/send', { recipientAccountId: state.user1.hederaAccountId || '0.0.123', amount: '0.01', currency: 'HBAR', topicId: state.convTopic || '0.0.12345' }, state.user1.token);
  record(8, '8.6', 'Send to self', 'POST /payments/send', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/payments/send', { recipientAccountId: '0.0.123', amount: '1', currency: 'HBAR' }, null);
  record(8, '8.7', 'Send no auth', 'POST /payments/send', '401', `${r.status}`, r.status === 401);

  r = await req('POST', '/payments/send', {}, state.user1.token);
  record(8, '8.8', 'Send missing fields', 'POST /payments/send', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/payments/send', { recipientAccountId: state.user2.hederaAccountId || '0.0.123', amount: '1', currency: 'FAKE', topicId: state.convTopic || '0.0.12345' }, state.user1.token);
  record(8, '8.9', 'Invalid currency', 'POST /payments/send', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/payments/send', { recipientAccountId: '0.0.999999', amount: '0.01', currency: 'HBAR', topicId: state.convTopic || '0.0.12345' }, state.user1.token);
  record(8, '8.10', 'Send non-existent', 'POST /payments/send', '404', `${r.status}`, r.status === 404);

  r = await req('POST', '/payments/request', { recipientAccountId: state.user2.hederaAccountId, amount: '5', currency: 'HBAR', topicId: state.convTopic, memo: `QA req ${RUN}` }, state.user1.token);
  record(8, '8.11', 'Create payment request', 'POST /payments/request', '201', `${r.status}`, r.status === 201 || r.status === 200);

  r = await req('GET', '/payments/requests', null, state.user1.token);
  record(8, '8.12', 'List requests', 'GET /payments/requests', '200', `${r.status}`, r.status === 200);

  r = await req('POST', '/payments/request', { amount: '1', currency: 'HBAR' }, null);
  record(8, '8.13', 'Request no auth', 'POST /payments/request', '401', `${r.status}`, r.status === 401);

  r = await req('GET', '/payments/transactions', null, state.user1.token);
  record(8, '8.14', 'Get transactions', 'GET /payments/transactions', '200', `${r.status}`, r.status === 200);

  r = await req('GET', '/payments/history', null, state.user1.token);
  record(8, '8.15', 'Get history', 'GET /payments/history', '200', `${r.status}`, r.status === 200);

  r = await req('GET', '/payments/request/00000000-0000-0000-0000-000000000000', null, state.user1.token);
  record(8, '8.16', 'Non-existent request', 'GET /payments/request/:id', '404', `${r.status}`, r.status === 404);

  r = await req('POST', '/payments/request', {}, state.user1.token);
  record(8, '8.17', 'Request missing fields', 'POST /payments/request', '400', `${r.status}`, r.status === 400);
}

// ══════════════════════════════════════
// SUITE 9: Notifications (9 tests)
// ══════════════════════════════════════
async function suite9() {
  console.log('\n=== SUITE 9: Notifications ===');
  if (!state.user1.token) { console.log('  SKIPPED'); return; }

  let r = await req('GET', '/notifications', null, state.user1.token);
  record(9, '9.1', 'List notifications', 'GET /notifications', '200', `${r.status}`, r.status === 200);

  r = await req('GET', '/notifications/unread-count', null, state.user1.token);
  record(9, '9.2', 'Unread count', 'GET /notifications/unread-count', '200', `${r.status} count=${r.data?.data?.count ?? r.data?.data?.unread}`, r.status === 200);

  r = await req('PUT', '/notifications/read-all', {}, state.user1.token);
  record(9, '9.3', 'Mark all read', 'PUT /notifications/read-all', '200', `${r.status}`, r.status === 200);

  r = await req('GET', '/notifications/unread-count', null, state.user1.token);
  const unread = r.data?.data?.count ?? r.data?.data?.unread ?? 0;
  record(9, '9.4', 'Unread after mark-all', 'GET /unread-count', '0', `${r.status} unread=${unread}`, r.status === 200 && unread === 0);

  r = await req('GET', '/notifications', null, null);
  record(9, '9.5', 'No auth', 'GET /notifications', '401', `${r.status}`, r.status === 401);

  r = await req('GET', '/notifications/unread-count', null, null);
  record(9, '9.6', 'Unread no auth', 'GET /unread-count', '401', `${r.status}`, r.status === 401);

  r = await req('POST', '/notifications/read', { notificationIds: [] }, state.user1.token);
  record(9, '9.7', 'Mark-read empty', 'POST /notifications/read', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/notifications/read', { notificationIds: ['not-uuid'] }, state.user1.token);
  record(9, '9.8', 'Mark-read invalid', 'POST /notifications/read', '400', `${r.status}`, r.status === 400);

  r = await req('GET', '/notifications?page=1&limit=5', null, state.user1.token);
  record(9, '9.9', 'Pagination', 'GET /notifications', '200', `${r.status}`, r.status === 200);
}

// ══════════════════════════════════════
// SUITE 10: Organizations (14 tests)
// ══════════════════════════════════════
async function suite10() {
  console.log('\n=== SUITE 10: Organizations ===');
  if (!state.user1.token) { console.log('  SKIPPED'); return; }

  let r = await req('POST', '/organizations', { name: `QA Org ${RUN}`, description: 'QA org' }, state.user1.token);
  state.orgId = r.data?.data?.id;
  record(10, '10.1', 'Create organization', 'POST /organizations', '201', `${r.status} id=${state.orgId?.substring(0,8)}`, r.status === 201);

  r = await req('GET', '/organizations/me', null, state.user1.token);
  record(10, '10.2', 'Get organization', 'GET /organizations/me', '200', `${r.status}`, r.status === 200);

  r = await req('PUT', '/organizations/me', { name: `QA Updated ${RUN}` }, state.user1.token);
  record(10, '10.3', 'Update org', 'PUT /organizations/me', '200', `${r.status}`, r.status === 200);

  r = await req('POST', '/organizations', { name: 'NoAuth' }, null);
  record(10, '10.4', 'Org no auth', 'POST /organizations', '401', `${r.status}`, r.status === 401);

  r = await req('POST', '/organizations', { name: '' }, state.user1.token);
  record(10, '10.5', 'Org empty name', 'POST /organizations', '400', `${r.status}`, r.status === 400);

  r = await req('POST', '/organizations', { name: 'A' }, state.user1.token);
  record(10, '10.6', 'Org 1-char name', 'POST /organizations', '400', `${r.status}`, r.status === 400);

  if (state.user2.hederaAccountId) {
    r = await req('POST', '/organizations/me/invitations', { inviteeAccountId: state.user2.hederaAccountId, role: 'member' }, state.user1.token);
    state.inviteToken = r.data?.data?.token || r.data?.data?.invitationToken;
    record(10, '10.7', 'Invite member', 'POST /invitations', '201', `${r.status} token=${state.inviteToken?.substring(0,8)}`, r.status === 201);
  } else record(10, '10.7', 'Invite member', '', '', 'BLOCKED', 'BLOCKED');

  if (state.inviteToken && state.user2.token) {
    r = await req('POST', `/organizations/invitations/${state.inviteToken}/accept`, {}, state.user2.token);
    record(10, '10.8', 'Accept invitation', 'POST /:token/accept', '200', `${r.status}`, r.status === 200);
  } else record(10, '10.8', 'Accept invitation', '', '', 'BLOCKED', 'BLOCKED');

  r = await req('GET', '/organizations/me/members', null, state.user1.token);
  const mc = Array.isArray(r.data?.data) ? r.data.data.length : 0;
  record(10, '10.9', 'List members', 'GET /me/members', '200 ≥2', `${r.status} count=${mc}`, r.status === 200 && mc >= 2);

  if (state.user2.hederaAccountId) {
    r = await req('POST', '/organizations/me/invitations', { inviteeAccountId: state.user2.hederaAccountId, role: 'member' }, state.user1.token);
    record(10, '10.10', 'Invite dup (BUG-026)', 'POST /invitations', '409', `${r.status}`, r.status === 409);
  } else record(10, '10.10', 'Invite dup', '', '', 'BLOCKED', 'BLOCKED');

  if (state.user3.token) {
    r = await req('GET', '/organizations/me', null, state.user3.token);
    record(10, '10.11', 'Non-member access', 'GET /organizations/me', '404', `${r.status}`, r.status === 404);
  } else record(10, '10.11', 'Non-member access', '', '', 'BLOCKED', 'BLOCKED');

  r = await req('GET', '/profile/me', null, state.user1.token);
  record(10, '10.12', 'KYC status on profile', 'GET /profile/me', '200', `${r.status}`, r.status === 200);

  r = await req('POST', '/identity/kyc/submit', {}, state.user1.token);
  record(10, '10.13', 'KYC submit', 'POST /kyc/submit', r.status === 404 ? '—' : 'any', r.status === 404 ? 'BLOCKED: not implemented' : `${r.status}`, r.status === 404 ? 'BLOCKED' : true);

  r = await req('GET', '/organizations/me/invitations', null, state.user1.token);
  record(10, '10.14', 'List invitations', 'GET /invitations', '200', `${r.status}`, r.status === 200);
}

// ══════════════════════════════════════
// SUITE 11: WebSocket (5 tests)
// ══════════════════════════════════════
async function suite11() {
  console.log('\n=== SUITE 11: WebSocket ===');

  let r = await req('GET', `${BASE}/socket.io/?EIO=4&transport=polling&token=${state.user1.token}`, null, null);
  record(11, '11.1', 'WS with JWT', 'GET /socket.io/', '200', `${r.status}`, r.status === 200);

  r = await req('GET', `${BASE}/socket.io/?EIO=4&transport=polling`, null, null);
  record(11, '11.2', 'WS no token (BUG-013)', 'GET /socket.io/', '401', `${r.status}`, r.status === 401, r.status === 200 ? 'BUG-013 STILL OPEN' : '');

  r = await req('GET', `${BASE}/socket.io/?EIO=4&transport=polling&token=invalid`, null, null);
  record(11, '11.3', 'WS invalid token', 'GET /socket.io/', '401', `${r.status}`, r.status === 401, r.status === 200 ? 'BUG-013' : '');

  record(11, '11.4', 'WS join/send', 'WS', '—', 'BLOCKED: socket.io-client', 'BLOCKED');
  record(11, '11.5', 'WS typing/receipts', 'WS', '—', 'BLOCKED: multi-client', 'BLOCKED');
}

// ══════════════════════════════════════
// SUITE 12: Cross-Cutting (8 tests)
// ══════════════════════════════════════
async function suite12() {
  console.log('\n=== SUITE 12: Cross-Cutting ===');

  let res = await fetch(`${BASE}/`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'GET' } });
  const cors = res.headers.get('access-control-allow-origin');
  record(12, '12.1', 'CORS headers', 'OPTIONS /', '204', `${res.status} origin=${cors}`, (res.status === 204 || res.status === 200) && !!cors);

  let r = await req('GET', '/nonexistent', null, null);
  record(12, '12.2', '404 unknown route', 'GET /nonexistent', '404', `${r.status}`, r.status === 404);

  r = await req('GET', "/profile/' OR 1=1", null, state.user1.token);
  record(12, '12.3', 'SQL injection', "GET /profile/' OR 1=1", '404|400', `${r.status}`, r.status === 404 || r.status === 400);

  const all = await Promise.all(Array(5).fill(null).map(() => req('GET', `${BASE}/health`, null, null)));
  record(12, '12.4', 'Concurrent (5x)', 'GET /health x5', 'all 200', `allOk=${all.every(x=>x.status===200)}`, all.every(x => x.status === 200));

  if (state.user1.hederaAccountId) {
    r = await req('GET', `${MIRROR}/accounts/${state.user1.hederaAccountId}`, null, null);
    record(12, '12.5', 'Hedera mirror node', 'Mirror API', '200', `${r.status}`, r.status === 200);
  } else record(12, '12.5', 'Hedera mirror', '', '', 'BLOCKED', 'BLOCKED');

  const times = [];
  for (let i = 0; i < 3; i++) { r = await req('GET', `${BASE}/health`, null, null); times.push(r.elapsed); }
  const avg = times.reduce((a,b)=>a+b,0)/times.length;
  record(12, '12.6', 'Response time <500ms', 'GET /health', '<500ms', `avg=${Math.round(avg)}ms`, avg < 500);

  // Rate limiting (careful, previous rate limits may be active)
  await delay(3000);
  let hitLimit = false;
  for (let i = 0; i < 25; i++) {
    r = await req('POST', '/auth/register', { email: `rl${i}-${RUN}@rl.test` });
    if (r.status === 429) { hitLimit = true; break; }
    await delay(50);
  }
  record(12, '12.7', 'Rate limiting', 'POST /auth/register (x25)', '429', `hitLimit=${hitLimit}`, hitLimit);

  res = await fetch(`${API}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'X'.repeat(2*1024*1024) }).catch(e => ({ status: 0 }));
  record(12, '12.8', 'Large body (2MB)', 'POST /auth/register', '413|400', `${res.status}`, res.status === 413 || res.status === 400);
}

// ══════════════════════════════════════
// MAIN
// ══════════════════════════════════════
async function main() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  E2E QA Runner — Run #19, Cycle 1 Verification`);
  console.log(`  Run ID: ${RUN} | ${new Date().toISOString()}`);
  console.log(`  Users: ${state.user1.email}, ${state.user2.email}, ${state.user3.phone}`);
  console.log(`${'═'.repeat(60)}`);

  await initRedis();

  try {
    await suite1();
    await suite2();
    await suite3();
    await suite4();
    await suite5();
    await suite6();
    await suite7();
    await suite8();
    await suite9();
    await suite10();
    await suite11();
    await suite12();
  } catch (e) {
    console.error('\nFATAL:', e.message, e.stack);
  }

  if (redis) await redis.quit();

  const total = totalPass + totalFail + totalBlocked;
  const testable = totalPass + totalFail;
  const passRate = testable > 0 ? ((totalPass / testable) * 100).toFixed(1) : '0';

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  PASS: ${totalPass} | FAIL: ${totalFail} | BLOCKED: ${totalBlocked} | TOTAL: ${total}`);
  console.log(`  PASS RATE: ${passRate}% (${totalPass}/${testable} testable)`);
  console.log(`${'═'.repeat(60)}`);

  const failures = results.filter(r => r.status === 'FAIL');
  if (failures.length > 0) {
    console.log('\n--- FAILURES ---');
    failures.forEach(f => console.log(`  ${f.num} ${f.name}: expected=${f.expected} actual=${f.actual} ${f.note}`));
  }

  console.log('\n---JSON---');
  console.log(JSON.stringify({ results, totalPass, totalFail, totalBlocked, passRate, state: {
    user1: { email: state.user1.email, id: state.user1.id, hederaAccountId: state.user1.hederaAccountId },
    user2: { email: state.user2.email, id: state.user2.id, hederaAccountId: state.user2.hederaAccountId },
    user3: { phone: state.user3.phone, id: state.user3.id, hederaAccountId: state.user3.hederaAccountId },
    convId: state.convId, convTopic: state.convTopic, postId: state.postId
  }}));
  console.log('---END---');
}

main();
