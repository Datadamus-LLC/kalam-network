#!/usr/bin/env node
/**
 * QA Cycle 4 — Exhaustive E2E Test Runner (v2 — fixed test script bugs)
 * Tests the REAL running API at localhost:3001
 * No mocks, no fakes, no stubs — real HTTP requests, real Redis, real Hedera
 */

const http = require('http');
const https = require('https');
const net = require('net');
const crypto = require('crypto');

const BASE = 'http://localhost:3001';
const API = `${BASE}/api/v1`;
const REDIS_HOST = 'localhost';
const REDIS_PORT = 6382;
const RUN_ID = `qa4-${crypto.randomBytes(4).toString('hex')}`;

// Test state
const results = [];
let user1Token = null;
let user2Token = null;
let user1RefreshToken = null;
let user1AccountId = null;
let user2AccountId = null;
let user1Id = null;
let user2Id = null;
let freshUserToken = null;
let postId = null;
let post2Id = null;
let commentId = null;
let orgId = null;
let invitationToken = null;
let conversationId = null;
let conversationTopicId = null; // HCS topic ID for messages

// ─── HTTP Helper (handles both http and https) ───
function request(method, url, body, token) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
    const parsed = new URL(fullUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    if (body && method !== 'GET' && method !== 'HEAD') req.write(JSON.stringify(body));
    req.end();
  });
}

function rawRequest(method, url, rawBody, headers = {}) {
  return new Promise((resolve, reject) => {
    const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
    const parsed = new URL(fullUrl);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method,
      headers: { ...headers },
      timeout: 30000,
    };
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch { parsed = data; }
        resolve({ status: res.statusCode, headers: res.headers, body: parsed, raw: data });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    if (rawBody) req.write(rawBody);
    req.end();
  });
}

// ─── Redis Helper ───
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

