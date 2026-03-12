# Hedera SDK Integration Patterns

Reference guide for verified, real patterns for working with the Hedera SDK (@hashgraph/sdk). These patterns match the current SDK API as documented at https://docs.hedera.com/hedera/sdks-and-apis/sdks.

## Client Setup

Initialize the Hedera client for testnet with proper operator configuration:

```typescript
import { Client, AccountId, PrivateKey, Hbar } from '@hashgraph/sdk';

// Testnet setup
const client = Client.forTestnet();
client.setOperator(
  AccountId.fromString(process.env.HEDERA_OPERATOR_ID),
  PrivateKey.fromStringECDSA(process.env.HEDERA_OPERATOR_KEY), // or fromStringED25519
);

// Set transaction and query limits
client.setDefaultMaxTransactionFee(new Hbar(5));
client.setDefaultMaxQueryPayment(new Hbar(1));

// Close when done
await client.close();
```

Key points:
- The operator account must have sufficient HBAR balance for transactions
- Both ECDSA and ED25519 keys are supported via `fromStringECDSA()` and `fromStringED25519()`
- Fee limits protect against unexpectedly expensive operations
- Always call `client.close()` to clean up resources

---

## HCS — Hierarchical Custom State (Topics)

### Topic Creation

Create topics for different use cases. The platform uses two main topic types:

#### Public User Feed Topic
Anyone can read, only the user can submit messages:

```typescript
import { TopicCreateTransaction, TopicId } from '@hashgraph/sdk';

const tx = new TopicCreateTransaction()
  .setSubmitKey(userPublicKey)        // only this key can submit messages
  .setAdminKey(operatorPublicKey)     // optional: allows future updates/deletion
  .setTopicMemo('hedera-social:user-feed:user-0.0.12345');

const response = await tx.execute(client);
const receipt = await response.getReceipt(client);
const topicId = receipt.topicId;

// Topic is now ready to receive messages
```

#### Private Conversation Topic (Platform Operator Key)
For encrypted conversations between 2+ users. Use the platform operator key as submitKey, with access control enforced at the application layer (JWT + DB permissions):

```typescript
import {
  TopicCreateTransaction,
  TopicId,
} from '@hashgraph/sdk';

// Platform operator key controls who can submit — application layer enforces
// that only authenticated conversation members can send messages
const tx = new TopicCreateTransaction()
  .setSubmitKey(operatorPublicKey)    // platform signs on behalf of authenticated users
  .setAdminKey(null)                  // no admin key — topic is immutable
  .setTopicMemo('hedera-social:conversation:conv-0.0.12345');

const response = await tx.execute(client);
const receipt = await response.getReceipt(client);
const topicId = receipt.topicId;
```

#### Immutable Platform Topic
For permanent, non-deletable data (e.g., social graph events). No admin key means nobody can delete or modify it:

```typescript
const tx = new TopicCreateTransaction()
  .setSubmitKey(operatorPublicKey)
  .setAdminKey(null)                  // null = immutable, cannot be deleted
  .setTopicMemo('hedera-social:platform:events');

const response = await tx.execute(client);
const receipt = await response.getReceipt(client);
const platformTopicId = receipt.topicId;
```

### Submitting Messages to Topics

Submit encrypted or plaintext messages to a topic. The sequence number is critical for ordering:

```typescript
import { TopicMessageSubmitTransaction, Status } from '@hashgraph/sdk';

const payload = {
  type: 'message',
  from: senderAccountId,
  timestamp: Date.now(),
  encryptedContent: encryptedBytes,
};

const tx = new TopicMessageSubmitTransaction()
  .setTopicId(topicId)
  .setMessage(Buffer.from(JSON.stringify(payload)));

const response = await tx.execute(client);
const receipt = await response.getReceipt(client);

if (receipt.status !== Status.Success) {
  throw new Error(`Transaction failed: ${receipt.status}`);
}

const sequenceNumber = receipt.topicSequenceNumber;
console.log(`Message submitted with sequence number: ${sequenceNumber}`);
```

Key details:
- Messages are limited to approximately 1024 bytes when JSON-encoded
- For larger payloads, store on IPFS and submit the CID instead
- `topicSequenceNumber` is the immutable order identifier used for consensus
- Messages are immediately available on the Mirror Node

---

## HTS — Hedera Token Service (DID NFTs)

### Token Collection Setup (One-Time)

The platform creates a single NFT collection for all soulbound DID NFTs. This is done once at deployment:

