---
name: e2e-qa
description: "Manual QA simulation. Starts the REAL app, hits REAL endpoints with multiple scenarios per endpoint, verifies REAL results in the database and on Hedera. Tests every user flow end-to-end like a human QA tester would — happy paths, error paths, edge cases, boundary conditions, sequencing."
allowed-tools: "Read, Write, Edit, Bash, Grep, Glob, Agent"
---

# End-to-End QA — Exhaustive Manual Testing

You are a **senior manual QA tester**. You don't test code — you test the **running application**. You start the real NestJS server, make real HTTP requests to every API endpoint, and verify every result — in the database, on Hedera testnet, in Redis. You test multiple scenarios per endpoint: happy paths, validation failures, auth failures, edge cases, boundary conditions, sequencing dependencies.

## PHILOSOPHY

You are NOT a unit tester. You are NOT running `pnpm test`. You are a professional QA engineer with `curl` and a database client. You:

1. Start the actual application (build + node dist/main)
2. Hit EVERY endpoint with MULTIPLE scenarios (happy path + errors + edge cases)
3. Check the database to verify data was written correctly
4. Check Hedera mirror node to verify blockchain transactions landed
5. Check Redis for cached/pub-sub data
6. Test WebSocket connections for real-time features
7. Test proper sequencing — endpoints that depend on each other
8. Test auth at every level — no token, bad token, expired token, wrong user
9. Test input validation exhaustively — missing fields, wrong types, boundary values
10. Report what works and what doesn't with EVIDENCE

## READ FIRST

1. `CLAUDE.md` — project rules
2. `.env` — verify all env vars are set (especially HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY)
3. `packages/api/src/modules/` — understand the module structure

## STEP 0: Infrastructure

```bash
# Start test infrastructure (PostgreSQL + Redis)
docker compose -f docker-compose.test.yml up -d
sleep 3

# Verify PostgreSQL is up
docker exec hedera-social-test-db pg_isready -U test -d hedera_social_test

# Verify Redis is up
docker exec hedera-social-test-redis redis-cli ping

# Clean the database for a fresh test run
PGPASSWORD=test psql -h localhost -p 5433 -U test -d hedera_social_test -c "
  DO \$\$ DECLARE r RECORD;
  BEGIN
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
      EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
    END LOOP;
  END \$\$;
"

# Build the project
cd packages/api && pnpm build && cd ../..
```

## STEP 1: Start the Real App

```bash
# Set test environment variables pointing to test infrastructure
export NODE_ENV=test
export DB_HOST=localhost
export DB_PORT=5433
export DB_USERNAME=test
export DB_PASSWORD=test
export DB_DATABASE=hedera_social_test
export REDIS_HOST=localhost
export REDIS_PORT=6380
export PORT=3333

# Source the .env for Hedera credentials and other config
set -a && source .env && set +a

# Override DB/Redis to point to test containers (after sourcing .env)
export DB_HOST=localhost DB_PORT=5433 DB_USERNAME=test DB_PASSWORD=test DB_DATABASE=hedera_social_test
export REDIS_HOST=localhost REDIS_PORT=6380

# Start the NestJS app in the background
cd packages/api
node dist/main &
APP_PID=$!
cd ../..

# Wait for the app to be ready (up to 60s for Hedera initialization)
for i in $(seq 1 60); do
  if curl -s http://localhost:${PORT:-3333}/health > /dev/null 2>&1; then
    echo "App is ready!"
    break
  fi
  sleep 1
done
```

**If the app fails to start**: read the error, fix the code, rebuild (`cd packages/api && pnpm build && cd ../..`), restart. Do NOT proceed with a dead app.

## STEP 2: Variables & Helpers

```bash
BASE_URL="http://localhost:${PORT:-3333}"
TS=$(date +%s)  # Unique timestamp for this test run

# Helper: check HTTP status code
check_status() {
  local RESPONSE="$1"
  local EXPECTED="$2"
  local ACTUAL=$(echo "$RESPONSE" | head -1)
  if [ "$ACTUAL" = "$EXPECTED" ]; then echo "PASS"; else echo "FAIL (expected $EXPECTED, got $ACTUAL)"; fi
}

# Helper: query the test database
db_query() {
  PGPASSWORD=test psql -h localhost -p 5433 -U test -d hedera_social_test -t -A -c "$1"
}

# Helper: check Hedera mirror node
mirror_check() {
  curl -s "https://testnet.mirrornode.hedera.com/api/v1/$1"
}
```

---

## STEP 3: TEST SUITES

Every test below must be executed. For each test:
- Record the actual HTTP status code
- Record the actual response body (or relevant excerpt)
- Verify side effects (DB rows, Hedera transactions) where applicable
- Log PASS or FAIL with evidence

---

### SUITE 1: ROOT & HEALTH (2 tests)

#### 1.1 — GET / (root endpoint)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/"
# EXPECT: 200
```

#### 1.2 — GET /health
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/health"
# EXPECT: 200, body contains status or "ok"
```

---

### SUITE 2: AUTHENTICATION (22 tests)

The auth flow is: register (email or phone) → receive OTP → verify OTP → get tokens → use tokens.

#### 2.1 — Register with email (happy path)
```bash
USER1_EMAIL="qa1-${TS}@test.hedera.com"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER1_EMAIL\"}")
# EXPECT: 201
# EXPECT BODY: registrationId, otpSent: true
# VERIFY DB: User row created with email
```

#### 2.2 — Register with phone (happy path)
```bash
USER_PHONE="+971501${TS: -6}"
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"phone\": \"$USER_PHONE\"}")
# EXPECT: 201
# EXPECT BODY: registrationId, otpSent: true
```

