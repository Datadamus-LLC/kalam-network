#!/usr/bin/env node
/**
 * BUG-003 Direct Custody Test
 * Tests the exact flow that fails: register → create wallet → send HBAR → custody signing
 * Prints FULL error details including response bodies.
 */
import { readFileSync } from "fs";
import { generateKeyPairSync } from "crypto";

const API = "http://localhost:3001";
const API_V1 = `${API}/api/v1`;
const LOG_FILE = "/tmp/api-server.log";

// ─── Helpers ───
async function req(method, path, body, headers = {}) {
  const url = path.startsWith("http") ? path : `${API_V1}${path}`;
  const opts = {
    method,
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== null && body !== undefined) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(url, opts);
    const raw = await res.text();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw;
    }
    return { status: res.status, data, raw, headers: Object.fromEntries(res.headers) };
  } catch (e) {
    return { status: 0, data: null, raw: null, error: e.message };
  }
}

function extractOtp(identifier) {
  try {
    const log = readFileSync(LOG_FILE, "utf-8");
    const lines = log.split("\n").reverse();
    for (const line of lines) {
      if (line.includes("HACKATHON MODE") && line.includes(identifier)) {
        const match = line.match(/OTP for .+?: (\d{6})/);
        if (match) return match[1];
      }
    }
  } catch (e) {
    console.log(`  [WARN] Cannot read log: ${e.message}`);
  }
  return null;
}