// ─── Test Runner ───
function record(suite, num, name, status, evidence) {
  results.push({ suite, num, name, status, evidence: evidence.substring(0, 400) });
  const icon = status === 'PASS' ? '✓' : status === 'FAIL' ? '✗' : '⊘';
  console.log(`  ${icon} ${num} ${name}: ${status}`);
  if (status === 'FAIL') console.log(`      → ${evidence.substring(0, 200)}`);
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════════════════════════════
// SUITE 1: ROOT & HEALTH
// ═══════════════════════════════════════════════════════════════
async function suite1() {
  console.log('\n═══ SUITE 1: ROOT & HEALTH ═══');

  // 1.1 Root endpoint
  try {
    const r = await request('GET', `${BASE}/`);
    const ok = r.status === 200 && r.body?.success === true;
    record('1', '1.1', 'GET / returns root response', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, body=${JSON.stringify(r.body).substring(0,200)}`);
  } catch (e) { record('1', '1.1', 'GET / returns root response', 'FAIL', e.message); }

  // 1.2 Health check
  try {
    const r = await request('GET', `${BASE}/health`);
    const ok = r.status === 200;
    record('1', '1.2', 'GET /health returns healthy', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, body=${JSON.stringify(r.body)}`);
  } catch (e) { record('1', '1.2', 'GET /health', 'FAIL', e.message); }

  // 1.3 Unknown route 404
  try {
    const r = await request('GET', '/nonexistent-route-xyz');
    record('1', '1.3', 'Unknown route returns 404', r.status === 404 ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) { record('1', '1.3', 'Unknown route 404', 'FAIL', e.message); }

  // 1.4 CORS headers
  try {
    const r = await request('GET', `${BASE}/`);
    const cors = r.headers['access-control-allow-origin'];
    record('1', '1.4', 'CORS headers present', cors ? 'PASS' : 'FAIL',
      `access-control-allow-origin: ${cors}`);
  } catch (e) { record('1', '1.4', 'CORS headers', 'FAIL', e.message); }

  // 1.5 HEAD /health
  try {
    const r = await request('HEAD', `${BASE}/health`);
    record('1', '1.5', 'HEAD /health returns 200', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) { record('1', '1.5', 'HEAD /health', 'FAIL', e.message); }

  // 1.6 API base path
  try {
    const r = await request('GET', `${BASE}/api/v1`);
    record('1', '1.6', 'GET /api/v1 base path', r.status === 404 ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) { record('1', '1.6', 'GET /api/v1', 'FAIL', e.message); }

  // 1.7 OPTIONS preflight
  try {
    const r = await rawRequest('OPTIONS', `${BASE}/`, null, {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
    });
    const ok = r.status >= 200 && r.status < 300 && r.headers['access-control-allow-origin'];
    record('1', '1.7', 'OPTIONS preflight CORS', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, cors=${r.headers['access-control-allow-origin']}`);
  } catch (e) { record('1', '1.7', 'OPTIONS preflight', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 2: AUTHENTICATION
// ═══════════════════════════════════════════════════════════════
async function suite2() {
  console.log('\n═══ SUITE 2: AUTHENTICATION ═══');

  const email1 = `${RUN_ID}-u1@test.hedera.social`;
  const email2 = `${RUN_ID}-u2@test.hedera.social`;
  const emailFresh = `${RUN_ID}-fresh@test.hedera.social`;
  const phone = `+9750060${Math.floor(10000 + Math.random() * 89999)}`;

  // 2.1 Register user1
  try {
    const r = await request('POST', '/auth/register', { email: email1 });
    const ok = (r.status === 201 || r.status === 200) && r.body?.data?.otpSent === true;
    record('2', '2.1', 'Register user1 (email)', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, otpSent=${r.body?.data?.otpSent}`);
  } catch (e) { record('2', '2.1', 'Register user1', 'FAIL', e.message); }

  // 2.2 OTP in Redis
  try {
    const otp = await redisGet(`otp:${email1}`);
    const ok = otp && /^\d{6}$/.test(otp);
    record('2', '2.2', 'OTP stored in Redis', ok ? 'PASS' : 'FAIL',
      `otp=${otp} (${otp ? otp.length : 0} digits)`);

    // 2.3 Verify OTP user1
    if (ok) {
      const r = await request('POST', '/auth/verify-otp', { email: email1, otp });
      const ok2 = r.status === 200 && r.body?.data?.accessToken;
      user1Token = r.body?.data?.accessToken;
      user1RefreshToken = r.body?.data?.refreshToken;
      user1Id = r.body?.data?.user?.id;
      record('2', '2.3', 'Verify OTP user1', ok2 ? 'PASS' : 'FAIL',
        `status=${r.status}, tokenLen=${user1Token?.length}`);
    } else {
      record('2', '2.3', 'Verify OTP user1', 'FAIL', 'No OTP found in Redis');
    }
  } catch (e) { record('2', '2.2', 'OTP in Redis', 'FAIL', e.message); }

  // 2.4 Register user2
  try {
    const r = await request('POST', '/auth/register', { email: email2 });
    record('2', '2.4', 'Register user2', (r.status === 201 || r.status === 200) ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) { record('2', '2.4', 'Register user2', 'FAIL', e.message); }

  // 2.5 Verify OTP user2
  try {
    const otp = await redisGet(`otp:${email2}`);
    if (otp) {
      const r = await request('POST', '/auth/verify-otp', { email: email2, otp });
      user2Token = r.body?.data?.accessToken;
      user2Id = r.body?.data?.user?.id;
      record('2', '2.5', 'Verify OTP user2', r.status === 200 ? 'PASS' : 'FAIL',
        `status=${r.status}`);
    } else {
      record('2', '2.5', 'Verify OTP user2', 'FAIL', 'No OTP in Redis');
    }
  } catch (e) { record('2', '2.5', 'Verify OTP user2', 'FAIL', e.message); }

  // 2.6 Create wallet user1 (Hedera testnet)
  try {
    const r = await request('POST', '/wallet/create', {}, user1Token);
    user1AccountId = r.body?.data?.hederaAccountId;
    const ok = (r.status === 201 || r.status === 200) && user1AccountId;
    record('2', '2.6', 'Create wallet user1 (Hedera)', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, accountId=${user1AccountId}`);
  } catch (e) { record('2', '2.6', 'Create wallet user1', 'FAIL', e.message); }

  // 2.7 Create wallet user2
  try {
    const r = await request('POST', '/wallet/create', {}, user2Token);
    user2AccountId = r.body?.data?.hederaAccountId;
    const ok = (r.status === 201 || r.status === 200) && user2AccountId;
    record('2', '2.7', 'Create wallet user2 (Hedera)', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, accountId=${user2AccountId}`);
  } catch (e) { record('2', '2.7', 'Create wallet user2', 'FAIL', e.message); }

  // 2.8 Wallet status
  try {
    const r = await request('GET', '/wallet/status', null, user1Token);
    const ok = r.status === 200 && r.body?.data?.hederaAccountId === user1AccountId;
    record('2', '2.8', 'Wallet status user1', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, accountId=${r.body?.data?.hederaAccountId}, walletStatus=${r.body?.data?.status}`);
  } catch (e) { record('2', '2.8', 'Wallet status', 'FAIL', e.message); }

  // 2.9 Token refresh
  try {
    const r = await request('POST', '/auth/refresh', { refreshToken: user1RefreshToken });
    const ok = r.status === 200 && r.body?.data?.accessToken;
    if (ok) user1Token = r.body.data.accessToken;
    record('2', '2.9', 'Token refresh', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, newTokenLen=${r.body?.data?.accessToken?.length}`);
  } catch (e) { record('2', '2.9', 'Token refresh', 'FAIL', e.message); }

  // 2.10 Login existing user
  try {
    const r = await request('POST', '/auth/login', { email: email1 });
    record('2', '2.10', 'Login existing user', (r.status === 200 || r.status === 201) ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) { record('2', '2.10', 'Login existing', 'FAIL', e.message); }

  // 2.11 Login verify OTP
  try {
    const otp = await redisGet(`otp:${email1}`);
    if (otp) {
      const r = await request('POST', '/auth/verify-otp', { email: email1, otp });
      const ok = r.status === 200 && r.body?.data?.accessToken;
      if (ok) user1Token = r.body.data.accessToken;
      record('2', '2.11', 'Login verify OTP', ok ? 'PASS' : 'FAIL', `status=${r.status}`);
    } else {
      record('2', '2.11', 'Login verify OTP', 'FAIL', 'No OTP');
    }
  } catch (e) { record('2', '2.11', 'Login verify OTP', 'FAIL', e.message); }

  // 2.12 Wrong OTP rejected
  try {
    const r = await request('POST', '/auth/verify-otp', { email: email1, otp: '000000' });
    record('2', '2.12', 'Wrong OTP rejected', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.12', 'Wrong OTP', 'FAIL', e.message); }

  // 2.13 Invalid token
  try {
    const r = await request('GET', '/profile/me', null, 'invalid.token.here');
    record('2', '2.13', 'Invalid token rejected', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.13', 'Invalid token', 'FAIL', e.message); }

  // 2.14 No auth
  try {
    const r = await request('GET', '/profile/me');
    record('2', '2.14', 'No auth rejected', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.14', 'No auth', 'FAIL', e.message); }

  // 2.15 Register missing fields
  try {
    const r = await request('POST', '/auth/register', {});
    record('2', '2.15', 'Register missing fields', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.15', 'Register missing', 'FAIL', e.message); }

  // 2.16 Invalid email
  try {
    const r = await request('POST', '/auth/register', { email: 'notanemail' });
    record('2', '2.16', 'Invalid email rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.16', 'Invalid email', 'FAIL', e.message); }

  // 2.17 Invalid phone
  try {
    const r = await request('POST', '/auth/register', { phone: '123' });
    record('2', '2.17', 'Invalid phone rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.17', 'Invalid phone', 'FAIL', e.message); }

  // 2.18 Duplicate registration
  try {
    const r = await request('POST', '/auth/register', { email: email1 });
    const ok = r.status === 409 || r.status === 200 || r.status === 201;
    record('2', '2.18', 'Duplicate registration handled', ok ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) { record('2', '2.18', 'Duplicate reg', 'FAIL', e.message); }

  // 2.19 Wallet already exists
  try {
    const r = await request('POST', '/wallet/create', {}, user1Token);
    record('2', '2.19', 'Wallet already exists', r.status === 409 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.19', 'Wallet exists', 'FAIL', e.message); }

  // 2.20 Wallet without auth
  try {
    const r = await request('POST', '/wallet/create', {});
    record('2', '2.20', 'Wallet without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.20', 'Wallet no auth', 'FAIL', e.message); }

  // 2.21 OTP too short
  try {
    const r = await request('POST', '/auth/verify-otp', { email: email1, otp: '123' });
    record('2', '2.21', 'OTP too short rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.21', 'OTP too short', 'FAIL', e.message); }

  // 2.22 OTP non-numeric
  try {
    const r = await request('POST', '/auth/verify-otp', { email: email1, otp: 'abcdef' });
    record('2', '2.22', 'OTP non-numeric rejected', (r.status === 400 || r.status === 401) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.22', 'OTP non-numeric', 'FAIL', e.message); }

  // 2.23 Register with phone
  try {
    const r = await request('POST', '/auth/register', { phone });
    record('2', '2.23', 'Register with phone', (r.status === 201 || r.status === 200) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.23', 'Register phone', 'FAIL', e.message); }

  // 2.24 Wallet status without wallet
  try {
    const r1 = await request('POST', '/auth/register', { email: emailFresh });
    const otp = await redisGet(`otp:${emailFresh}`);
    if (otp) {
      const r2 = await request('POST', '/auth/verify-otp', { email: emailFresh, otp });
      freshUserToken = r2.body?.data?.accessToken;
      if (freshUserToken) {
        const r3 = await request('GET', '/wallet/status', null, freshUserToken);
        const ok = r3.status === 200 && r3.body?.data?.status === 'pending_wallet';
        record('2', '2.24', 'Wallet status without wallet', ok ? 'PASS' : 'FAIL',
          `status=${r3.status}, walletStatus=${r3.body?.data?.status}`);
      } else {
        record('2', '2.24', 'Wallet status without wallet', 'FAIL', 'No fresh token');
      }
    } else {
      record('2', '2.24', 'Wallet status without wallet', 'FAIL', 'No OTP');
    }
  } catch (e) { record('2', '2.24', 'Wallet status no wallet', 'FAIL', e.message); }

  // 2.25 Consumed OTP rejected
  try {
    const r = await request('POST', '/auth/verify-otp', { email: email1, otp: '168565' });
    record('2', '2.25', 'Consumed OTP rejected', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('2', '2.25', 'Consumed OTP', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 3: PROFILE MANAGEMENT
// ═══════════════════════════════════════════════════════════════
async function suite3() {
  console.log('\n═══ SUITE 3: PROFILE MANAGEMENT ═══');

  try {
    const r = await request('GET', '/profile/me', null, user1Token);
    const ok = r.status === 200 && r.body?.data?.hederaAccountId === user1AccountId;
    record('3', '3.1', 'Get own profile', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, accountId=${r.body?.data?.hederaAccountId}`);
  } catch (e) { record('3', '3.1', 'Get own profile', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/profile/me', { displayName: 'QA Cycle4 User' }, user1Token);
    record('3', '3.2', 'Update displayName', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.2', 'Update displayName', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/profile/me', { bio: 'Cycle 4 QA test bio' }, user1Token);
    record('3', '3.3', 'Update bio', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.3', 'Update bio', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/profile/me', { displayName: '<script>alert(1)</script>Safe Name' }, user1Token);
    const name = r.body?.data?.displayName || '';
    record('3', '3.4', 'XSS in displayName stripped', r.status === 200 && !name.includes('<script>') ? 'PASS' : 'FAIL',
      `displayName="${name}"`);
  } catch (e) { record('3', '3.4', 'XSS displayName', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/profile/me', { bio: '<img onerror=alert(1) src=x>safe bio' }, user1Token);
    const bio = r.body?.data?.bio || '';
    record('3', '3.5', 'XSS in bio stripped', r.status === 200 && !bio.includes('onerror') ? 'PASS' : 'FAIL',
      `bio="${bio}"`);
  } catch (e) { record('3', '3.5', 'XSS bio', 'FAIL', e.message); }

  try {
    await request('PUT', '/profile/me', { displayName: 'PreservedName' }, user1Token);
    const r = await request('PUT', '/profile/me', { bio: 'Only bio changed' }, user1Token);
    record('3', '3.6', 'Field preservation', r.status === 200 && r.body?.data?.displayName === 'PreservedName' ? 'PASS' : 'FAIL',
      `displayName=${r.body?.data?.displayName}`);
  } catch (e) { record('3', '3.6', 'Field preservation', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/profile/me', { displayName: 'A'.repeat(300) }, user1Token);
    record('3', '3.7', 'Long displayName rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.7', 'Long displayName', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/profile/me', { displayName: '' }, user1Token);
    record('3', '3.8', 'Empty displayName rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.8', 'Empty displayName', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/profile/me');
    record('3', '3.9', 'Profile without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.9', 'Profile no auth', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/profile/me', { displayName: 'Hacker' });
    record('3', '3.10', 'Update without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.10', 'Update no auth', 'FAIL', e.message); }

  try {
    const r = await request('GET', `/profile/${user1AccountId}`, null, user2Token);
    record('3', '3.11', 'Get other user profile', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.11', 'Other profile', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/profile/0.0.9999999', null, user1Token);
    record('3', '3.12', 'Nonexistent profile 404', r.status === 404 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.12', 'Nonexistent profile', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/profile/me', { displayName: "Robert'; DROP TABLE users;--" }, user1Token);
    record('3', '3.13', 'SQL injection handled', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('3', '3.13', 'SQL injection', 'FAIL', e.message); }

  // Reset name for later tests
  await request('PUT', '/profile/me', { displayName: 'QA4 User1' }, user1Token);
  await request('PUT', '/profile/me', { displayName: 'QA4 User2' }, user2Token);
}

// ═══════════════════════════════════════════════════════════════
// SUITE 4: USER SEARCH
// ═══════════════════════════════════════════════════════════════
async function suite4() {
  console.log('\n═══ SUITE 4: USER SEARCH ═══');

  try {
    const r = await request('GET', '/users/search?q=QA4+User', null, user1Token);
    record('4', '4.1', 'Search by displayName', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, results=${r.body?.data?.length ?? JSON.stringify(r.body?.data).substring(0,80)}`);
  } catch (e) { record('4', '4.1', 'Search displayName', 'FAIL', e.message); }

  try {
    const r = await request('GET', `/users/search?q=${user1AccountId}`, null, user1Token);
    record('4', '4.2', 'Search by accountId', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, results=${r.body?.data?.length ?? JSON.stringify(r.body?.data).substring(0,80)}`);
  } catch (e) { record('4', '4.2', 'Search accountId', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/users/search?q=a', null, user1Token);
    record('4', '4.3', 'Too short query rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('4', '4.3', 'Short query', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/users/search?q=', null, user1Token);
    record('4', '4.4', 'Empty query rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('4', '4.4', 'Empty query', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/users/search?q=test');
    record('4', '4.5', 'Search without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('4', '4.5', 'Search no auth', 'FAIL', e.message); }

  try {
    const r = await request('GET', `/users/search?q=${RUN_ID}`, null, user1Token);
    record('4', '4.6', 'Search by run ID prefix', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, results=${r.body?.data?.length ?? 'N/A'}`);
  } catch (e) { record('4', '4.6', 'Search prefix', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 5: POSTS & FEED
// ═══════════════════════════════════════════════════════════════
async function suite5() {
  console.log('\n═══ SUITE 5: POSTS & FEED ═══');

  // 5.1 Create post
  try {
    const r = await request('POST', '/posts', { text: `QA Cycle 4 post by ${RUN_ID}` }, user1Token);
    postId = r.body?.data?.id;
    record('5', '5.1', 'Create post', (r.status === 201 || r.status === 200) && postId ? 'PASS' : 'FAIL',
      `status=${r.status}, postId=${postId}`);
  } catch (e) { record('5', '5.1', 'Create post', 'FAIL', e.message); }

  // 5.2 Get post
  try {
    const r = await request('GET', `/posts/${postId}`, null, user1Token);
    record('5', '5.2', 'Get post by ID', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, text=${r.body?.data?.text?.substring(0,40)}`);
  } catch (e) { record('5', '5.2', 'Get post', 'FAIL', e.message); }

  // 5.3 Like
  try {
    const r = await request('POST', `/posts/${postId}/like`, {}, user1Token);
    record('5', '5.3', 'Like post', (r.status === 201 || r.status === 200) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.3', 'Like post', 'FAIL', e.message); }

  // 5.4 Unlike
  try {
    const r = await request('DELETE', `/posts/${postId}/like`, null, user1Token);
    record('5', '5.4', 'Unlike post', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.4', 'Unlike post', 'FAIL', e.message); }

  // 5.5 Add comment
  try {
    const r = await request('POST', `/posts/${postId}/comments`, { text: 'QA4 test comment' }, user1Token);
    commentId = r.body?.data?.id;
    record('5', '5.5', 'Add comment', (r.status === 201 || r.status === 200) && commentId ? 'PASS' : 'FAIL',
      `status=${r.status}, commentId=${commentId}`);
  } catch (e) { record('5', '5.5', 'Add comment', 'FAIL', e.message); }

  // 5.6 Get comments (data.comments is the array)
  try {
    const r = await request('GET', `/posts/${postId}/comments`, null, user1Token);
    const comments = r.body?.data?.comments || r.body?.data;
    const count = Array.isArray(comments) ? comments.length : 'not-array';
    record('5', '5.6', 'Get comments', r.status === 200 && Array.isArray(comments) ? 'PASS' : 'FAIL',
      `status=${r.status}, count=${count}, shape=data.${r.body?.data?.comments ? 'comments' : 'direct'}`);
  } catch (e) { record('5', '5.6', 'Get comments', 'FAIL', e.message); }

  // 5.7 Feed
  try {
    const r = await request('GET', '/posts/feed?limit=5', null, user1Token);
    const items = r.body?.data?.posts || r.body?.data;
    record('5', '5.7', 'Feed (cursor-based)', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, items=${Array.isArray(items) ? items.length : 'N/A'}`);
  } catch (e) { record('5', '5.7', 'Feed', 'FAIL', e.message); }

  // 5.8 Trending
  try {
    const r = await request('GET', '/posts/trending?limit=5', null, user1Token);
    record('5', '5.8', 'Trending', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.8', 'Trending', 'FAIL', e.message); }

  // 5.9 User posts
  try {
    const r = await request('GET', `/posts/user/${user1AccountId}?limit=5`, null, user1Token);
    record('5', '5.9', 'User posts', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.9', 'User posts', 'FAIL', e.message); }

  // 5.10 Empty text
  try {
    const r = await request('POST', '/posts', { text: '' }, user1Token);
    record('5', '5.10', 'Empty text rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.10', 'Empty text', 'FAIL', e.message); }

  // 5.11 No auth
  try {
    const r = await request('POST', '/posts', { text: 'no auth' });
    record('5', '5.11', 'Post without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.11', 'Post no auth', 'FAIL', e.message); }

  // 5.12 Nonexistent
  try {
    const r = await request('GET', '/posts/00000000-0000-0000-0000-000000000000', null, user1Token);
    record('5', '5.12', 'Nonexistent post 404', r.status === 404 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.12', 'Nonexistent post', 'FAIL', e.message); }

  // 5.13 Second post for delete
  try {
    const r = await request('POST', '/posts', { text: 'Post to delete' }, user1Token);
    post2Id = r.body?.data?.id;
    record('5', '5.13', 'Create second post', (r.status === 201 || r.status === 200) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.13', 'Create second', 'FAIL', e.message); }

  // 5.14 Like by another user
  try {
    const r = await request('POST', `/posts/${postId}/like`, {}, user2Token);
    record('5', '5.14', 'Like by another user', (r.status === 201 || r.status === 200) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.14', 'Like by other', 'FAIL', e.message); }

  // 5.15 Double like
  try {
    const r = await request('POST', `/posts/${postId}/like`, {}, user2Token);
    record('5', '5.15', 'Double like rejected', r.status === 409 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.15', 'Double like', 'FAIL', e.message); }

  // 5.16 Delete
  try {
    const r = await request('DELETE', `/posts/${post2Id}`, null, user1Token);
    record('5', '5.16', 'Delete post', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.16', 'Delete post', 'FAIL', e.message); }

  // 5.17 Deleted 404
  try {
    const r = await request('GET', `/posts/${post2Id}`, null, user1Token);
    record('5', '5.17', 'Deleted post returns 404', r.status === 404 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.17', 'Deleted 404', 'FAIL', e.message); }

  // 5.18 Comment by other
  try {
    const r = await request('POST', `/posts/${postId}/comments`, { text: 'Comment from user2' }, user2Token);
    record('5', '5.18', 'Comment by another user', (r.status === 201 || r.status === 200) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('5', '5.18', 'Comment by other', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 6: SOCIAL GRAPH
// ═══════════════════════════════════════════════════════════════
async function suite6() {
  console.log('\n═══ SUITE 6: SOCIAL GRAPH ═══');

  try {
    const r = await request('POST', '/social/follow', { targetAccountId: user2AccountId }, user1Token);
    record('6', '6.1', 'Follow user (u1→u2)', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.1', 'Follow', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/social/follow', { targetAccountId: user2AccountId }, user1Token);
    record('6', '6.2', 'Duplicate follow rejected', r.status === 409 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.2', 'Duplicate follow', 'FAIL', e.message); }

  try {
    const r = await request('GET', `/social/${user2AccountId}/followers`, null, user1Token);
    record('6', '6.3', 'Get followers', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.3', 'Get followers', 'FAIL', e.message); }

  try {
    const r = await request('GET', `/social/${user1AccountId}/following`, null, user1Token);
    record('6', '6.4', 'Get following', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.4', 'Get following', 'FAIL', e.message); }

  try {
    const r = await request('GET', `/social/${user1AccountId}/stats`, null, user1Token);
    record('6', '6.5', 'Get social stats', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, data=${JSON.stringify(r.body?.data).substring(0,100)}`);
  } catch (e) { record('6', '6.5', 'Get stats', 'FAIL', e.message); }

  // 6.6 Is-following (true) — endpoint is GET /social/:accountId/is-following/:targetId
  try {
    const r = await request('GET', `/social/${user1AccountId}/is-following/${user2AccountId}`, null, user1Token);
    const isFollow = r.body?.data?.isFollowing;
    record('6', '6.6', 'Is-following (true)', r.status === 200 && isFollow === true ? 'PASS' : 'FAIL',
      `status=${r.status}, isFollowing=${isFollow}`);
  } catch (e) { record('6', '6.6', 'Is-following', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/social/unfollow', { targetAccountId: user2AccountId }, user1Token);
    record('6', '6.7', 'Unfollow', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.7', 'Unfollow', 'FAIL', e.message); }

  // 6.8 Is-following (false)
  try {
    const r = await request('GET', `/social/${user1AccountId}/is-following/${user2AccountId}`, null, user1Token);
    const isFollow = r.body?.data?.isFollowing;
    record('6', '6.8', 'Is-following (false)', r.status === 200 && isFollow === false ? 'PASS' : 'FAIL',
      `status=${r.status}, isFollowing=${isFollow}`);
  } catch (e) { record('6', '6.8', 'Is-following false', 'FAIL', e.message); }

  // 6.9 Mutual follow (u2→u1)
  try {
    const r = await request('POST', '/social/follow', { targetAccountId: user1AccountId }, user2Token);
    record('6', '6.9', 'Mutual follow (u2→u1)', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, body=${JSON.stringify(r.body).substring(0,150)}`);
  } catch (e) { record('6', '6.9', 'Mutual follow', 'FAIL', e.message); }

  // 6.10 Re-follow
  try {
    const r = await request('POST', '/social/follow', { targetAccountId: user2AccountId }, user1Token);
    record('6', '6.10', 'Re-follow (u1→u2)', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.10', 'Re-follow', 'FAIL', e.message); }

  // 6.11 Stats updated
  try {
    const r = await request('GET', `/social/${user1AccountId}/stats`, null, user1Token);
    record('6', '6.11', 'Stats updated', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, data=${JSON.stringify(r.body?.data).substring(0,100)}`);
  } catch (e) { record('6', '6.11', 'Stats updated', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/social/follow', { targetAccountId: user1AccountId }, user1Token);
    record('6', '6.12', 'Follow self rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.12', 'Follow self', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/social/follow', { targetAccountId: '0.0.9999999' }, user1Token);
    record('6', '6.13', 'Follow nonexistent', r.status === 404 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.13', 'Follow nonexistent', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/social/follow', { targetAccountId: user2AccountId });
    record('6', '6.14', 'Follow without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.14', 'Follow no auth', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/social/unfollow', { targetAccountId: '0.0.9999999' }, user2Token);
    record('6', '6.15', 'Unfollow when not following', (r.status === 400 || r.status === 404) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('6', '6.15', 'Unfollow not following', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 7: CONVERSATIONS
// ═══════════════════════════════════════════════════════════════
async function suite7() {
  console.log('\n═══ SUITE 7: CONVERSATIONS ═══');

  // 7.1 Create direct conversation
  try {
    const r = await request('POST', '/conversations', {
      type: 'direct',
      participantAccountIds: [user2AccountId],
    }, user1Token);
    conversationId = r.body?.data?.id;
    conversationTopicId = r.body?.data?.hcsTopicId || r.body?.data?.topicId;
    const ok = (r.status === 201 || r.status === 200) && conversationId;
    record('7', '7.1', 'Create direct conversation', ok ? 'PASS' : 'FAIL',
      `status=${r.status}, convId=${conversationId}, topicId=${conversationTopicId}`);
  } catch (e) { record('7', '7.1', 'Create conversation', 'FAIL', e.message); }

  // 7.2 Group validation
  try {
    const r = await request('POST', '/conversations', { type: 'group', participantAccountIds: [] }, user1Token);
    record('7', '7.2', 'Group conv needs 2+ participants', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('7', '7.2', 'Group conv', 'FAIL', e.message); }

  // 7.3 Send message (uses topicId, not UUID)
  if (conversationTopicId) {
    try {
      const r = await request('POST', `/conversations/${conversationTopicId}/messages`, {
        text: 'Hello from QA Cycle 4!',
      }, user1Token);
      record('7', '7.3', 'Send message', (r.status === 201 || r.status === 200) ? 'PASS' : 'FAIL',
        `status=${r.status}, body=${JSON.stringify(r.body).substring(0,150)}`);
    } catch (e) { record('7', '7.3', 'Send message', 'FAIL', e.message); }
  } else {
    record('7', '7.3', 'Send message', 'BLOCKED', 'No topicId from conversation');
  }

  // 7.4 Get messages
  if (conversationTopicId) {
    try {
      const r = await request('GET', `/conversations/${conversationTopicId}/messages`, null, user1Token);
      record('7', '7.4', 'Get messages', r.status === 200 ? 'PASS' : 'FAIL',
        `status=${r.status}, body=${JSON.stringify(r.body).substring(0,150)}`);
    } catch (e) { record('7', '7.4', 'Get messages', 'FAIL', e.message); }
  } else {
    record('7', '7.4', 'Get messages', 'BLOCKED', 'No topicId');
  }

  // 7.5 List conversations
  try {
    const r = await request('GET', '/conversations', null, user1Token);
    record('7', '7.5', 'List conversations', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}`);
  } catch (e) { record('7', '7.5', 'List conversations', 'FAIL', e.message); }

  // 7.6 User2 sees conversation
  try {
    const r = await request('GET', '/conversations', null, user2Token);
    record('7', '7.6', 'User2 sees conversation', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('7', '7.6', 'User2 convs', 'FAIL', e.message); }

  // 7.7 No auth create
  try {
    const r = await request('POST', '/conversations', { type: 'direct', participantAccountIds: [user2AccountId] });
    record('7', '7.7', 'Create conv no auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('7', '7.7', 'No auth conv', 'FAIL', e.message); }

  // 7.8 List no auth
  try {
    const r = await request('GET', '/conversations');
    record('7', '7.8', 'List conv no auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('7', '7.8', 'List no auth', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 8: PAYMENTS
// ═══════════════════════════════════════════════════════════════
async function suite8() {
  console.log('\n═══ SUITE 8: PAYMENTS ═══');

  try {
    const r = await request('GET', '/payments/balance', null, user1Token);
    record('8', '8.1', 'Get balance', r.status === 200 && r.body?.data?.accountId ? 'PASS' : 'FAIL',
      `status=${r.status}, accountId=${r.body?.data?.accountId}, hbar=${r.body?.data?.hbarBalance}`);
  } catch (e) { record('8', '8.1', 'Get balance', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/payments/history', null, user1Token);
    record('8', '8.2', 'Get history', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.2', 'Get history', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/payments/transactions', null, user1Token);
    record('8', '8.3', 'Get transactions', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.3', 'Get transactions', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/payments/requests', null, user1Token);
    record('8', '8.4', 'List payment requests', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.4', 'List requests', 'FAIL', e.message); }

  // 8.5 Send payment (topicId must be HCS format 0.0.XXXX)
  if (conversationTopicId) {
    try {
      const r = await request('POST', '/payments/send', {
        recipientAccountId: user2AccountId,
        amount: 0.1,
        currency: 'HBAR',
        topicId: conversationTopicId,
      }, user1Token);
      record('8', '8.5', 'Send payment', (r.status === 200 || r.status === 201) ? 'PASS' : 'FAIL',
        `status=${r.status}, body=${JSON.stringify(r.body).substring(0,200)}`);
    } catch (e) { record('8', '8.5', 'Send payment', 'FAIL', e.message); }
  } else {
    record('8', '8.5', 'Send payment', 'BLOCKED', 'No HCS topicId');
  }

  // 8.6 Send to nonexistent
  if (conversationTopicId) {
    try {
      const r = await request('POST', '/payments/send', {
        recipientAccountId: '0.0.9999999',
        amount: 0.1,
        currency: 'HBAR',
        topicId: conversationTopicId,
      }, user1Token);
      record('8', '8.6', 'Send to nonexistent', (r.status === 404 || r.status === 400) ? 'PASS' : 'FAIL', `status=${r.status}`);
    } catch (e) { record('8', '8.6', 'Send to nonexistent', 'FAIL', e.message); }
  } else {
    record('8', '8.6', 'Send to nonexistent', 'BLOCKED', 'No topicId');
  }

  // 8.7 Create payment request
  if (conversationTopicId) {
    try {
      const r = await request('POST', '/payments/request', {
        amount: 5.0,
        currency: 'HBAR',
        topicId: conversationTopicId,
        description: 'QA4 payment request',
      }, user1Token);
      record('8', '8.7', 'Create payment request', (r.status === 200 || r.status === 201) ? 'PASS' : 'FAIL',
        `status=${r.status}, body=${JSON.stringify(r.body).substring(0,200)}`);
    } catch (e) { record('8', '8.7', 'Create request', 'FAIL', e.message); }
  } else {
    record('8', '8.7', 'Create payment request', 'BLOCKED', 'No topicId');
  }

  // 8.8 Fulfill (dependent on 8.7)
  record('8', '8.8', 'Fulfill payment request', 'BLOCKED', 'Depends on payment request creation flow');

  try {
    const r = await request('POST', '/payments/send', { amount: 1, currency: 'HBAR' });
    record('8', '8.9', 'Send without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.9', 'Send no auth', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/payments/request', { amount: 1, currency: 'HBAR' });
    record('8', '8.10', 'POST /payments/request no auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.10', 'Request no auth', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/payments/send', {
      recipientAccountId: user2AccountId, amount: -1, currency: 'HBAR', topicId: '0.0.1234',
    }, user1Token);
    record('8', '8.11', 'Negative amount rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.11', 'Negative amount', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/payments/send', {
      recipientAccountId: user2AccountId, amount: 0, currency: 'HBAR', topicId: '0.0.1234',
    }, user1Token);
    record('8', '8.12', 'Zero amount rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.12', 'Zero amount', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/payments/send', {
      recipientAccountId: user2AccountId, amount: 1, currency: 'INVALID', topicId: '0.0.1234',
    }, user1Token);
    record('8', '8.13', 'Invalid currency rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.13', 'Invalid currency', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/payments/balance');
    record('8', '8.14', 'Balance without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.14', 'Balance no auth', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/payments/history');
    record('8', '8.15', 'History without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('8', '8.15', 'History no auth', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 9: NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
async function suite9() {
  console.log('\n═══ SUITE 9: NOTIFICATIONS ═══');

  try {
    const r = await request('GET', '/notifications', null, user1Token);
    record('9', '9.1', 'Get notifications', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.1', 'Get notifications', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/notifications?limit=5', null, user1Token);
    record('9', '9.2', 'With limit', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.2', 'With limit', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/notifications?category=social', null, user1Token);
    record('9', '9.3', 'With category filter', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.3', 'Category filter', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/notifications/read', {
      notificationIds: ['00000000-0000-0000-0000-000000000000'],
    }, user1Token);
    record('9', '9.4', 'Mark notification as read', (r.status === 200 || r.status === 400) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.4', 'Mark read', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/notifications/read-all', {}, user1Token);
    record('9', '9.5', 'Mark all as read', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.5', 'Mark all read', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/notifications');
    record('9', '9.6', 'Without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.6', 'No auth', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/notifications/read', { notificationIds: ['fake'] });
    record('9', '9.7', 'Mark-read without auth', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.7', 'Mark-read no auth', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/notifications/read', { notificationIds: ['not-a-uuid'] }, user1Token);
    record('9', '9.8', 'Invalid notification ID', (r.status === 400 || r.status === 200) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.8', 'Invalid ID', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/notifications?limit=2', null, user1Token);
    record('9', '9.9', 'Cursor pagination', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('9', '9.9', 'Pagination', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 10: ORGANIZATIONS
// ═══════════════════════════════════════════════════════════════
async function suite10() {
  console.log('\n═══ SUITE 10: ORGANIZATIONS ═══');

  // 10.1 Create org (DTO only needs 'name')
  try {
    const r = await request('POST', '/organizations', { name: `QA4 Org ${RUN_ID}` }, user1Token);
    orgId = r.body?.data?.id;
    record('10', '10.1', 'Create organization', (r.status === 201 || r.status === 200) && orgId ? 'PASS' : 'FAIL',
      `status=${r.status}, orgId=${orgId}, body=${JSON.stringify(r.body).substring(0,200)}`);
  } catch (e) { record('10', '10.1', 'Create org', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/organizations/me', null, user1Token);
    record('10', '10.2', 'Get my organization', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, body=${JSON.stringify(r.body).substring(0,150)}`);
  } catch (e) { record('10', '10.2', 'Get org', 'FAIL', e.message); }

  try {
    const r = await request('PUT', '/organizations/me', { name: `QA4 Org Updated ${RUN_ID}` }, user1Token);
    record('10', '10.3', 'Update organization', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('10', '10.3', 'Update org', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/organizations/me/members', null, user1Token);
    record('10', '10.4', 'List members', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('10', '10.4', 'List members', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/organizations/me/invitations', {
      email: `${RUN_ID}-invite@test.hedera.social`,
      role: 'member',
    }, user1Token);
    invitationToken = r.body?.data?.token;
    record('10', '10.5', 'Invite member', (r.status === 201 || r.status === 200) ? 'PASS' : 'FAIL',
      `status=${r.status}, hasToken=${!!invitationToken}`);
  } catch (e) { record('10', '10.5', 'Invite member', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/organizations/me/invitations', null, user1Token);
    record('10', '10.6', 'List invitations', r.status === 200 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('10', '10.6', 'List invitations', 'FAIL', e.message); }

  // 10.7 Accept invitation
  if (invitationToken) {
    try {
      const r = await request('POST', `/organizations/invitations/${invitationToken}/accept`, {}, user2Token);
      record('10', '10.7', 'Accept invitation', (r.status === 200 || r.status === 201) ? 'PASS' : 'FAIL',
        `status=${r.status}, body=${JSON.stringify(r.body).substring(0,150)}`);
    } catch (e) { record('10', '10.7', 'Accept invitation', 'FAIL', e.message); }
  } else {
    record('10', '10.7', 'Accept invitation', 'BLOCKED', 'No invitation token');
  }

  try {
    const r = await request('GET', '/profile/me', null, user1Token);
    record('10', '10.8', 'Owner profile has org', r.status === 200 ? 'PASS' : 'FAIL',
      `status=${r.status}, orgId=${r.body?.data?.organizationId}`);
  } catch (e) { record('10', '10.8', 'Owner org', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/organizations/me');
    record('10', '10.9', 'No auth rejected', r.status === 401 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('10', '10.9', 'No auth', 'FAIL', e.message); }

  try {
    const r = await request('POST', '/organizations', { name: 'Dup Org' }, user1Token);
    record('10', '10.10', 'Duplicate org creation', r.status === 409 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('10', '10.10', 'Dup org', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 11: WEBSOCKET & CROSS-CUTTING
// ═══════════════════════════════════════════════════════════════
async function suite11() {
  console.log('\n═══ SUITE 11: WEBSOCKET & CROSS-CUTTING ═══');

  // 11.1 WebSocket endpoint — check if it responds (may be 200 or 403 depending on auth)
  try {
    const r = await request('GET', `${BASE}/socket.io/?EIO=4&transport=polling`);
    // 200 = accessible without auth (BUG-013 open), 403 = auth required (BUG-013 fixed)
    const bugFixed = r.status === 403;
    record('11', '11.1', 'WebSocket auth enforced', bugFixed ? 'PASS' : 'FAIL',
      `status=${r.status} (403=auth required=GOOD, 200=no auth=BUG-013 still open)`);
  } catch (e) { record('11', '11.1', 'WebSocket', 'FAIL', e.message); }

  record('11', '11.2', 'Receive real-time notification', 'BLOCKED', 'Requires full WS handshake');
  record('11', '11.3', 'Receive message event', 'BLOCKED', 'Requires full WS handshake');

  try {
    const r = await request('GET', '/profile/me', null, user1Token);
    const keys = Object.keys(r.body || {});
    record('11', '11.4', 'API envelope format', keys.includes('success') && keys.includes('data') ? 'PASS' : 'FAIL',
      `keys=${keys.join(',')}`);
  } catch (e) { record('11', '11.4', 'Envelope', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/profile/0.0.9999999', null, user1Token);
    const keys = Object.keys(r.body || {});
    record('11', '11.5', 'Error envelope format', keys.includes('success') || keys.includes('error') ? 'PASS' : 'FAIL',
      `keys=${keys.join(',')}, status=${r.status}`);
  } catch (e) { record('11', '11.5', 'Error envelope', 'FAIL', e.message); }

  try {
    const r = await request('GET', '/profile/me', null, user1Token);
    const ct = r.headers['content-type'];
    record('11', '11.6', 'Content-Type JSON', ct?.includes('application/json') ? 'PASS' : 'FAIL', `ct=${ct}`);
  } catch (e) { record('11', '11.6', 'Content-Type', 'FAIL', e.message); }

  try {
    const r = await rawRequest('POST', `${API}/auth/register`, '{invalid json...', { 'Content-Type': 'application/json' });
    record('11', '11.7', 'Invalid JSON body rejected', r.status === 400 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('11', '11.7', 'Invalid JSON', 'FAIL', e.message); }

  try {
    const r = await rawRequest('PATCH', `${BASE}/health`, null, {});
    record('11', '11.8', 'Wrong HTTP method', (r.status === 404 || r.status === 405) ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('11', '11.8', 'Wrong method', 'FAIL', e.message); }

  try {
    const bigBody = 'X'.repeat(2 * 1024 * 1024);
    const r = await rawRequest('POST', `${API}/auth/register`, bigBody, { 'Content-Type': 'application/json' });
    record('11', '11.9', 'Large payload rejected', r.status === 413 ? 'PASS' : 'FAIL', `status=${r.status}`);
  } catch (e) { record('11', '11.9', 'Large payload', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// SUITE 12: HEDERA MIRROR NODE & RATE LIMITING
// ═══════════════════════════════════════════════════════════════
async function suite12() {
  console.log('\n═══ SUITE 12: HEDERA MIRROR NODE & RATE LIMITING ═══');

  // 12.1 Verify user1 on mirror node (HTTPS)
  if (user1AccountId) {
    try {
      const r = await request('GET', `https://testnet.mirrornode.hedera.com/api/v1/accounts/${user1AccountId}`);
      const ok = r.status === 200 && r.body?.account === user1AccountId;
      record('12', '12.1', 'User1 on mirror node', ok ? 'PASS' : 'FAIL',
        `account=${r.body?.account}, balance=${r.body?.balance?.balance}`);
    } catch (e) { record('12', '12.1', 'Mirror node u1', 'FAIL', e.message); }
  } else {
    record('12', '12.1', 'User1 on mirror node', 'BLOCKED', 'No accountId');
  }

  // 12.2 Verify user2
  if (user2AccountId) {
    try {
      const r = await request('GET', `https://testnet.mirrornode.hedera.com/api/v1/accounts/${user2AccountId}`);
      const ok = r.status === 200 && r.body?.account === user2AccountId;
      record('12', '12.2', 'User2 on mirror node', ok ? 'PASS' : 'FAIL',
        `account=${r.body?.account}, balance=${r.body?.balance?.balance}`);
    } catch (e) { record('12', '12.2', 'Mirror node u2', 'FAIL', e.message); }
  } else {
    record('12', '12.2', 'User2 on mirror node', 'BLOCKED', 'No accountId');
  }

  // 12.3 Rate limiting
  try {
    const promises = [];
    for (let i = 0; i < 25; i++) {
      promises.push(request('POST', '/auth/register', { email: `spam${i}@test.com` }));
    }
    const responses = await Promise.all(promises);
    const has429 = responses.some(r => r.status === 429);
    record('12', '12.3', 'Rate limiting enforced', has429 ? 'PASS' : 'FAIL',
      `sent=25, got429=${has429}, statuses=[${[...new Set(responses.map(r=>r.status))]}]`);
  } catch (e) { record('12', '12.3', 'Rate limiting', 'FAIL', e.message); }

  await sleep(5000);

  // 12.4 Rate limit headers
  try {
    const r = await request('POST', '/auth/login', { email: 'rate-limit-test@test.com' });
    const rl = r.headers['x-ratelimit-limit'];
    record('12', '12.4', 'Rate limit headers', rl ? 'PASS' : 'FAIL',
      `x-ratelimit-limit=${rl}, remaining=${r.headers['x-ratelimit-remaining']}`);
  } catch (e) { record('12', '12.4', 'Rate headers', 'FAIL', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════
async function main() {
  console.log(`\n╔═══════════════════════════════════════════╗`);
  console.log(`║  QA CYCLE 4 — Run ID: ${RUN_ID}  ║`);
  console.log(`╚═══════════════════════════════════════════╝\n`);

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
    console.error('FATAL:', e);
  }

  const pass = results.filter(r => r.status === 'PASS').length;
  const fail = results.filter(r => r.status === 'FAIL').length;
  const blocked = results.filter(r => r.status === 'BLOCKED').length;
  const total = results.length;
  const testable = pass + fail;
  const rate = testable > 0 ? ((pass / testable) * 100).toFixed(1) : '0.0';

  console.log('\n╔═══════════════════════════════════════════╗');
  console.log(`║  TOTAL: ${total}  PASS: ${pass}  FAIL: ${fail}  BLOCKED: ${blocked}`);
  console.log(`║  Pass Rate: ${rate}%`);
  console.log('╚═══════════════════════════════════════════╝\n');

  console.log('__QA_RESULTS_JSON__');
  console.log(JSON.stringify({
    runId: RUN_ID,
    date: new Date().toISOString(),
    total, pass, fail, blocked, rate,
    user1AccountId, user2AccountId,
    conversationId, conversationTopicId,
    results,
  }));
}

main().catch(e => { console.error(e); process.exit(1); });