#### 2.3 — Register with both email and phone
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"qa-both-${TS}@test.hedera.com\", \"phone\": \"+971502${TS: -6}\"}"
# EXPECT: 201
```

#### 2.4 — Register with EMPTY body
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{}'
# EXPECT: 400, validation error (at least email or phone required)
```

#### 2.5 — Register with invalid email format
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"email": "not-an-email"}'
# EXPECT: 400, "Invalid email address format"
```

#### 2.6 — Register with invalid phone format
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d '{"phone": "12345"}'
# EXPECT: 400, "Phone must be in E.164 format"
```

#### 2.7 — Register duplicate email
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER1_EMAIL\"}"
# EXPECT: 409 or appropriate conflict/error
```

#### 2.8 — Login with email (happy path — triggers OTP)
```bash
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER1_EMAIL\"}")
# EXPECT: 200, OTP sent confirmation
```

#### 2.9 — Login with non-existent email
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "nonexistent@nowhere.com"}'
# EXPECT: 401 or 404
```

#### 2.10 — Login with empty body
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/login" \
  -H "Content-Type: application/json" \
  -d '{}'
# EXPECT: 400
```

#### 2.11 — Verify OTP (happy path)
```bash
# Fetch OTP from database
USER1_OTP=$(db_query "SELECT code FROM otps WHERE identifier = '$USER1_EMAIL' ORDER BY created_at DESC LIMIT 1;")
OTP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER1_EMAIL\", \"otp\": \"$USER1_OTP\"}")
# EXPECT: 200
# EXPECT BODY: accessToken, refreshToken
# EXTRACT: ACCESS_TOKEN_1, REFRESH_TOKEN_1
# VERIFY DB: User has hedera_account_id set (Hedera account created!)
# VERIFY HEDERA: Account exists on mirror node
```

#### 2.12 — Verify OTP with wrong code
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER1_EMAIL\", \"otp\": \"000000\"}"
# EXPECT: 401 or 400
```

#### 2.13 — Verify OTP with invalid format (not 6 digits)
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "otp": "12345"}'
# EXPECT: 400, "OTP must be exactly 6 digits"
```

#### 2.14 — Verify OTP with letters instead of digits
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com", "otp": "abcdef"}'
# EXPECT: 400, "OTP must contain only digits"
```

#### 2.15 — Verify OTP with missing otp field
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"email": "test@test.com"}'
# EXPECT: 400
```

#### 2.16 — Verify OTP with missing email AND phone
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/verify-otp" \
  -H "Content-Type: application/json" \
  -d '{"otp": "123456"}'
# EXPECT: 400
```

#### 2.17 — Token Refresh (happy path)
```bash
REFRESH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d "{\"refreshToken\": \"$REFRESH_TOKEN_1\"}")
# EXPECT: 200, new accessToken
# EXTRACT: NEW_ACCESS_TOKEN
```

#### 2.18 — Token Refresh with invalid token
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "invalid.jwt.token"}'
# EXPECT: 401
```

#### 2.19 — Token Refresh with empty body
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/refresh" \
  -H "Content-Type: application/json" \
  -d '{}'
# EXPECT: 400, "Refresh token is required"
```

#### 2.20 — Use expired/invalid access token on protected endpoint
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
# EXPECT: 401
```

#### 2.21 — Access protected endpoint with NO Authorization header
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/profile/me"
# EXPECT: 401
```

#### 2.22 — Access protected endpoint with malformed header
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: NotBearer something"
# EXPECT: 401
```

**NOW: Register & authenticate USER 2 for multi-user tests**

```bash
USER2_EMAIL="qa2-${TS}@test.hedera.com"
curl -s -X POST "$BASE_URL/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER2_EMAIL\"}"
# Login user 2
curl -s -X POST "$BASE_URL/api/v1/auth/login" -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER2_EMAIL\"}"
# Get OTP from DB
USER2_OTP=$(db_query "SELECT code FROM otps WHERE identifier = '$USER2_EMAIL' ORDER BY created_at DESC LIMIT 1;")
# Verify OTP
OTP2_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/verify-otp" -H "Content-Type: application/json" \
  -d "{\"email\": \"$USER2_EMAIL\", \"otp\": \"$USER2_OTP\"}")
# Extract tokens and account IDs for User 2
# EXTRACT: ACCESS_TOKEN_2, REFRESH_TOKEN_2, ACCOUNT_ID_2

# Also register USER 3 for group/conversation tests
USER3_EMAIL="qa3-${TS}@test.hedera.com"
# ... same register + login + verify flow ...
# EXTRACT: ACCESS_TOKEN_3, ACCOUNT_ID_3
```

---

### SUITE 3: PROFILE (14 tests)

#### 3.1 — Get own profile (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200
# EXPECT BODY: profile with accountId, displayName, bio, etc.
# VERIFY: accountId matches the Hedera account from registration
```

#### 3.2 — Update profile — displayName only
```bash
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "QA Tester One"}'
# EXPECT: 200
# VERIFY DB: display_name updated
```

#### 3.3 — Update profile — all fields
```bash
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "QA Tester Updated", "bio": "Testing the platform E2E", "location": "Dubai, UAE"}'
# EXPECT: 200
# VERIFY DB: all three fields updated
```

#### 3.4 — Update profile — displayName at max length (100 chars)
```bash
LONG_NAME=$(python3 -c "print('A' * 100)")
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"displayName\": \"$LONG_NAME\"}"
# EXPECT: 200 (exactly at limit)
```