function d(obj) {
  return obj?.data ?? obj;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ───
async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  BUG-003 CUSTODY DIRECT TEST");
  console.log("═══════════════════════════════════════════════════\n");

  // Step 0: Health check
  console.log("── Step 0: Health Check ──");
  const health = await req("GET", `${API}/health`);
  if (health.status !== 200) {
    console.log(`FATAL: API not running at ${API} — got status ${health.status}`);
    console.log("Start the server first: pnpm dev");
    process.exit(1);
  }
  console.log(`✓ API is up: ${JSON.stringify(d(health.data))}\n`);

  // Step 1: Register two users
  // RegisterDto expects: { email?: string, phone?: string } (at least one required)
  console.log("── Step 1: Register Users ──");
  const ts = Date.now();
  const email1 = `custody-test1-${ts}@test.hedera.com`;
  const email2 = `custody-test2-${ts}@test.hedera.com`;

  const reg1 = await req("POST", "/auth/register", {
    email: email1,
  });
  console.log(`Register user1: ${reg1.status} — ${JSON.stringify(d(reg1.data))?.slice(0, 120)}`);
  await sleep(500);

  const otp1 = extractOtp(email1);
  if (!otp1) {
    console.log("FATAL: Could not extract OTP for user1 from server log");
    console.log("Tip: Make sure server was started with: pnpm --filter @hedera-social/api start:dev 2>&1 | tee /tmp/api-server.log");
    process.exit(1);
  }

  // VerifyOtpDto expects: { email?: string, phone?: string, otp: string }
  const verify1 = await req("POST", "/auth/verify-otp", {
    email: email1,
    otp: otp1,
  });
  const token1 = d(verify1.data)?.accessToken;
  console.log(`Verify user1: ${verify1.status} — token=${token1 ? "yes" : "NO"}`);
  if (!token1) {
    console.log("FATAL: No access token for user1");
    console.log("Full response:", JSON.stringify(verify1.data, null, 2));
    process.exit(1);
  }

  const reg2 = await req("POST", "/auth/register", {
    email: email2,
  });
  console.log(`Register user2: ${reg2.status}`);
  await sleep(500);

  const otp2 = extractOtp(email2);
  const verify2 = await req("POST", "/auth/verify-otp", {
    email: email2,
    otp: otp2,
  });
  const token2 = d(verify2.data)?.accessToken;
  console.log(`Verify user2: ${verify2.status} — token=${token2 ? "yes" : "NO"}\n`);

  let auth1 = { Authorization: `Bearer ${token1}` };
  let auth2 = { Authorization: `Bearer ${token2}` };

  // Step 2: Create wallets (triggers custody onboarding)
  console.log("── Step 2: Create Wallets ──");
  const w1 = await req("POST", "/wallet/create", null, auth1);
  console.log(`Wallet user1: ${w1.status}`);
  console.log(`  Response: ${JSON.stringify(d(w1.data), null, 2)?.slice(0, 300)}`);

  // IMPORTANT: wallet/create returns a NEW accessToken with hederaAccountId claim
  const walletToken1 = d(w1.data)?.accessToken;
  if (walletToken1) {
    auth1 = { Authorization: `Bearer ${walletToken1}` };
    console.log(`  → Updated auth1 with new token from wallet/create`);
  }

  const w2 = await req("POST", "/wallet/create", null, auth2);
  console.log(`Wallet user2: ${w2.status}`);
  console.log(`  Response: ${JSON.stringify(d(w2.data), null, 2)?.slice(0, 300)}`);

  const walletToken2 = d(w2.data)?.accessToken;
  if (walletToken2) {
    auth2 = { Authorization: `Bearer ${walletToken2}` };
    console.log(`  → Updated auth2 with new token from wallet/create`);
  }

  const acct1 = d(w1.data)?.hederaAccountId;
  const acct2 = d(w2.data)?.hederaAccountId;
  console.log(`\nUser1 Hedera: ${acct1 || "NONE"}`);
  console.log(`User2 Hedera: ${acct2 || "NONE"}`);

  if (!acct1 || !acct2) {
    console.log("\nWARNING: Wallet creation didn't return Hedera account IDs.");
    console.log("Custody onboarding may have failed. Check server logs.\n");
  }

  // Step 3: Check balance (using updated token that includes hederaAccountId)
  console.log("\n── Step 3: Check Balance ──");
  const bal = await req("GET", "/payments/balance", null, auth1);
  console.log(`Balance: ${bal.status} — ${JSON.stringify(d(bal.data))?.slice(0, 200)}\n`);

  // Step 3b: Set encryption public keys (required for conversations)
  // Generate real X25519 key pairs for E2E encryption (base64-encoded 32-byte keys)
  console.log("── Step 3b: Set Encryption Keys ──");
  function generateX25519PublicKeyBase64() {
    const { publicKey } = generateKeyPairSync("x25519");
    const raw = publicKey.export({ type: "spki", format: "der" });
    // DER-encoded SPKI for X25519: 44 bytes total, last 32 are the raw key
    return Buffer.from(raw.slice(-32)).toString("base64");
  }
  const encKey1 = generateX25519PublicKeyBase64();
  const encKey2 = generateX25519PublicKeyBase64();
  console.log(`  Key1: ${encKey1} (${Buffer.from(encKey1, "base64").length} bytes)`);
  console.log(`  Key2: ${encKey2} (${Buffer.from(encKey2, "base64").length} bytes)`);
  const upd1 = await req("PUT", "/profile/me", { encryptionPublicKey: encKey1 }, auth1);
  console.log(`Set enc key user1: ${upd1.status}`);
  if (upd1.status !== 200) console.log(`  Error: ${JSON.stringify(d(upd1.data), null, 2)?.slice(0, 400)}`);
  const upd2 = await req("PUT", "/profile/me", { encryptionPublicKey: encKey2 }, auth2);
  console.log(`Set enc key user2: ${upd2.status}`);
  if (upd2.status !== 200) console.log(`  Error: ${JSON.stringify(d(upd2.data), null, 2)?.slice(0, 400)}`);

  // Step 4: Create a conversation (needed for topicId in payment)
  // CreateConversationDto expects: { participantAccountIds: string[], type: "direct"|"group" }
  console.log("── Step 4: Setup Conversation ──");
  const me1 = await req("GET", "/profile/me", null, auth1);
  const me2 = await req("GET", "/profile/me", null, auth2);
  const user1AccountId = d(me1.data)?.hederaAccountId || acct1;
  const user2AccountId = d(me2.data)?.hederaAccountId || acct2;
  console.log(`User1 account: ${user1AccountId}`);
  console.log(`User2 account: ${user2AccountId}`);

  let topicId = "0.0.1234"; // fallback
  if (user2AccountId) {
    const conv = await req(
      "POST",
      "/conversations",
      { participantAccountIds: [user2AccountId], type: "direct" },
      auth1,
    );
    console.log(`Create conv: ${conv.status}`);
    console.log(`  Response: ${JSON.stringify(d(conv.data), null, 2)?.slice(0, 400)}`);
    topicId = d(conv.data)?.hcsTopicId || topicId;
  }
  console.log(`TopicId: ${topicId}\n`);

  // ═══ Step 5: THE ACTUAL CUSTODY TEST ═══
  // SendPaymentDto expects: { recipientAccountId, amount, currency, topicId, note? }
  console.log("═══════════════════════════════════════════════════");
  console.log("  Step 5: SEND HBAR (triggers custody signing)");
  console.log("═══════════════════════════════════════════════════\n");

  const sendResult = await req(
    "POST",
    "/payments/send",
    {
      recipientAccountId: acct2 || "0.0.1234",
      amount: 1,
      currency: "HBAR",
      topicId,
      note: "BUG-003 custody test",
    },
    auth1,
  );

  console.log(`STATUS: ${sendResult.status}`);
  console.log(`RAW RESPONSE:`);
  console.log(JSON.stringify(sendResult.data, null, 2));
  console.log();

  if (sendResult.status === 200 || sendResult.status === 201) {
    console.log("══════════════════════════════════════");
    console.log("  ✅ BUG-003 RESOLVED — CUSTODY WORKS!");
    console.log("══════════════════════════════════════");
  } else {
    console.log("══════════════════════════════════════════════════");
    console.log("  ❌ BUG-003 STILL FAILING");
    console.log("══════════════════════════════════════════════════");
    console.log();
    console.log("Error code:", sendResult.data?.error?.code || sendResult.data?.code || "N/A");
    console.log("Error message:", sendResult.data?.error?.message || sendResult.data?.message || "N/A");
    console.log("Full error:", JSON.stringify(sendResult.data?.error || sendResult.data, null, 2));

    // Check server logs for the detailed custody error
    console.log("\n── Server Log (last 30 lines with 'custody' or 'error'): ──");
    try {
      const log = readFileSync(LOG_FILE, "utf-8");
      const lines = log.split("\n");
      const relevant = lines.filter(
        (l) =>
          l.toLowerCase().includes("custody") ||
          l.toLowerCase().includes("tamam") ||
          (l.toLowerCase().includes("error") && l.toLowerCase().includes("payment")),
      );
      relevant.slice(-30).forEach((l) => console.log(`  ${l}`));
    } catch (e) {
      console.log(`  Could not read logs: ${e.message}`);
    }
  }

  console.log("\n── Done ──");
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