```typescript
import {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
  TokenId,
  PublicKey,
} from '@hashgraph/sdk';

const tx = new TokenCreateTransaction()
  .setTokenName('Hedera Social DID')
  .setTokenSymbol('HSDID')
  .setTokenType(TokenType.NonFungibleUnique)
  .setSupplyType(TokenSupplyType.Infinite)      // can mint unlimited NFTs
  .setTreasuryAccountId(treasuryAccountId)     // where supply is held
  .setSupplyKey(operatorPublicKey)             // needed to mint new NFTs
  .setFreezeKey(operatorPublicKey)             // needed to freeze (soulbound)
  .setWipeKey(operatorPublicKey)               // needed to wipe (on profile update)
  .setTokenMemo('HIP-412 DID NFTs for Hedera Social');

const response = await tx.execute(client);
const receipt = await response.getReceipt(client);
const didTokenId = receipt.tokenId;

console.log(`DID NFT collection created: ${didTokenId}`);
```

This token ID is used for all subsequent minting operations.

### Minting DID NFTs

Create a new DID NFT for a user. The metadata points to an IPFS CID containing the HIP-412 JSON:

```typescript
import { TokenMintTransaction, BigNumber } from '@hashgraph/sdk';

// Example HIP-412 metadata structure:
const metadata = {
  name: `DID:hedera:${accountId}`,
  description: 'Soulbound DID NFT for Hedera Social',
  image: 'ipfs://QmImageCID...',
  did: {
    account: accountId,
    publicKey: userPublicKeyHex,
    createdAt: new Date().toISOString(),
  },
};

// Store metadata on IPFS, get the CID
const ipfsCid = await pinataService.pinJSON(metadata);
const metadataBytes = Buffer.from(ipfsCid);

const tx = new TokenMintTransaction()
  .setTokenId(didTokenId)
  .addMetadata(metadataBytes);

// Must be signed by the supply key
const signedTx = await tx.freezeWith(client).sign(supplyKey);
const response = await signedTx.execute(client);
const receipt = await response.getReceipt(client);

const serialNumber = receipt.serials[0]; // BigNumber: unique within token
console.log(`NFT minted with serial number: ${serialNumber}`);
```

After minting, the NFT must be transferred to the user and then frozen.

### Transferring NFTs

Transfer the newly minted NFT from treasury to the user's account:

```typescript
import { TransferTransaction } from '@hashgraph/sdk';

const tx = new TransferTransaction()
  .addNftTransfer(didTokenId, serialNumber, treasuryAccountId, userAccountId);

const response = await tx.execute(client);
await response.getReceipt(client);

console.log(`NFT transferred to user: ${userAccountId}`);
```

### Freezing Tokens (Soulbound)

After transferring the NFT to the user, freeze it so they cannot transfer it away:

```typescript
import { TokenFreezeAccountTransaction } from '@hashgraph/sdk';

const tx = new TokenFreezeAccountTransaction()
  .setTokenId(didTokenId)
  .setAccountId(userAccountId);

const response = await tx.execute(client);
await response.getReceipt(client);

console.log(`NFT frozen (soulbound) on account: ${userAccountId}`);
```

Once frozen, the user can never transfer or trade the NFT.

### Updating Profile (Wipe and Re-Mint)

When a user updates their profile metadata, wipe the old NFT and mint a new one:

```typescript
import { TokenWipeAccountTransaction } from '@hashgraph/sdk';

// Step 1: Unfreeze the old NFT
const unfreezeKey = PrivateKey.fromString(freezeKey);
const unfreezeTx = new TokenUnfreezeAccountTransaction()
  .setTokenId(didTokenId)
  .setAccountId(userAccountId);
const unfreezeResponse = await unfreezeTx.execute(client);
await unfreezeResponse.getReceipt(client);

// Step 2: Wipe the old NFT
const wipeTx = new TokenWipeAccountTransaction()
  .setTokenId(didTokenId)
  .setAccountId(userAccountId)
  .addSerial(oldSerialNumber);
const wipeResponse = await wipeTx.execute(client);
await wipeResponse.getReceipt(client);

// Step 3: Mint new NFT with updated metadata
const newIpfsCid = await pinataService.pinJSON(updatedMetadata);
const mintTx = new TokenMintTransaction()
  .setTokenId(didTokenId)
  .addMetadata(Buffer.from(newIpfsCid));
const mintSigned = await mintTx.freezeWith(client).sign(supplyKey);
const mintResponse = await mintSigned.execute(client);
const mintReceipt = await mintResponse.getReceipt(client);
const newSerialNumber = mintReceipt.serials[0];

// Step 4: Transfer new NFT to user
const transferTx = new TransferTransaction()
  .addNftTransfer(didTokenId, newSerialNumber, treasuryAccountId, userAccountId);
await transferTx.execute(client);

// Step 5: Re-freeze
const freezeTx = new TokenFreezeAccountTransaction()
  .setTokenId(didTokenId)
  .setAccountId(userAccountId);
await freezeTx.execute(client);

console.log(`Profile updated: new NFT serial ${newSerialNumber}`);
```