#### 3.5 — Update profile — displayName exceeds max length (101 chars)
```bash
TOO_LONG_NAME=$(python3 -c "print('A' * 101)")
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"displayName\": \"$TOO_LONG_NAME\"}"
# EXPECT: 400, "Display name must not exceed 100 characters"
```

#### 3.6 — Update profile — bio at max length (500 chars)
```bash
LONG_BIO=$(python3 -c "print('B' * 500)")
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"bio\": \"$LONG_BIO\"}"
# EXPECT: 200
```

#### 3.7 — Update profile — bio exceeds max length (501 chars)
```bash
TOO_LONG_BIO=$(python3 -c "print('B' * 501)")
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"bio\": \"$TOO_LONG_BIO\"}"
# EXPECT: 400
```

#### 3.8 — Update profile — empty displayName (min length 1)
```bash
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"displayName": ""}'
# EXPECT: 400, "Display name must not be empty"
```

#### 3.9 — Update profile — location at max length (200 chars)
```bash
LONG_LOC=$(python3 -c "print('L' * 200)")
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"location\": \"$LONG_LOC\"}"
# EXPECT: 200
```

#### 3.10 — Update profile — no auth
```bash
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "Hacker"}'
# EXPECT: 401
```

#### 3.11 — Get public profile by accountId (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/profile/$ACCOUNT_ID_1"
# EXPECT: 200
# EXPECT BODY: public profile data (no sensitive fields)
# NOTE: This is a PUBLIC endpoint — no auth required
```

#### 3.12 — Get public profile — non-existent accountId
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/profile/0.0.99999999"
# EXPECT: 404
```

#### 3.13 — Get public profile — invalid format
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/profile/not-a-hedera-id"
# EXPECT: 400 or 404
```

#### 3.14 — Update profile — verify DB matches response
```bash
curl -s -X PUT "$BASE_URL/api/v1/profile/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"displayName": "DB Verify Test", "bio": "Check the DB", "location": "Test City"}'
# After update, query DB directly:
db_query "SELECT display_name, bio, location FROM profiles WHERE user_id = (SELECT id FROM users WHERE email = '$USER1_EMAIL');"
# VERIFY: display_name = 'DB Verify Test', bio = 'Check the DB', location = 'Test City'
```

---

### SUITE 4: USER SEARCH (6 tests)

#### 4.1 — Search users (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/users/search?q=QA"
# EXPECT: 200, array of matching users
# NOTE: Public endpoint
```

#### 4.2 — Search with exact display name match
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/users/search?q=DB%20Verify%20Test"
# EXPECT: 200, at least one result
```

#### 4.3 — Search query too short (min 2 chars)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/users/search?q=A"
# EXPECT: 400, "Search query must be at least 2 characters"
```

#### 4.4 — Search query too long (max 100 chars)
```bash
LONG_Q=$(python3 -c "print('X' * 101)")
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/users/search?q=$LONG_Q"
# EXPECT: 400
```

#### 4.5 — Search with no results
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/users/search?q=zzzznonexistent99999"
# EXPECT: 200, empty array
```

#### 4.6 — Search with custom limit
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/users/search?q=QA&limit=1"
# EXPECT: 200, at most 1 result
```

---

### SUITE 5: POSTS & FEED (18 tests)

#### 5.1 — Create post (happy path — text only)
```bash
POST1_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"QA test post #1 at ${TS}\"}")
# EXPECT: 201
# EXPECT BODY: id, hcsTopicId, sequenceNumber, consensusTimestamp
# EXTRACT: POST1_ID, POST1_TOPIC_ID
# VERIFY DB: SELECT * FROM posts WHERE id = '$POST1_ID';
# VERIFY HEDERA: mirror_check "topics/$POST1_TOPIC_ID/messages?limit=1&order=desc"
```

#### 5.2 — Create post — max length text (800 chars)
```bash
MAX_TEXT=$(python3 -c "print('X' * 800)")
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"$MAX_TEXT\"}"
# EXPECT: 201
```

#### 5.3 — Create post — exceeds max length (801 chars)
```bash
OVER_TEXT=$(python3 -c "print('X' * 801)")
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"$OVER_TEXT\"}"
# EXPECT: 400
```

#### 5.4 — Create post — empty text
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"text": ""}'
# EXPECT: 400
```

#### 5.5 — Create post — missing text field
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{}'
# EXPECT: 400
```

#### 5.6 — Create post — no auth
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Content-Type: application/json" \
  -d '{"text": "Unauthorized post"}'
# EXPECT: 401
```

#### 5.7 — Create post — with media attachment
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"text": "Post with media", "media": [{"type": "image", "ipfsCid": "QmTest123", "mimeType": "image/png", "size": 1024}]}'
# EXPECT: 201
```

#### 5.8 — Create post — invalid media type
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"text": "Bad media", "media": [{"type": "audio", "ipfsCid": "Qm123", "mimeType": "audio/mp3", "size": 100}]}'
# EXPECT: 400 (type must be image or video)
```

#### 5.9 — Create post — special characters and unicode
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"text": "Special chars: <script>alert(1)</script> 🔥🚀 أهلا בוקר טוב"}'
# EXPECT: 201 (should handle unicode and sanitize HTML)
```

#### 5.10 — Create post as User 2 (for feed tests)
```bash
curl -s -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"Post from User 2 at ${TS}\"}"
# EXPECT: 201
```

