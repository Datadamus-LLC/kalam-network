# P0-T08: Hedera Testnet One-Time Setup

| Field | Value |
|-------|-------|
| Task ID | P0-T08 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 2 hours |
| Depends On | P0-T06 (Hedera Service), P0-T04 (NestJS Backend) |
| Phase | 0 — Project Setup |
| Assignee | Backend developer |

---

## Objective

Create and execute a setup script that:
1. Creates a DID NFT token collection (for user identity NFTs)
2. Creates 3 platform HCS topics (social graph, KYC attestation, announcements)
3. Stores the resource IDs in the `.env` file for the backend to use

After this task, all platform-level Hedera resources are initialized on testnet and ready for user onboarding.

---

## Background

Before the platform can operate, it needs **platform-level resources** on Hedera:

| Resource | Purpose | Type | Quantity |
|----------|---------|------|----------|
| **DID NFT Token** | User identity proof (minted once per user) | HTS Token (NFT) | 1 |
| **Social Graph Topic** | Records all follow/unfollow events | HCS Topic | 1 |
| **KYC Attestation Topic** | Records when users complete KYC | HCS Topic | 1 |
| **Announcements Topic** | Platform announcements, urgent notices | HCS Topic | 1 |

These resources are created once during setup, then reused throughout the platform's lifetime.

---

## Pre-requisites

- P0-T06 complete (HederaService with working SDK methods)
- Hedera testnet account with ~5 HBAR balance
  - Get one at: https://portal.hedera.com
  - Download your account details (Account ID and Private Key)
- `.env` file with HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY filled in
- `pnpm install` has run successfully

---

## Step-by-Step Instructions

### Step 1: Create the setup script

Create `packages/api/scripts/setup-testnet.ts`:

