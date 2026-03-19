import {
  Client,
  Hbar,
  PrivateKey,
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TopicCreateTransaction,
} from '@hashgraph/sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

/**
 * Hedera Testnet Setup Script
 *
 * CLI script — console output allowed for one-time setup tooling
 *
 * This script creates all platform-level Hedera resources:
 * - 1 DID NFT token collection
 * - 3 HCS topics (social graph, KYC attestation, announcements)
 *
 * Run with: npx ts-node scripts/setup-testnet.ts
 * Or from package.json: pnpm setup:testnet
 */

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const HEDERA_NETWORK = process.env.HEDERA_NETWORK || 'testnet';
const HEDERA_OPERATOR_ID = process.env.HEDERA_OPERATOR_ID;
const HEDERA_OPERATOR_KEY = process.env.HEDERA_OPERATOR_KEY;

// Validate environment
if (!HEDERA_OPERATOR_ID || !HEDERA_OPERATOR_KEY) {
  console.error(
    'ERROR: HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env',
  );
  console.error(
    'Get a testnet account at: https://portal.hedera.com',
  );
  process.exit(1);
}

interface SetupResult {
  didTokenId: string;
  socialGraphTopic: string;
  kycAttestationTopic: string;
  announcementsTopic: string;
  notificationTopic: string;
  setupTime: string;
}

/**
 * Initialize Hedera client for the configured network
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
    console.error(`Unknown network: ${HEDERA_NETWORK}`);
    console.error('Valid values: testnet, previewnet, mainnet');
    process.exit(1);
  }

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY as string);
  client.setOperator(HEDERA_OPERATOR_ID as string, operatorKey);

  console.log(`[OK] Hedera client initialized for ${HEDERA_NETWORK}`);
  console.log(`[OK] Operator: ${HEDERA_OPERATOR_ID}`);

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
  console.log('\nCreating DID NFT Token...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY as string);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TokenCreateTransaction()
    .setTokenName('Hedera Social DID')
    .setTokenSymbol('HSOCIAL-DID')
    .setTokenType(TokenType.NonFungibleUnique)
    .setDecimals(0)
    .setInitialSupply(0) // NFTs have no initial supply, minted per user
    .setSupplyType(TokenSupplyType.Finite)
    .setMaxSupply(1000000) // Max 1 million users
    .setTreasuryAccountId(HEDERA_OPERATOR_ID as string)
    .setSupplyKey(operatorPublicKey) // Can mint new NFTs
    .setFreezeKey(operatorPublicKey) // Can freeze NFTs (soulbound enforcement)
    .setWipeKey(operatorPublicKey) // Can wipe/burn NFTs (for profile updates)
    .setTokenMemo('Hedera Social Platform -- User Identity NFTs')
    .setMaxTransactionFee(new Hbar(30))
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.tokenId === null) {
    console.error('ERROR: Token creation succeeded but tokenId is null in receipt');
    process.exit(1);
  }

  const tokenId = receipt.tokenId.toString();
  console.log(`[OK] Created DID token: ${tokenId}`);
  console.log('  - Type: NON_FUNGIBLE_UNIQUE');
  console.log('  - Max supply: 1,000,000');
  console.log('  - Has supply key: Yes (can mint)');
  console.log('  - Has freeze key: Yes (soulbound enforcement)');
  console.log('  - Has wipe key: Yes (for profile updates)');

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
  console.log('\nCreating Social Graph Topic...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY as string);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TopicCreateTransaction()
    .setTopicMemo(
      'Hedera Social Platform -- Social Graph (follow/unfollow events)',
    )
    .setSubmitKey(operatorPublicKey) // Only platform can submit
    .setAdminKey(operatorPublicKey) // Platform can manage
    .setMaxTransactionFee(new Hbar(5))
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.topicId === null) {
    console.error('ERROR: Topic creation succeeded but topicId is null in receipt');
    process.exit(1);
  }

  const topicId = receipt.topicId.toString();
  console.log(`[OK] Created Social Graph topic: ${topicId}`);
  console.log('  - Purpose: Immutable record of follow/unfollow events');
  console.log('  - Submit Key: Platform only');
  console.log('  - Admin Key: Platform');

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
  console.log('\nCreating KYC Attestation Topic...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY as string);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TopicCreateTransaction()
    .setTopicMemo(
      'Hedera Social Platform -- KYC Attestation (identity verification records)',
    )
    .setSubmitKey(operatorPublicKey)
    .setAdminKey(operatorPublicKey)
    .setMaxTransactionFee(new Hbar(5))
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.topicId === null) {
    console.error('ERROR: Topic creation succeeded but topicId is null in receipt');
    process.exit(1);
  }

  const topicId = receipt.topicId.toString();
  console.log(`[OK] Created KYC Attestation topic: ${topicId}`);
  console.log('  - Purpose: Record of verified identities (KYC approvals)');
  console.log('  - Submit Key: Platform only');
  console.log('  - Admin Key: Platform');

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
  console.log('\nCreating Announcements Topic...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY as string);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TopicCreateTransaction()
    .setTopicMemo(
      'Hedera Social Platform -- Announcements (platform notices)',
    )
    .setSubmitKey(operatorPublicKey)
    .setAdminKey(operatorPublicKey)
    .setMaxTransactionFee(new Hbar(5))
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.topicId === null) {
    console.error('ERROR: Topic creation succeeded but topicId is null in receipt');
    process.exit(1);
  }

  const topicId = receipt.topicId.toString();
  console.log(`[OK] Created Announcements topic: ${topicId}`);
  console.log('  - Purpose: Platform announcements and urgent notices');
  console.log('  - Submit Key: Platform only');
  console.log('  - Admin Key: Platform');

  return topicId;
}

/**
 * Create the Notifications HCS Topic
 *
 * User-specific notifications (follow events, payment receipts, etc.)
 * are published to this topic.
 *
 * - Message Format: JSON with { userId, type, payload, timestamp }
 */