#### 5.11 — Get home feed (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/posts/feed" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200
# EXPECT BODY: { posts: [...], nextCursor, hasMore }
# VERIFY: Our test posts appear in the feed
```

#### 5.12 — Get home feed — with pagination
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/posts/feed?limit=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, exactly 1 post, hasMore: true (if more exist)
# Then use nextCursor to get page 2:
# curl ... "$BASE_URL/api/v1/posts/feed?limit=1&cursor=$NEXT_CURSOR"
```

#### 5.13 — Get home feed — no auth
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/posts/feed"
# EXPECT: 401
```

#### 5.14 — Get trending posts (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/posts/trending" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, array of posts
```

#### 5.15 — Get single post by ID (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/posts/$POST1_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, the specific post with all fields
```

#### 5.16 — Get single post — non-existent UUID
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/posts/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 404
```

#### 5.17 — Get single post — invalid UUID format
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/posts/not-a-uuid" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 400 (ParseUUIDPipe validation)
```

#### 5.18 — Get user feed by accountId
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/posts/user/$ACCOUNT_ID_1" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, posts from user 1 only
# VERIFY: All returned posts have author.accountId matching ACCOUNT_ID_1
```

---

### SUITE 6: SOCIAL GRAPH — Follow/Unfollow (16 tests)

#### 6.1 — Follow a user (happy path — User 1 follows User 2)
```bash
FOLLOW_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"targetAccountId\": \"$ACCOUNT_ID_2\"}")
# EXPECT: 200
# VERIFY DB: SELECT * FROM social_graph WHERE follower_account_id = '$ACCOUNT_ID_1' AND following_account_id = '$ACCOUNT_ID_2';
# VERIFY HEDERA: HCS message on social topic (check mirror node)
```

#### 6.2 — Check follow status (should be true)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/social/$ACCOUNT_ID_1/is-following/$ACCOUNT_ID_2" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, { isFollowing: true }
```

#### 6.3 — Duplicate follow (follow same user again)
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"targetAccountId\": \"$ACCOUNT_ID_2\"}"
# EXPECT: 409 or idempotent 200 (should not create duplicate DB row)
# VERIFY DB: Still only 1 row, not 2
```

#### 6.4 — Follow yourself
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"targetAccountId\": \"$ACCOUNT_ID_1\"}"
# EXPECT: 400 or 422 (cannot follow yourself)
```

#### 6.5 — Follow non-existent user
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"targetAccountId": "0.0.99999999"}'
# EXPECT: 404 or appropriate error
```

#### 6.6 — Follow with invalid account ID format
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"targetAccountId": "invalid"}'
# EXPECT: 400, "targetAccountId must be in Hedera account ID format: 0.0.XXXXX"
```

#### 6.7 — Follow with missing targetAccountId
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{}'
# EXPECT: 400
```

#### 6.8 — Follow without auth
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Content-Type: application/json" \
  -d "{\"targetAccountId\": \"$ACCOUNT_ID_2\"}"
# EXPECT: 401
```

#### 6.9 — Get followers list (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/social/$ACCOUNT_ID_2/followers" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, { followers: [...], totalCount: >= 1 }
# VERIFY: ACCOUNT_ID_1 appears in the followers list
```

#### 6.10 — Get following list (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/social/$ACCOUNT_ID_1/following" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, { following: [...], totalCount: >= 1 }
# VERIFY: ACCOUNT_ID_2 appears in the following list
```

#### 6.11 — Get user stats
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/social/$ACCOUNT_ID_1/stats" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, { followerCount, followingCount }
# VERIFY: followingCount >= 1
```

#### 6.12 — Unfollow user (happy path)
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/unfollow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"targetAccountId\": \"$ACCOUNT_ID_2\"}"
# EXPECT: 200
# VERIFY DB: Row removed from social_graph
```

#### 6.13 — Check follow status after unfollow (should be false)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/social/$ACCOUNT_ID_1/is-following/$ACCOUNT_ID_2" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, { isFollowing: false }
```

#### 6.14 — Unfollow someone you don't follow
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/unfollow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"targetAccountId\": \"$ACCOUNT_ID_2\"}"
# EXPECT: 400 or idempotent 200
```

#### 6.15 — Bidirectional follow (User 2 follows User 1 back)
```bash
# Re-follow first
curl -s -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"targetAccountId\": \"$ACCOUNT_ID_2\"}"
# User 2 follows User 1
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/social/follow" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2" \
  -H "Content-Type: application/json" \
  -d "{\"targetAccountId\": \"$ACCOUNT_ID_1\"}"
# EXPECT: 200
# VERIFY: Both follow relationships exist in DB
# VERIFY: Stats show correct counts for both users
```

#### 6.16 — Get stats after bidirectional follow
```bash
curl -s "$BASE_URL/api/v1/social/$ACCOUNT_ID_1/stats" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: followerCount >= 1, followingCount >= 1
```

---

### SUITE 7: CONVERSATIONS & MESSAGING (14 tests)

#### 7.1 — Create direct conversation (happy path)
```bash
CONV_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/conversations" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"participantAccountIds\": [\"$ACCOUNT_ID_2\"], \"type\": \"direct\"}")
# EXPECT: 201
# EXPECT BODY: id, type: "direct", hcsTopicId, participants
# EXTRACT: CONV1_ID, CONV1_TOPIC_ID
# VERIFY DB: SELECT * FROM conversations WHERE id = '$CONV1_ID';
# VERIFY HEDERA: Topic exists on mirror node
```

#### 7.2 — Create group conversation
```bash
GROUP_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/conversations" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"participantAccountIds\": [\"$ACCOUNT_ID_2\", \"$ACCOUNT_ID_3\"], \"type\": \"group\", \"groupName\": \"QA Test Group\"}")
# EXPECT: 201
# EXPECT BODY: type: "group", groupName: "QA Test Group"
# EXTRACT: GROUP_CONV_ID
```

#### 7.3 — Create conversation with invalid type
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/conversations" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"participantAccountIds": ["0.0.12345"], "type": "channel"}'
# EXPECT: 400
```