```typescript
import { ConfigService } from '@nestjs/config';
import {
  Client,
  PrivateKey,
  AccountCreateTransaction,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TopicCreateTransaction,
  PublicKey,
  Hbar,
} from '@hashgraph/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * Hedera Testnet Setup Script
 *
 * CLI script — console.log acceptable for one-time setup output
 *
 * This script creates all platform-level Hedera resources:
 * - 1 DID NFT token collection
 * - 3 HCS topics (social graph, KYC attestation, announcements)
 *
 * Run with: npx ts-node scripts/setup-testnet.ts
 * Or from package.json: npm run setup:testnet
 */

// Load environment variables
dotenv.config({ path: '../../.env' });

const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet';
const HEDERA_OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
const HEDERA_OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY;

// Validate environment
if (!HEDERA_OPERATOR_ID || !HEDERA_OPERATOR_KEY) {
  console.error('ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env');
  process.exit(1);
}

interface SetupResult {
  didTokenId: string;
  socialGraphTopic: string;
  kycAttestationTopic: string;
  announcementsTopic: string;
  setupTime: string;
}

/**
 * Initialize Hedera client for testnet
 */
function initializeClient(): Client {
  let client: Client;

  if (HEDERA_NETWORK === 'testnet') {
    client = Client.forTestnet();
  } else if (HEDERA_NETWORK === 'previewnet') {
    client = Client.forPreviewnet();
  } else if (HEDERA_NETWORK === 'mainnet') {
    client = Client.forMainnet();
  } else {
    throw new Error(`Unknown network: ${HEDERA_NETWORK}`);
  }

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY);
  client.setOperator(HEDERA_OPERATOR_ID, operatorKey);

  console.log(`✓ Hedera client initialized for ${HEDERA_NETWORK}`);
  console.log(`✓ Operator: ${HEDERA_OPERATOR_ID}`);

  return client;
}

/**
 * Create the DID NFT token collection
 *
 * This token is used to mint soulbound NFTs representing user identities.
 * Each user gets exactly 1 NFT serial number.
 *
 * - Type: NON_FUNGIBLE_UNIQUE (each NFT is unique)
 * - Supply Type: FINITE (max supply = 1 million)
 * - Treasury: operator account (we hold the tokens before minting to users)
 * - Supply Key: operator key (we can mint new NFTs)
 * - Freeze Key: operator key (we can freeze NFTs on accounts to make them soulbound)
 * - Wipe Key: operator key (we can burn/wipe NFTs)
 */
async function createDidToken(client: Client): Promise<string> {
  console.log('\n📋 Creating DID NFT Token...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TokenCreateTransaction()
    .setTokenName('Hedera Social DID')
    .setTokenSymbol('HSOCIAL-DID')
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0) // NFTs have no initial supply, minted per user
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(1000000) // Max 1 million users
    .setTreasury(HEDERA_OPERATOR_ID)
    .setSupplyKey(operatorPublicKey) // Can mint new NFTs
    .setFreezeKey(operatorPublicKey) // Can freeze NFTs (soulbound enforcement)
    .setWipeKey(operatorPublicKey) // Can wipe/burn NFTs (for profile updates)
    .setMemo('Hedera Social Platform — User Identity NFTs')
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  const tokenId = receipt.tokenId.toString();
  console.log(`✓ Created DID token: ${tokenId}`);
  console.log(`  - Type: NON_FUNGIBLE_UNIQUE`);
  console.log(`  - Max supply: 1,000,000`);
  console.log(`  - Has supply key: Yes (can mint)`);
  console.log(`  - Has freeze key: Yes (soulbound enforcement)`);
  console.log(`  - Has wipe key: Yes (for profile updates)`);

  return tokenId;
}

/**
 * Create the Social Graph HCS Topic
 *
 * All follow/unfollow events are published to this topic.
 * This creates an immutable, auditable record of the social graph.
 *
 * - Submit Key: Only the platform can submit messages
 * - Admin Key: Platform can update/delete the topic if needed
 * - Message Format: JSON with { type: "follow" | "unfollow", follower, following, timestamp }
 */
async function createSocialGraphTopic(client: Client): Promise<string> {
  console.log('\n📋 Creating Social Graph Topic...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TopicCreateTransaction()
    .setTopicMemo('Hedera Social Platform — Social Graph (follow/unfollow events)')
    .setSubmitKey(operatorPublicKey) // Only platform can submit
    .setAdminKey(operatorPublicKey) // Platform can manage
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  const topicId = receipt.topicId.toString();
  console.log(`✓ Created Social Graph topic: ${topicId}`);
  console.log(`  - Purpose: Immutable record of follow/unfollow events`);
  console.log(`  - Submit Key: Platform only`);
  console.log(`  - Admin Key: Platform`);

  return topicId;
}

/**
 * Create the KYC Attestation HCS Topic
 *
 * When a user completes KYC and gets their DID NFT minted,
 * an attestation message is published here. This proves when each user was verified.
 *
 * - Message Format: JSON with { userId, kycLevel, timestamp, screeningId }
 */
async function createKycAttestationTopic(client: Client): Promise<string> {
  console.log('\n📋 Creating KYC Attestation Topic...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TopicCreateTransaction()
    .setTopicMemo('Hedera Social Platform — KYC Attestation (identity verification records)')
    .setSubmitKey(operatorPublicKey)
    .setAdminKey(operatorPublicKey)
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  const topicId = receipt.topicId.toString();
  console.log(`✓ Created KYC Attestation topic: ${topicId}`);
  console.log(`  - Purpose: Record of verified identities (KYC approvals)`);
  console.log(`  - Submit Key: Platform only`);
  console.log(`  - Admin Key: Platform`);

  return topicId;
}

/**
 * Create the Announcements HCS Topic
 *
 * Platform announcements, urgent notices, maintenance alerts.
 * All users subscribe to this topic.
 *
 * - Message Format: JSON with { title, message, type, timestamp }
 */
async function createAnnouncementsTopic(client: Client): Promise<string> {
  console.log('\n📋 Creating Announcements Topic...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TopicCreateTransaction()
    .setTopicMemo('Hedera Social Platform — Announcements (platform notices)')
    .setSubmitKey(operatorPublicKey)
    .setAdminKey(operatorPublicKey)
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  const topicId = receipt.topicId.toString();
  console.log(`✓ Created Announcements topic: ${topicId}`);
  console.log(`  - Purpose: Platform announcements and urgent notices`);
  console.log(`  - Submit Key: Platform only`);
  console.log(`  - Admin Key: Platform`);

  return topicId;
}

/**
 * Update .env file with the created resource IDs
 */
function updateEnvFile(result: SetupResult) {
  console.log('\n📝 Updating .env file...');

  const envPath = path.join(process.cwd(), '../../.env');

  if (!fs.existsSync(envPath)) {
    throw new Error('.env file not found. Create it from .env.example first.');
  }

  let envContent = fs.readFileSync(envPath, 'utf-8');

  // Update or add each resource ID
  envContent = updateEnvVariable(envContent, 'HEDERA_DID_TOKEN_ID', result.didTokenId);
  envContent = updateEnvVariable(envContent, 'HEDERA_SOCIAL_GRAPH_TOPIC', result.socialGraphTopic);
  envContent = updateEnvVariable(envContent, 'HEDERA_KYC_ATTESTATION_TOPIC', result.kycAttestationTopic);
  envContent = updateEnvVariable(envContent, 'HEDERA_ANNOUNCEMENTS_TOPIC', result.announcementsTopic);

  fs.writeFileSync(envPath, envContent, 'utf-8');

  console.log(`✓ Updated .env with resource IDs`);
  console.log(`  - HEDERA_DID_TOKEN_ID=${result.didTokenId}`);
  console.log(`  - HEDERA_SOCIAL_GRAPH_TOPIC=${result.socialGraphTopic}`);
  console.log(`  - HEDERA_KYC_ATTESTATION_TOPIC=${result.kycAttestationTopic}`);
  console.log(`  - HEDERA_ANNOUNCEMENTS_TOPIC=${result.announcementsTopic}`);
}

/**
 * Helper to update or add a variable in .env content
 */
function updateEnvVariable(content: string, key: string, value: string): string {
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    // Update existing variable
    return content.replace(regex, `${key}=${value}`);
  } else {
    // Add new variable before the logging section
    return content.replace(
      /\n# --- Logging/,
      `\n${key}=${value}\n\n# --- Logging`,
    );
  }
}