async function createNotificationTopic(client: Client): Promise<string> {
  console.log('\nCreating Notification Topic...');

  const operatorKey = PrivateKey.fromStringDer(HEDERA_OPERATOR_KEY as string);
  const operatorPublicKey = operatorKey.publicKey;

  const transaction = new TopicCreateTransaction()
    .setTopicMemo(
      'Hedera Social Platform -- Notifications (user notification events)',
    )
    .setSubmitKey(operatorPublicKey)
    .setAdminKey(operatorPublicKey)
    .setMaxTransactionFee(new Hbar(5))
    .freezeWith(client);

  const signedTx = await transaction.sign(operatorKey);
  const response = await signedTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (receipt.topicId === null) {
    console.error('ERROR: Topic creation succeeded but topicId is null in receipt');
    process.exit(1);
  }

  const topicId = receipt.topicId.toString();
  console.log(`[OK] Created Notification topic: ${topicId}`);
  console.log('  - Purpose: User notification events');
  console.log('  - Submit Key: Platform only');
  console.log('  - Admin Key: Platform');

  return topicId;
}

/**
 * Helper to update or add a variable in .env content
 */
function updateEnvVariable(
  content: string,
  key: string,
  value: string,
): string {
  const regex = new RegExp(`^${key}=.*$`, 'm');

  if (regex.test(content)) {
    // Update existing variable
    return content.replace(regex, `${key}=${value}`);
  } else {
    // Append the variable at the end
    const trimmed = content.trimEnd();
    return `${trimmed}\n${key}=${value}\n`;
  }
}

/**
 * Update .env file with the created resource IDs
 */
function updateEnvFile(result: SetupResult): void {
  console.log('\nUpdating .env file...');

  const envPath = path.resolve(__dirname, '../../../.env');

  if (!fs.existsSync(envPath)) {
    console.error(
      'ERROR: .env file not found at ' + envPath,
    );
    console.error('Create it from .env.example first: cp .env.example .env');
    process.exit(1);
  }

  let envContent = fs.readFileSync(envPath, 'utf-8');

  // Update or add each resource ID
  envContent = updateEnvVariable(
    envContent,
    'HEDERA_DID_TOKEN_ID',
    result.didTokenId,
  );
  envContent = updateEnvVariable(
    envContent,
    'HEDERA_SOCIAL_GRAPH_TOPIC',
    result.socialGraphTopic,
  );
  envContent = updateEnvVariable(
    envContent,
    'HEDERA_KYC_ATTESTATION_TOPIC',
    result.kycAttestationTopic,
  );
  envContent = updateEnvVariable(
    envContent,
    'HEDERA_ANNOUNCEMENTS_TOPIC',
    result.announcementsTopic,
  );
  envContent = updateEnvVariable(
    envContent,
    'HEDERA_NOTIFICATION_TOPIC',
    result.notificationTopic,
  );
  envContent = updateEnvVariable(
    envContent,
    'NOTIFICATION_TOPIC_ID',
    result.notificationTopic,
  );

  fs.writeFileSync(envPath, envContent, 'utf-8');

  console.log('[OK] Updated .env with resource IDs');
  console.log(`  - HEDERA_DID_TOKEN_ID=${result.didTokenId}`);
  console.log(`  - HEDERA_SOCIAL_GRAPH_TOPIC=${result.socialGraphTopic}`);
  console.log(
    `  - HEDERA_KYC_ATTESTATION_TOPIC=${result.kycAttestationTopic}`,
  );
  console.log(`  - HEDERA_ANNOUNCEMENTS_TOPIC=${result.announcementsTopic}`);
  console.log(`  - HEDERA_NOTIFICATION_TOPIC=${result.notificationTopic}`);
  console.log(`  - NOTIFICATION_TOPIC_ID=${result.notificationTopic}`);
}