#### 7.4 — Create conversation with empty participants
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/conversations" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"participantAccountIds": [], "type": "direct"}'
# EXPECT: 400 (ArrayMinSize(1))
```

#### 7.5 — Create conversation with invalid participant format
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/conversations" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"participantAccountIds": ["invalid-id"], "type": "direct"}'
# EXPECT: 400, "Each participant must be a valid Hedera account ID"
```

#### 7.6 — Create conversation without auth
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/conversations" \
  -H "Content-Type: application/json" \
  -d '{"participantAccountIds": ["0.0.12345"], "type": "direct"}'
# EXPECT: 401
```

#### 7.7 — Get user conversations (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/conversations" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, { data: [...], nextCursor, hasMore }
# VERIFY: Our test conversations appear
```

#### 7.8 — Get user conversations — with pagination
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/conversations?limit=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, exactly 1 conversation
```

#### 7.9 — Get single conversation by ID
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/conversations/$CONV1_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, full conversation details with participants
```

#### 7.10 — Get conversation — non-existent UUID
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/conversations/00000000-0000-0000-0000-000000000000" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 404
```

#### 7.11 — Get conversation — invalid UUID
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/conversations/not-a-uuid" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 400 (ParseUUIDPipe)
```

#### 7.12 — Add participant to group conversation
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/conversations/$GROUP_CONV_ID/participants" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"accountId\": \"$ACCOUNT_ID_3\"}"
# EXPECT: 200 or 201
# VERIFY DB: New participant row
```

#### 7.13 — Add participant with invalid accountId
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/conversations/$GROUP_CONV_ID/participants" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"accountId": "invalid"}'
# EXPECT: 400
```

#### 7.14 — Get conversation state (chat REST endpoint)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/chat/conversations/$CONV1_TOPIC_ID/state" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, { topicId, onlineUsers, readReceipts, typingUsers }
```

---

### SUITE 8: PAYMENTS (24 tests)

#### 8.1 — Get balance (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/balance" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200
# EXPECT BODY: { accountId, hbarBalance, timestamp }
# VERIFY: hbarBalance is a number >= 0
```

#### 8.2 — Get balance — no auth
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/balance"
# EXPECT: 401
```

#### 8.3 — Send payment (happy path)
```bash
PAYMENT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"recipientAccountId\": \"$ACCOUNT_ID_2\", \"amount\": 0.01, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\"}")
# EXPECT: 200 or 201
# EXPECT BODY: id, hederaTxId, status
# EXTRACT: PAYMENT1_ID
# VERIFY DB: SELECT * FROM payments WHERE id = '$PAYMENT1_ID';
# VERIFY HEDERA: mirror_check "transactions?account.id=$ACCOUNT_ID_1&limit=1&order=desc"
```

#### 8.4 — Send payment — minimum amount (0.01)
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"recipientAccountId\": \"$ACCOUNT_ID_2\", \"amount\": 0.01, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\"}"
# EXPECT: 200 or 201
```

#### 8.5 — Send payment — below minimum (0.001)
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"recipientAccountId\": \"$ACCOUNT_ID_2\", \"amount\": 0.001, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\"}"
# EXPECT: 400
```

#### 8.6 — Send payment — zero amount
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"recipientAccountId\": \"$ACCOUNT_ID_2\", \"amount\": 0, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\"}"
# EXPECT: 400
```

#### 8.7 — Send payment — negative amount
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"recipientAccountId\": \"$ACCOUNT_ID_2\", \"amount\": -5, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\"}"
# EXPECT: 400
```

#### 8.8 — Send payment — invalid recipient
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"recipientAccountId": "invalid", "amount": 1, "currency": "HBAR", "topicId": "0.0.12345"}'
# EXPECT: 400
```

#### 8.9 — Send payment — missing required fields
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{}'
# EXPECT: 400
```

#### 8.10 — Send payment — with note (max 500 chars)
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"recipientAccountId\": \"$ACCOUNT_ID_2\", \"amount\": 0.01, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\", \"note\": \"QA payment test note\"}"
# EXPECT: 200 or 201
```

#### 8.11 — Send payment — note exceeds max length
```bash
LONG_NOTE=$(python3 -c "print('N' * 501)")
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"recipientAccountId\": \"$ACCOUNT_ID_2\", \"amount\": 0.01, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\", \"note\": \"$LONG_NOTE\"}"
# EXPECT: 400
```

#### 8.12 — Create payment request (happy path)
```bash
REQUEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/request" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"amount\": 5, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\", \"description\": \"QA test request\"}")
# EXPECT: 200 or 201
# EXTRACT: REQUEST1_ID
```

#### 8.13 — Get payment request by ID
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/request/$REQUEST1_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, request details
```

#### 8.14 — Get all payment requests
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/requests" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, array of requests
```

#### 8.15 — Fulfill payment request (User 2 pays)
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/request/$REQUEST1_ID/pay" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2" \
  -H "Content-Type: application/json" \
  -d "{\"topicId\": \"$CONV1_TOPIC_ID\"}"