/**
 * Print a summary of created resources
 */
function printSummary(result: SetupResult) {
  console.log('\n' + '='.repeat(60));
  console.log('🎉 HEDERA TESTNET SETUP COMPLETE');
  console.log('='.repeat(60));

  console.log('\n📊 Resources Created:');
  console.log(`   DID Token ID: ${result.didTokenId}`);
  console.log(`   Social Graph Topic: ${result.socialGraphTopic}`);
  console.log(`   KYC Attestation Topic: ${result.kycAttestationTopic}`);
  console.log(`   Announcements Topic: ${result.announcementsTopic}`);

  console.log('\n🔗 View on HashScan (Hedera Block Explorer):');
  const hashScanBase = HEDERA_NETWORK === 'mainnet'
    ? 'https://hashscan.io'
    : `https://hashscan.io/?network=${HEDERA_NETWORK}`;

  console.log(`   Token: ${hashScanBase}/token/${result.didTokenId}`);
  console.log(`   Topic 1: ${hashScanBase}/topic/${result.socialGraphTopic}`);
  console.log(`   Topic 2: ${hashScanBase}/topic/${result.kycAttestationTopic}`);
  console.log(`   Topic 3: ${hashScanBase}/topic/${result.announcementsTopic}`);

  console.log('\n✅ Next Steps:');
  console.log('   1. The .env file has been updated with resource IDs');
  console.log('   2. Restart your backend: npm run dev:api');
  console.log('   3. Start the frontend: npm run dev:web');
  console.log('   4. Create a user account and complete onboarding');
  console.log('   5. Your DID NFT will be minted to your Hedera account');

  console.log('\n💡 Tips:');
  console.log('   - All resources were created on Hedera testnet');
  console.log('   - Testnet HBAR is free but has limits');
  console.log('   - For production, run this script again with mainnet credentials');
  console.log('   - The DID token supply can grow up to 1,000,000 users');

  console.log('\n' + '='.repeat(60));
}