/**
 * Print a summary of created resources
 */
function printSummary(result: SetupResult): void {
  console.log('\n' + '='.repeat(60));
  console.log('HEDERA TESTNET SETUP COMPLETE');
  console.log('='.repeat(60));

  console.log('\nResources Created:');
  console.log(`   DID Token ID: ${result.didTokenId}`);
  console.log(`   Social Graph Topic: ${result.socialGraphTopic}`);
  console.log(`   KYC Attestation Topic: ${result.kycAttestationTopic}`);
  console.log(`   Announcements Topic: ${result.announcementsTopic}`);
  console.log(`   Notification Topic: ${result.notificationTopic}`);

  const hashScanBase =
    HEDERA_NETWORK === 'mainnet'
      ? 'https://hashscan.io'
      : `https://hashscan.io/?network=${HEDERA_NETWORK}`;

  console.log('\nView on HashScan (Hedera Block Explorer):');
  console.log(`   Token: ${hashScanBase}/token/${result.didTokenId}`);
  console.log(
    `   Topic 1: ${hashScanBase}/topic/${result.socialGraphTopic}`,
  );
  console.log(
    `   Topic 2: ${hashScanBase}/topic/${result.kycAttestationTopic}`,
  );
  console.log(
    `   Topic 3: ${hashScanBase}/topic/${result.announcementsTopic}`,
  );
  console.log(
    `   Topic 4: ${hashScanBase}/topic/${result.notificationTopic}`,
  );

  console.log('\nNext Steps:');
  console.log('   1. The .env file has been updated with resource IDs');
  console.log('   2. Restart your backend: pnpm start:dev');
  console.log('   3. Start the frontend: pnpm dev:web');
  console.log('   4. Create a user account and complete onboarding');
  console.log(
    '   5. Your DID NFT will be minted to your Hedera account',
  );

  console.log('\nTips:');
  console.log('   - All resources were created on Hedera testnet');
  console.log('   - Testnet HBAR is free but has limits');
  console.log(
    '   - For production, run this script again with mainnet credentials',
  );
  console.log(
    '   - The DID token supply can grow up to 1,000,000 users',
  );

  console.log('\n' + '='.repeat(60));
}

/**
 * Extract error message from an unknown error value
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  console.log('\n' + '='.repeat(60));
  console.log('HEDERA SOCIAL PLATFORM -- TESTNET SETUP');
  console.log('='.repeat(60));

  console.log(`\nNetwork: ${HEDERA_NETWORK}`);
  console.log(`Operator: ${HEDERA_OPERATOR_ID}`);

  try {
    const client = initializeClient();

    // Create all platform-level resources
    const didTokenId = await createDidToken(client);
    const socialGraphTopic = await createSocialGraphTopic(client);
    const kycAttestationTopic = await createKycAttestationTopic(client);
    const announcementsTopic = await createAnnouncementsTopic(client);
    const notificationTopic = await createNotificationTopic(client);

    // Prepare results
    const result: SetupResult = {
      didTokenId,
      socialGraphTopic,
      kycAttestationTopic,
      announcementsTopic,
      notificationTopic,
      setupTime: new Date().toISOString(),
    };

    // Update .env file
    updateEnvFile(result);

    // Print summary
    printSummary(result);

    // Save setup log
    const logPath = path.resolve(__dirname, '../setup-result.json');
    fs.writeFileSync(logPath, JSON.stringify(result, null, 2));
    console.log(`\nSetup result saved to: ${logPath}`);

    // Cleanup
    client.close();

    process.exit(0);
  } catch (error: unknown) {
    const message = getErrorMessage(error);
    console.error('\nSetup failed:', message);
    console.error('\nTroubleshooting:');

    if (message.includes('INSUFFICIENT_PAYER_BALANCE')) {
      console.error(
        '   - Your testnet account has insufficient HBAR balance',
      );
      console.error(
        '   - Get more HBAR at: https://portal.hedera.com',
      );
      console.error(
        '   - Each resource creation costs ~0.01 HBAR',
      );
    } else if (message.includes('INVALID_ACCOUNT_ID')) {
      console.error('   - HEDERA_OPERATOR_ID is invalid');
      console.error(
        '   - Format should be: 0.0.XXXXX',
      );
      console.error(
        '   - Get a testnet account at: https://portal.hedera.com',
      );
    } else if (message.includes('INVALID_SIGNATURE')) {
      console.error('   - HEDERA_OPERATOR_KEY is invalid');
      console.error(
        '   - Use the DER-encoded private key from portal.hedera.com',
      );
      console.error(
        '   - Key should start with 302e020100...',
      );
    } else {
      console.error(
        '   - Check your network connectivity',
      );
      console.error(
        '   - Verify HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY in .env',
      );
      console.error(
        '   - Ensure your account has sufficient HBAR balance',
      );
    }

    process.exit(1);
  }
}

// Run the script
main();