# EXPECT: 200 or 201
# VERIFY DB: Request status changed to "paid"
# VERIFY HEDERA: Transfer transaction on mirror node
```

#### 8.16 — Create and decline payment request
```bash
DECLINE_REQ=$(curl -s -X POST "$BASE_URL/api/v1/payments/request" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"amount\": 1, \"currency\": \"HBAR\", \"topicId\": \"$CONV1_TOPIC_ID\"}")
# Extract the request ID
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/request/$DECLINE_REQ_ID/decline" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2" \
  -H "Content-Type: application/json" \
  -d '{"reason": "QA test decline"}'
# EXPECT: 200
# VERIFY DB: Request status changed to "declined"
```

#### 8.17 — Get payment history (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/history" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, { transactions: [...], cursor, hasMore }
# VERIFY: Our test payments appear
```

#### 8.18 — Get payment history — with pagination
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/history?limit=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, 1 transaction
```

#### 8.19 — Query transactions (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/transactions" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200
```

#### 8.20 — Query transactions — filter by direction
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/transactions?direction=sent" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, all transactions have direction: "sent"
```

#### 8.21 — Query transactions — filter by status
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/transactions?status=completed" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200
```

#### 8.22 — Query transactions — filter by date range
```bash
TODAY=$(date -u +%Y-%m-%dT00:00:00Z)
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/transactions?from=$TODAY" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200
```

#### 8.23 — Get transaction detail by ID
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/payments/transactions/$PAYMENT1_ID" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 200, full transaction detail including on-chain proof links
```

#### 8.24 — Send payment — no auth
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/payments/send" \
  -H "Content-Type: application/json" \
  -d '{"recipientAccountId": "0.0.12345", "amount": 1, "currency": "HBAR", "topicId": "0.0.12345"}'
# EXPECT: 401
```

---

### SUITE 9: NOTIFICATIONS (10 tests)

#### 9.1 — Get notifications (happy path)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/notifications" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2"
# EXPECT: 200
# EXPECT BODY: { notifications: [...], totalCount, nextCursor, hasMore }
# VERIFY: Follow and payment notifications from earlier tests appear
```

#### 9.2 — Get notifications — filter by category
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/notifications?category=payment" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2"
# EXPECT: 200, only payment notifications
```

#### 9.3 — Get notifications — invalid category
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/notifications?category=invalid" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2"
# EXPECT: 400, "category must be one of: message, payment, social, system"
```

#### 9.4 — Get notifications — with pagination
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/notifications?limit=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2"
# EXPECT: 200, 1 notification
```

#### 9.5 — Get unread count
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/notifications/unread-count" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2"
# EXPECT: 200, { unreadCount: N } where N > 0
```

#### 9.6 — Mark specific notifications as read
```bash
# Get a notification ID first
NOTIF_ID=$(curl -s "$BASE_URL/api/v1/notifications?limit=1" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['notifications'][0]['id'])" 2>/dev/null)

curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/notifications/read" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2" \
  -H "Content-Type: application/json" \
  -d "{\"notificationIds\": [\"$NOTIF_ID\"]}"
# EXPECT: 200, { updated: 1 }
# VERIFY DB: is_read = true for that notification
```

#### 9.7 — Mark notifications read — invalid UUID
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/notifications/read" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2" \
  -H "Content-Type: application/json" \
  -d '{"notificationIds": ["not-a-uuid"]}'
# EXPECT: 400
```

#### 9.8 — Mark notifications read — empty array
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/notifications/read" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2" \
  -H "Content-Type: application/json" \
  -d '{"notificationIds": []}'
# EXPECT: 400
```

#### 9.9 — Mark ALL notifications as read
```bash
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/notifications/read-all" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2"
# EXPECT: 200
# VERIFY: GET unread-count should now return 0
```

#### 9.10 — Verify unread count is 0 after mark-all-read
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/notifications/unread-count" \
  -H "Authorization: Bearer $ACCESS_TOKEN_2"
# EXPECT: 200, { unreadCount: 0 }
```

---

### SUITE 10: ORGANIZATIONS (16 tests)