/**
 * Main execution
 */
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 HEDERA SOCIAL PLATFORM — TESTNET SETUP');
  console.log('='.repeat(60));

  console.log(`\n🌐 Network: ${HEDERA_NETWORK}`);
  console.log(`👤 Operator: ${HEDERA_OPERATOR_ID}`);

  try {
    const client = initializeClient();

    // Create all platform-level resources
    const didTokenId = await createDidToken(client);
    const socialGraphTopic = await createSocialGraphTopic(client);
    const kycAttestationTopic = await createKycAttestationTopic(client);
    const announcementsTopic = await createAnnouncementsTopic(client);

    // Prepare results
    const result: SetupResult = {
      didTokenId,
      socialGraphTopic,
      kycAttestationTopic,
      announcementsTopic,
      setupTime: new Date().toISOString(),
    };

    // Update .env file
    updateEnvFile(result);

    // Print summary
    printSummary(result);

    // Save setup log
    const logPath = path.join(process.cwd(), 'setup-result.json');
    fs.writeFileSync(logPath, JSON.stringify(result, null, 2));
    console.log(`\n📄 Setup result saved to: ${logPath}`);

    // Cleanup
    await client.close();

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error('\nTroubleshooting:');

    if (error.message.includes('INSUFFICIENT_PAYER_BALANCE')) {
      console.error('   - Your testnet account has insufficient HBAR balance');
      console.error('   - Get more HBAR at: https://portal.hedera.com');
      console.error('   - Each resource creation costs 0.01 HBAR (~$0.05 equivalent)');
    } else if (error.message.includes('INVALID_ACCOUNT_ID')) {
      console.error('   - HEDERA_OPERATOR_ID is invalid');
      console.error('   - Get a testnet account at: https://portal.hedera.com');
    } else if (error.message.includes('INVALID_SIGNATURE')) {
      console.error('   - HEDERA_OPERATOR_KEY is invalid');
      console.error('   - Use the DER-encoded private key from portal.hedera.com');
    }

    process.exit(1);
  }
}

// Run the script
main();
```

### Step 2: Add npm script to package.json

Update `packages/api/package.json` to add:

```json
{
  "scripts": {
    "setup:testnet": "ts-node -O '{\"module\":\"commonjs\"}' scripts/setup-testnet.ts"
  }
}
```

### Step 3: Ensure ts-node is installed

```bash
cd packages/api
pnpm add -D ts-node
```

### Step 4: Get a Hedera testnet account (if you don't have one)

1. Go to: https://portal.hedera.com
2. Click "Create Account"
3. Complete the form (email, password, account type)
4. After verification, you'll receive:
   - **Account ID** (format: 0.0.XXXXX)
   - **Private Key** (DER-encoded hex string starting with 302e020100...)
   - Some free testnet HBAR (usually 100 HBAR)

5. Copy these into your `.env` file:

```env
HEDERA_OPERATOR_ID=0.0.12345        # Replace with your Account ID
HEDERA_OPERATOR_KEY=302e020100...   # Replace with your Private Key
```

### Step 5: Run the setup script

From the repo root:

```bash
cd packages/api
pnpm setup:testnet
```

Expected output:

```
============================================================
🚀 HEDERA SOCIAL PLATFORM — TESTNET SETUP
============================================================

🌐 Network: testnet
👤 Operator: 0.0.12345
✓ Hedera client initialized for testnet
✓ Operator: 0.0.12345

📋 Creating DID NFT Token...
✓ Created DID token: 0.0.9876543
  - Type: NON_FUNGIBLE_UNIQUE
  - Max supply: 1,000,000
  - Has supply key: Yes (can mint)
  - Has freeze key: Yes (soulbound enforcement)
  - Has wipe key: Yes (for profile updates)

📋 Creating Social Graph Topic...
✓ Created Social Graph topic: 0.0.11111
  - Purpose: Immutable record of follow/unfollow events
  - Submit Key: Platform only
  - Admin Key: Platform

📋 Creating KYC Attestation Topic...
✓ Created KYC Attestation topic: 0.0.22222
  - Purpose: Record of verified identities (KYC approvals)
  - Submit Key: Platform only
  - Admin Key: Platform

📋 Creating Announcements Topic...
✓ Created Announcements topic: 0.0.33333
  - Purpose: Platform announcements and urgent notices
  - Submit Key: Platform only
  - Admin Key: Platform

📝 Updating .env file...
✓ Updated .env with resource IDs
  - HEDERA_DID_TOKEN_ID=0.0.9876543
  - HEDERA_SOCIAL_GRAPH_TOPIC=0.0.11111
  - HEDERA_KYC_ATTESTATION_TOPIC=0.0.22222
  - HEDERA_ANNOUNCEMENTS_TOPIC=0.0.33333