---

## HBAR Transfers

### Basic Transfer

Send HBAR from one account to another:

```typescript
import { TransferTransaction, Hbar } from '@hashgraph/sdk';

const tx = new TransferTransaction()
  .addHbarTransfer(senderAccountId, new Hbar(-10))    // sender loses 10 HBAR
  .addHbarTransfer(recipientAccountId, new Hbar(10)); // receiver gains 10 HBAR

const response = await tx.execute(client);
const receipt = await response.getReceipt(client);

console.log(`Transferred 10 HBAR from ${senderAccountId} to ${recipientAccountId}`);
```

### Auto-Account Creation Transfer

Create a new account on-the-fly by transferring HBAR to a non-existent account ID:

```typescript
import { AccountId } from '@hashgraph/sdk';

// Generate a new ED25519 keypair
const newKey = PrivateKey.generateED25519();
const newAccountId = newKey.publicKey.toAccountId(0, 0); // 0.0.X (auto-assigned)

const tx = new TransferTransaction()
  .addHbarTransfer(operatorAccountId, new Hbar(-1))
  .addHbarTransfer(newAccountId, new Hbar(1));

const response = await tx.execute(client);
const receipt = await response.getReceipt(client);

// The account is now created and has 1 HBAR
console.log(`New account created: ${newAccountId}`);
```

---

## Mirror Node REST API

The Mirror Node provides free access to historical data and real-time message streams without consuming your transaction fee budget.

### Base URL
```
Testnet: https://testnet.mirrornode.hedera.com
Mainnet: https://mainnet-public.mirrornode.hedera.com
```

### Query Topic Messages

Fetch messages from a topic in order (paginated):

```typescript
const topicId = '0.0.12345';
const limit = 100;
const order = 'asc'; // or 'desc'

const url = `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?limit=${limit}&order=${order}`;

const response = await fetch(url);
const data = await response.json();

// data.messages is an array of:
// {
//   consensus_timestamp: "1234567890.123456789",
//   sequence_number: 1,
//   topic_id: "0.0.12345",
//   message: "base64-encoded-payload",
//   running_hash: "...",
//   running_hash_version: 2,
// }

for (const msg of data.messages) {
  const payload = Buffer.from(msg.message, 'base64').toString('utf-8');
  console.log(`[${msg.sequence_number}] ${payload}`);
}
```

### Query Account Information

Get public key and balance for an account:

```typescript
const accountId = '0.0.12345';
const url = `https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}`;

const response = await fetch(url);
const data = await response.json();

// data contains:
// {
//   account: "0.0.12345",
//   key: {
//     _type: "ED25519",
//     key: "302a300506032b6570032100abc123..." (hex-encoded DER public key)
//   },
//   balance: { balance: 5000000000, timestamp: "..." }, // in tinybars
//   ...
// }

const publicKeyHex = data.key.key;
const balanceTinybar = data.balance.balance;
const balanceHbar = balanceTinybar / 100000000;

console.log(`Account: ${accountId}, Balance: ${balanceHbar} HBAR`);
```

### Query Token Information

Get details about an NFT token:

```typescript
const tokenId = '0.0.54321';
const url = `https://testnet.mirrornode.hedera.com/api/v1/tokens/${tokenId}`;

const response = await fetch(url);
const data = await response.json();

// Returns token metadata, supply, type, freeze status, etc.
console.log(`Token: ${data.name}, Supply: ${data.total_supply}`);
```

### Subscribe to Topic Messages (WebSocket)

Real-time message streaming via WebSocket:

```typescript
import WebSocket from 'ws';

const topicId = '0.0.12345';
const ws = new WebSocket(
  `wss://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages`
);