#### 10.1 — Get my organization (no org yet)
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/organizations/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1"
# EXPECT: 404 or 200 with null/empty (user has no org)
```

#### 10.2 — Update organization — no org exists
```bash
curl -s -w "\n%{http_code}" -X PUT "$BASE_URL/api/v1/organizations/me" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"name": "QA Org"}'
# EXPECT: 404 or 403 (no org to update)
```

**NOTE: To test org operations, we need a user with KYB approval. If the app supports direct org creation, test it. Otherwise, simulate KYB approval via the webhook to create an org for testing.**

#### 10.3 — Trigger KYC webhook to approve User 1 (creates org)
```bash
# This depends on the app's flow. If KYB approval creates an org:
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/webhooks/mirsad-kyc-callback" \
  -H "Content-Type: application/json" \
  -d "{\"request_id\": \"qa-kyc-${TS}\", \"status\": \"approved\"}"
# EXPECT: 200
# NOTE: This is a public webhook endpoint — no auth needed
# VERIFY: Check if org was created for the user
```

#### 10.4 — KYC webhook — rejected status
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/webhooks/mirsad-kyc-callback" \
  -H "Content-Type: application/json" \
  -d "{\"request_id\": \"qa-kyc-reject-${TS}\", \"status\": \"rejected\"}"
# EXPECT: 200
```

#### 10.5 — KYC webhook — on_hold status
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/webhooks/mirsad-kyc-callback" \
  -H "Content-Type: application/json" \
  -d "{\"request_id\": \"qa-kyc-hold-${TS}\", \"status\": \"on_hold\"}"
# EXPECT: 200
```

#### 10.6 — KYC webhook — invalid status
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/webhooks/mirsad-kyc-callback" \
  -H "Content-Type: application/json" \
  -d '{"request_id": "test", "status": "invalid"}'
# EXPECT: 400
```

#### 10.7 — KYC webhook — missing fields
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/webhooks/mirsad-kyc-callback" \
  -H "Content-Type: application/json" \
  -d '{}'
# EXPECT: 400
```

#### 10.8-10.16: IF org exists, test the following:
```
10.8  — GET /organizations/me (happy path with org)
10.9  — PUT /organizations/me — update name, bio, category, website
10.10 — PUT /organizations/me — website with invalid URL
10.11 — PUT /organizations/me — name exceeds 128 chars
10.12 — GET /organizations/me/members
10.13 — POST /organizations/me/invitations — create invitation
10.14 — POST /organizations/me/invitations — invalid email
10.15 — POST /organizations/me/invitations — invalid role
10.16 — GET /organizations/me/invitations
```

For each, check role-based access: owner can do everything, admin can invite, member can view, viewer can only view members.

---

### SUITE 11: WEBSOCKET CHAT (8 tests)

Test WebSocket using a Node.js script or `wscat`. The WebSocket namespace is `/chat`.

#### 11.1 — Connect to WebSocket with valid token
```bash
# Use a Node.js script:
node -e "
const { io } = require('socket.io-client');
const socket = io('http://localhost:3333/chat', {
  auth: { token: '$ACCESS_TOKEN_1' },
  transports: ['websocket']
});
socket.on('connect', () => { console.log('PASS: Connected'); socket.disconnect(); process.exit(0); });
socket.on('connect_error', (err) => { console.log('FAIL:', err.message); process.exit(1); });
setTimeout(() => { console.log('FAIL: Timeout'); process.exit(1); }, 5000);
"
# EXPECT: Connected successfully
```

#### 11.2 — Connect with invalid token
```bash
node -e "
const { io } = require('socket.io-client');
const socket = io('http://localhost:3333/chat', {
  auth: { token: 'invalid-token' },
  transports: ['websocket']
});
socket.on('connect', () => { console.log('FAIL: Should not connect'); process.exit(1); });
socket.on('connect_error', (err) => { console.log('PASS: Rejected'); process.exit(0); });
setTimeout(() => { console.log('FAIL: Timeout'); process.exit(1); }, 5000);
"
# EXPECT: Connection rejected
```

#### 11.3 — Connect with no token
```bash
# Similar to 11.2 but with no auth object
# EXPECT: Connection rejected
```

#### 11.4 — Join conversation room
```bash
# Connect, then emit join_conversation with valid topicId
# EXPECT: 'joined_conversation' event with onlineUsers
```

#### 11.5 — Join conversation with invalid topicId
```bash
# EXPECT: ws_error event
```

#### 11.6 — Send typing indicator
```bash
# Emit 'typing' with { topicId, isTyping: true }
# EXPECT: Other connected clients receive 'server_typing' event
```

#### 11.7 — Send read receipt
```bash
# Emit 'read_receipt' with { topicId, lastReadSequence: 1 }
# EXPECT: 'server_read_receipt' event
```

#### 11.8 — Leave conversation room
```bash
# Emit 'leave_conversation'
# EXPECT: Other clients receive 'server_user_offline'
```

---

### SUITE 12: CROSS-CUTTING CONCERNS (8 tests)

#### 12.1 — Response envelope format
```bash
# Pick any successful endpoint response and verify format:
# { success: true, data: {...}, timestamp: "..." }
# Pick any error response and verify format:
# { success: false, error: { code: "...", message: "..." }, timestamp: "..." }
```

#### 12.2 — CORS headers
```bash
curl -s -w "\n%{http_code}" -X OPTIONS "$BASE_URL/api/v1/auth/register" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -I
# EXPECT: Access-Control-Allow-Origin header present
# VERIFY: Not set to "*" (security rule)
```

#### 12.3 — Request with invalid JSON body
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: application/json" \
  -d 'not json at all'
# EXPECT: 400
```

#### 12.4 — Request with wrong Content-Type
```bash
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/auth/register" \
  -H "Content-Type: text/plain" \
  -d '{"email": "test@test.com"}'
# EXPECT: 400 or 415
```

#### 12.5 — SQL injection attempt
```bash
curl -s -w "\n%{http_code}" "$BASE_URL/api/v1/users/search?q='; DROP TABLE users; --"
# EXPECT: 200 with empty results or 400, NOT a 500 error
# VERIFY DB: users table still exists
```

#### 12.6 — XSS in post content
```bash
curl -s -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d '{"text": "<img src=x onerror=alert(1)>"}'
# EXPECT: 201 (stored) but verify the content is sanitized in the response
```

#### 12.7 — Very large request body
```bash
HUGE_TEXT=$(python3 -c "print('X' * 100000)")
curl -s -w "\n%{http_code}" -X POST "$BASE_URL/api/v1/posts" \
  -H "Authorization: Bearer $ACCESS_TOKEN_1" \
  -H "Content-Type: application/json" \
  -d "{\"text\": \"$HUGE_TEXT\"}"
# EXPECT: 400 or 413 (request too large / exceeds 800 char limit)
```

#### 12.8 — Concurrent requests (race condition check)
```bash
# Send 5 follow requests simultaneously for the same target
for i in $(seq 1 5); do
  curl -s -X POST "$BASE_URL/api/v1/social/follow" \
    -H "Authorization: Bearer $ACCESS_TOKEN_1" \
    -H "Content-Type: application/json" \
    -d "{\"targetAccountId\": \"$ACCOUNT_ID_3\"}" &
done
wait
# VERIFY DB: Only 1 follow row exists, not 5
```

---

## STEP 4: Hedera Verification Summary

After running ALL suites, do a consolidated Hedera mirror node check:

```bash
echo "=== HEDERA VERIFICATION ==="

# 1. Verify User 1 account exists
mirror_check "accounts/$ACCOUNT_ID_1"
# EXPECT: Account exists

# 2. Verify User 2 account exists
mirror_check "accounts/$ACCOUNT_ID_2"

# 3. Check HCS topics created (posts, social graph, conversations)
# For each topicId from test responses, verify messages exist:
mirror_check "topics/$POST1_TOPIC_ID/messages?limit=5&order=desc"
mirror_check "topics/$CONV1_TOPIC_ID/messages?limit=5&order=desc"

# 4. Check payment transfers
mirror_check "transactions?account.id=$ACCOUNT_ID_1&limit=10&order=desc"

# 5. Check for any failed transactions
mirror_check "transactions?account.id=$ACCOUNT_ID_1&result=INSUFFICIENT_ACCOUNT_BALANCE&limit=5"
```

**CRITICAL**: If any API response claims a Hedera transaction succeeded but the mirror node shows nothing — that is a **CRITICAL FAILURE**. Log it prominently.

## STEP 5: Database Verification Summary

```bash
echo "=== DATABASE VERIFICATION ==="

# Count all records created during test
db_query "SELECT 'users' as tbl, count(*) FROM users UNION ALL
          SELECT 'posts', count(*) FROM posts UNION ALL
          SELECT 'social_graph', count(*) FROM social_graph UNION ALL
          SELECT 'conversations', count(*) FROM conversations UNION ALL
          SELECT 'payments', count(*) FROM payments UNION ALL
          SELECT 'notifications', count(*) FROM notifications UNION ALL
          SELECT 'organizations', count(*) FROM organizations;"

# Check for orphaned records (references to non-existent users)
db_query "SELECT count(*) FROM posts p WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p.author_id);"
# EXPECT: 0 orphaned records

# Check that all users have Hedera accounts
db_query "SELECT email, hedera_account_id FROM users WHERE hedera_account_id IS NULL;"
# EXPECT: No rows (all users should have Hedera accounts after OTP verification)
```

## STEP 6: Cleanup

```bash
# Kill the app
kill $APP_PID 2>/dev/null

# Optionally tear down test containers
# docker compose -f docker-compose.test.yml down -v
```

## QA Report Format

Write the report to `.claude/state/qa-report.md`:

```markdown
# E2E QA Report — [timestamp]

## Environment
- App: NestJS on port 3333
- PostgreSQL: localhost:5433
- Redis: localhost:6380
- Hedera Testnet: operator 0.0.XXXXX
- Test run ID: [timestamp]

## Test Summary
- **Total tests: XXX**
- **Passed: XXX**
- **Failed: XXX**
- **Blocked: XXX**

## Results by Suite

### Suite 1: Root & Health (2 tests)
| # | Test | Method | Endpoint | Expected | Actual | DB | Hedera | Result |
|---|------|--------|----------|----------|--------|-----|--------|--------|
| 1.1 | Root | GET | / | 200 | 200 | n/a | n/a | PASS |
| 1.2 | Health | GET | /health | 200 | 200 | n/a | n/a | PASS |

### Suite 2: Authentication (22 tests)
| # | Test | Method | Endpoint | Expected | Actual | DB | Hedera | Result |
|---|------|--------|----------|----------|--------|-----|--------|--------|
| 2.1 | Register email | POST | /auth/register | 201 | ... | ... | ... | ... |
| ... | ... | ... | ... | ... | ... | ... | ... | ... |

[Repeat for ALL 12 suites]

## Hedera Verifications
| What | TopicId/TxId | Mirror Node Result | Status |
|------|-------------|-------------------|--------|
| User 1 account | 0.0.XXXXX | Found | VERIFIED |
| Post HCS message | 0.0.XXXXX seq N | Found | VERIFIED |
| Payment transfer | txId XXXXX | Found | VERIFIED |
| ... | ... | ... | ... |

## Critical Failures
[List any endpoint that returns success but Hedera/DB shows nothing]
[List any 500 errors]
[List any data integrity issues]

## Edge Cases Found
[List any unexpected behavior discovered during testing]

## Recommendations
[Suggestions for fixes or improvements]
```

## RULES

1. **NEVER fake a result** — if an endpoint is down, report FAIL, not PASS
2. **ALWAYS verify side effects** — an HTTP 200 means nothing if the database is empty
3. **ALWAYS check Hedera** — if an endpoint claims to write to HCS/HTS, verify on mirror node
4. **Test EVERY scenario** — happy path + validation errors + auth errors + edge cases
5. **Use real unique data** — timestamp-based emails, unique strings, no hardcoded test data
6. **Respect sequencing** — register before login, login before authenticated calls, create before read
7. **Kill the app when done** — don't leave zombie processes
8. **Report EVERYTHING with evidence** — actual curl output, actual DB query results, actual mirror node responses
9. **Count every test** — the report must have exact numbers for total/pass/fail/blocked
10. **If the app crashes, fix it** — read the error, fix the code, rebuild, restart, retest
11. **Check DB after EVERY write operation** — not just Hedera endpoints
12. **Test as multiple users** — some tests require User 1's token, others User 2's