============================================================
🎉 HEDERA TESTNET SETUP COMPLETE
============================================================

📊 Resources Created:
   DID Token ID: 0.0.9876543
   Social Graph Topic: 0.0.11111
   KYC Attestation Topic: 0.0.22222
   Announcements Topic: 0.0.33333

🔗 View on HashScan (Hedera Block Explorer):
   Token: https://hashscan.io?network=testnet&tab=nft&t=0.0.9876543
   Topic 1: https://hashscan.io?network=testnet&tab=topic&t=0.0.11111
   ...

✅ Next Steps:
   1. The .env file has been updated with resource IDs
   2. Restart your backend: npm run dev:api
   3. Start the frontend: npm run dev:web
   4. Create a user account and complete onboarding
```

### Step 6: Verify the resources on HashScan

Visit HashScan (https://hashscan.io) and search for:
- **Token**: Paste the DID_TOKEN_ID — you should see "Hedera Social DID" with 1M supply
- **Topics**: Paste each topic ID — you should see them with 0 messages (not yet used)

Example URLs:
```
https://hashscan.io?network=testnet&t=0.0.9876543          (token)
https://hashscan.io?network=testnet&t=0.0.11111            (social graph topic)
```

### Step 7: Verify .env was updated

```bash
grep "HEDERA_DID_TOKEN_ID\|HEDERA_SOCIAL_GRAPH_TOPIC\|HEDERA_KYC_ATTESTATION_TOPIC\|HEDERA_ANNOUNCEMENTS_TOPIC" .env
```

Expected output:

```
HEDERA_DID_TOKEN_ID=0.0.9876543
HEDERA_SOCIAL_GRAPH_TOPIC=0.0.11111
HEDERA_KYC_ATTESTATION_TOPIC=0.0.22222
HEDERA_ANNOUNCEMENTS_TOPIC=0.0.33333
```

### Step 8: Restart the backend

Now that the .env has the resource IDs, the backend can use them:

```bash
cd packages/api
npm run start:dev
```

The backend should start without errors. The HederaService will now have access to the platform topic IDs.

---

## Verification Steps

Run each of these and confirm the expected output:

| # | Command | Expected |
|---|---------|----------|
| 1 | `ls packages/api/scripts/setup-testnet.ts` | File exists |
| 2 | `grep "createDidToken\|createSocialGraphTopic" packages/api/scripts/setup-testnet.ts` | Both functions exist |
| 3 | `grep "HEDERA_DID_TOKEN_ID" .env` | Returns non-empty value (0.0.XXXXX) |
| 4 | `grep "HEDERA_SOCIAL_GRAPH_TOPIC" .env` | Returns non-empty value (0.0.XXXXX) |
| 5 | `grep "HEDERA_KYC_ATTESTATION_TOPIC" .env` | Returns non-empty value (0.0.XXXXX) |
| 6 | `grep "HEDERA_ANNOUNCEMENTS_TOPIC" .env` | Returns non-empty value (0.0.XXXXX) |
| 7 | Visit HashScan for token | Token page shows "Hedera Social DID" |
| 8 | Visit HashScan for topic 1 | Topic page shows "Social Graph" memo |
| 9 | `ls packages/api/setup-result.json` | File exists with JSON result |
| 10 | `npm run start:dev` (from packages/api) | Backend starts without "HEDERA_DID_TOKEN_ID not found" error |

---

## Definition of Done

- [ ] Setup script created at `packages/api/scripts/setup-testnet.ts`
- [ ] Script creates 1 DID NFT token (NON_FUNGIBLE_UNIQUE, 1M supply, with supply/freeze/wipe keys)
- [ ] Script creates 3 HCS topics (social graph, KYC attestation, announcements)
- [ ] Each topic has proper submit key (platform only) and admin key (platform)
- [ ] Script updates .env file with all 4 resource IDs
- [ ] npm script added: `npm run setup:testnet`
- [ ] Script can run without errors (assuming valid HEDERA credentials)
- [ ] All 4 resource IDs have been added to .env
- [ ] Each resource ID is a valid Hedera ID format (0.0.XXXXX)
- [ ] Resources are visible on HashScan with correct metadata
- [ ] Backend starts without errors after setup completes
- [ ] setup-result.json is created with setup details

---

## Troubleshooting

**Problem:** "INSUFFICIENT_PAYER_BALANCE"
**Fix:** Your testnet account needs at least 5 HBAR (~$0.05 equivalent). Go to https://portal.hedera.com and request more testnet HBAR. It's free!

**Problem:** "INVALID_ACCOUNT_ID"
**Fix:** The HEDERA_OPERATOR_ID format is wrong. It should be "0.0.XXXXX" (3 numbers separated by dots). Check https://portal.hedera.com.

**Problem:** "INVALID_SIGNATURE" or "Cannot parse key"
**Fix:** The HEDERA_OPERATOR_KEY is invalid. Get the DER-encoded private key from https://portal.hedera.com. It's a long hex string starting with 302e020100.

**Problem:** Script says "topic already exists"
**Fix:** You ran the script twice. The resources already exist on testnet. Just add them to .env manually:

```bash
# If you saved setup-result.json last time:
cat packages/api/setup-result.json
# Then manually update .env with the values from the JSON
```

**Problem:** ".env file not found"
**Fix:** Create it from the template: `cp .env.example .env`, then fill in HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY.

**Problem:** "ts-node command not found"
**Fix:** Install it: `pnpm add -D ts-node`. Make sure you're in the packages/api directory.

**Problem:** Resources created but .env not updated
**Fix:** Manually copy the values from the script output into .env:

```env
HEDERA_DID_TOKEN_ID=0.0.9876543
HEDERA_SOCIAL_GRAPH_TOPIC=0.0.11111
HEDERA_KYC_ATTESTATION_TOPIC=0.0.22222
HEDERA_ANNOUNCEMENTS_TOPIC=0.0.33333
```

**Problem:** "Resource IDs are 0.0.0"
**Fix:** The script failed silently. Check the full error message. Usually it's due to:
- Insufficient HBAR balance
- Invalid operator credentials
- Network connectivity issues

---

## Files Created in This Task

```
packages/api/
├── scripts/
│   └── setup-testnet.ts                   (complete setup script)
├── setup-result.json                       (created after running script)
└── package.json                            (updated with setup:testnet script)