ws.on('open', () => {
  console.log('Connected to topic stream');
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  const payload = Buffer.from(msg.message, 'base64').toString('utf-8');
  console.log(`New message [${msg.sequence_number}]: ${payload}`);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err);
});
```

---

## Transaction Execution with Retry

Transactions can fail due to network congestion or temporary unavailability. Use exponential backoff:

```typescript
import { Transaction, Status, TransactionReceipt } from '@hashgraph/sdk';

async function executeWithRetry(
  transaction: Transaction,
  client: Client,
  maxRetries = 3,
): Promise<TransactionReceipt> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await transaction.execute(client);
      const receipt = await response.getReceipt(client);

      if (receipt.status === Status.Success) {
        return receipt;
      }

      throw new Error(
        `Transaction failed with status: ${receipt.status.toString()}`,
      );
    } catch (error) {
      if (attempt === maxRetries) {
        throw new Error(
          `Transaction failed after ${maxRetries} attempts: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Exponential backoff: 2s, 4s, 8s
      const delayMs = Math.pow(2, attempt) * 1000;
      console.log(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Unreachable');
}

// Usage
const tx = new TopicMessageSubmitTransaction()
  .setTopicId(topicId)
  .setMessage('Hello, Hedera!');

const receipt = await executeWithRetry(tx, client);
console.log(`Transaction successful: ${receipt.transactionId}`);
```

---

## Cost Reference Table

Approximate costs on Hedera testnet. Actual costs may vary based on network load.

| Operation | Approximate Cost | Notes |
|-----------|-----------------|-------|
| TopicCreate | ~$0.01 | Per conversation, per user feed |
| TopicMessageSubmit | ~$0.0008 | Per message, post, notification |
| TokenCreate | ~$1.00 | One-time setup for DID NFT collection |
| TokenMint | ~$0.05 | Per DID NFT minted |
| TokenFreeze | ~$0.001 | After each NFT transfer (soulbound) |
| TokenWipe | ~$0.001 | Before profile update re-mint |
| TokenUnfreeze | ~$0.001 | Before wipe (profile update) |
| CryptoTransfer (HBAR) | ~$0.001 | Account-to-account transfers |
| CryptoTransfer (NFT) | ~$0.001 | NFT transfers |
| Account Query | Free | Via Mirror Node |
| Topic Message Query | Free | Via Mirror Node |

**Budget planning**: A typical user registration costs ~$1.06 (TokenCreate + Mint + Freeze + Transfer), and ongoing messaging costs ~$0.0008 per message.

---

## Common Patterns

### Wait for Mirror Node to Index

After submitting a transaction, the Mirror Node takes a few seconds to index it:

```typescript
async function waitForMirrorNodeIndexing(
  topicId: string,
  expectedSequenceNumber: number,
  timeoutMs = 30000,
) {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const url = `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages?order=desc&limit=1`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.messages?.[0]?.sequence_number === expectedSequenceNumber) {
      return data.messages[0];
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error(`Mirror Node did not index message after ${timeoutMs}ms`);
}
```

### Generate New Keypair

```typescript
import { PrivateKey, AccountId } from '@hashgraph/sdk';

// ED25519 (recommended)
const privateKeyED25519 = PrivateKey.generateED25519();
const publicKeyED25519 = privateKeyED25519.publicKey;

// ECDSA
const privateKeyECDSA = PrivateKey.generateECDSA();
const publicKeyECDSA = privateKeyECDSA.publicKey;

// Export for storage
const privateKeyString = privateKeyED25519.toStringRaw(); // or toStringDer()
const publicKeyString = publicKeyED25519.toStringRaw();   // or toStringDer()
```

---

## Error Handling

```typescript
import {
  Status,
  PrecheckStatusError,
  ReceiptStatusError,
} from '@hashgraph/sdk';

try {
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);
} catch (error) {
  if (error instanceof PrecheckStatusError) {
    // Transaction failed validation before submission
    console.error(`Precheck failed: ${error.status}`);
  } else if (error instanceof ReceiptStatusError) {
    // Transaction submitted but execution failed
    console.error(`Receipt status error: ${error.status}`);
  } else {
    // Network or other error
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  }
}
```

---

## References

- Hedera SDK Documentation: https://docs.hedera.com/hedera/sdks-and-apis/sdks
- HIP-412 DID Standard: https://hips.hedera.com/hip/hip-412
- Mirror Node API: https://testnet.mirrornode.hedera.com/
- Token Service (HTS): https://docs.hedera.com/hedera/core-concepts/tokens