Root:
└── .env                                    (updated with 4 resource IDs)
```

---

## What Happens Next

After this task is complete:

- **User Onboarding (Phase 1)** — When users complete KYC, their DID NFT is minted to the DID_TOKEN_ID
- **Social Graph (Phase 1)** — All follow/unfollow events are published to SOCIAL_GRAPH_TOPIC
- **Notifications (Phase 1)** — KYC approvals are published to KYC_ATTESTATION_TOPIC
- **Production Deployment** — To deploy to mainnet, run this script again with mainnet credentials

---

## Additional Notes

### About Testnet Resources

**Testnet** is a free, non-production network for testing:
- HBAR is free but has limits
- Data persists (not wiped regularly anymore)
- Use for development and demos
- No real financial value

**Mainnet** is the production network:
- HBAR has real financial value
- Higher transaction costs
- Data is permanent and immutable
- Use for production deployments

### Creating Resources on Mainnet

To set up on mainnet later, just run the script with mainnet credentials:

```bash
# Update .env
HEDERA_NETWORK=mainnet
HEDERA_OPERATOR_ID=0.0.YOUR_MAINNET_ID
HEDERA_OPERATOR_KEY=YOUR_MAINNET_KEY

# Run the same script
npm run setup:testnet

# It will create resources on mainnet instead of testnet
```

### Resource Costs

Each resource creation costs HBAR:
- DID Token: ~0.01 HBAR
- Topic 1: ~0.01 HBAR
- Topic 2: ~0.01 HBAR
- Topic 3: ~0.01 HBAR
- **Total: ~0.04 HBAR (~$0.002 equivalent)**

On testnet, this is free. On mainnet, it costs real money, but only one-time during setup.

### Scaling to Millions of Users

The DID token has a maximum supply of 1,000,000. This is intentional:
- 1 million users can be onboarded
- Each gets exactly 1 NFT serial number
- If you need more, modify the script and run it again to create a new token

For production with unlimited users, consider:
- Increasing MAX_SUPPLY to higher number
- Or creating a token pool with multiple tokens
- Hedera's HTS can scale to billions of transactions per year
