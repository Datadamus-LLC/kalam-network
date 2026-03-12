---
paths:
  - "**/*hedera*"
  - "**/*hcs*"
  - "**/*hts*"
  - "**/*topic*"
  - "**/*token*"
  - "**/services/blockchain/**"
---

# Hedera Integration Rules

## SDK and Dependencies
- Use **@hashgraph/sdk** — this is the DOCUMENTED and VERIFIED Hedera SDK
- No alternative libraries or custom implementations
- Keep SDK version current but tested
- Version pinned in `package.json` for reproducibility

## Client Initialization

### Network Selection
Configuration-driven via environment variable:
```typescript
const network = process.env.HEDERA_NETWORK || 'testnet';

let client: Client;
if (network === 'mainnet') {
  client = Client.forMainnet();
} else if (network === 'testnet') {
  client = Client.forTestnet();
} else {
  throw new Error(`Unknown network: ${network}`);
}
```

- Development: `HEDERA_NETWORK=testnet`
- Staging: `HEDERA_NETWORK=testnet`
- Production: `HEDERA_NETWORK=mainnet`

### Operator Account
```typescript
const operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID);
const operatorKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY);

client.setOperator(operatorId, operatorKey);
```

- Environment variables validated at startup
- No hardcoded credentials
- Fail fast if credentials missing or invalid

## Transaction Configuration

### Required Fields
Every Hedera transaction must set:
```typescript
const transaction = new ContractExecuteTransaction()
  .setContractId(contractId)
  .setFunction('approve', params)
  .setMaxTransactionFee(new Hbar(10)) // Set reasonable max fee
  .setTransactionMemo(`App: approve token - User: ${userId}`); // For debugging

const txId = await transaction.execute(client);
```

- `maxTransactionFee`: prevents overspending on failed txs
- `transactionMemo`: includes app name + context for auditing
- All set before execution

### Transaction Execution
```typescript
try {
  const txId = await transaction.execute(client);
  this.logger.log(`Transaction submitted: ${txId}`);

  const receipt = await txId.getReceipt(client);
  return receipt;
} catch (error) {
  this.logger.error(`Transaction failed: ${error.message}`);
  throw new BlockchainError('TX_FAILED', error);
}
```

## Retry Logic

### Exponential Backoff on BUSY
When Hedera returns `BUSY` status:
```typescript
async executeWithRetry(
  transaction: Transaction,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<TransactionReceipt> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const txId = await transaction.execute(this.client);
      return await txId.getReceipt(this.client);
    } catch (error) {
      if (error.status === Status.Busy && attempt < maxRetries - 1) {
        const delay = baseDelay * Math.pow(2, attempt); // exponential
        this.logger.warn(`Busy, retrying in ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
```

- Retry max 3 times
- Delay: 1s, 2s, 4s (exponential backoff)
- Non-BUSY errors thrown immediately
- Log each retry attempt

## HCS (Hedera Consensus Service)

### Message Format
All HCS messages are JSON with required fields:
```typescript
interface HCSMessage {
  version: 1; // Protocol version for migrations
  timestamp: string; // ISO 8601 UTC
  // ... domain-specific fields
}
```

Example message:
```typescript
const message = {
  version: 1,
  timestamp: new Date().toISOString(),
  type: 'conversation_message',
  conversationId: 'conv-123',
  userId: 'user-456',
  content: 'Encrypted content here',
  encryptionMetadata: { iv: '...', tag: '...' },
};

const jsonMessage = JSON.stringify(message);
```

### Topic Creation

#### Public Topics (no keys)
```typescript
const tx = new ConsensusTopicCreateTransaction()
  .setAdminKey(null) // Public topic
  .setSubmitKey(null) // Anyone can submit
  .setMemo('Public discussion about feature X');

const txId = await tx.execute(client);
const receipt = await txId.getReceipt(client);
const topicId = receipt.topicId; // Save to database
```

#### Private Conversations (platform operator key)
```typescript
const operatorKey = PrivateKey.fromStringED25519(process.env.HEDERA_OPERATOR_KEY!);

const tx = new ConsensusTopicCreateTransaction()
  .setAdminKey(null) // Immutable topic
  .setSubmitKey(operatorKey.publicKey) // Platform operator key — access control at application layer (JWT + DB)
  .setMemo(`DM: ${userId1} <-> ${userId2}`);

const txId = await tx.execute(client);
const receipt = await txId.getReceipt(client);

// Store: userId's key in their encrypted storage, topic ID in database
```

- Public topics: open discussion, no restrictions
- Private DM topics: platform operator key as submitKey, access control enforced at application layer (JWT + DB membership)

### Message Submission
```typescript
const message = {
  version: 1,
  timestamp: new Date().toISOString(),
  content: encryptedContent, // Encrypted client-side
};

const tx = new ConsensusMessageSubmitTransaction()
  .setTopicId(topicId)
  .setMessage(JSON.stringify(message))
  .setMaxTransactionFee(new Hbar(0.50)); // Small fee for messages

const txId = await tx.execute(client);
this.logger.log(`HCS message submitted: ${txId}`);
```

## HTS (Hedera Token Service)

### Soulbound NFTs
Tokens that cannot be transferred (non-fungible, soulbound):
```typescript
const tx = new TokenCreateTransaction()
  .setTokenType(TokenType.NonFungibleUnique)
  .setTokenMemo('Soulbound NFT: Achievement Badge')
  .setName('Achievement Badge')
  .setSymbol('BADGE')
  .setDecimals(0)
  .setInitialSupply(0) // NFTs have no initial supply
  .setSupplyType(TokenSupplyType.Infinite)
  .setSupplyKey(supplyKey) // For minting
  .setFreezeKey(freezeKey) // For freezing accounts
  .setTreasuryAccountId(treasuryId);

const txId = await tx.execute(client);
const receipt = await txId.getReceipt(client);
const tokenId = receipt.tokenId;

// After minting, freeze the token to prevent transfers
const freezeTx = new TokenFreezeTransaction()
  .setTokenId(tokenId)
  .setAccountId(userAccountId);

await freezeTx.sign(freezeKey);
await freezeTx.execute(client);
```

- Soulbound: minted to user account, immediately frozen
- No transfer key: prevents transfers even if unfrozen
- Freezekey + frozen status = immobile tokens

## Mirror Node API

### REST Queries
Use Mirror Node REST API for reading (not consensus queries):
```typescript
const mirrorNodeUrl = process.env.HEDERA_MIRROR_NODE_URL;
// Example: 'https://testnet.mirrornode.hedera.com'

// Query HCS messages
const response = await fetch(
  `${mirrorNodeUrl}/api/v1/topics/${topicId}/messages?order=asc`
);
const data = await response.json();

const messages = data.messages.map(m => ({
  timestamp: m.consensus_timestamp,
  message: JSON.parse(m.message), // Parse JSON payload
}));
```

### Mirror Node Base URL
```typescript
const mirrorNodeUrl = process.env.HEDERA_MIRROR_NODE_URL ||
  'https://testnet.mirrornode.hedera.com';
```

- Testnet: `https://testnet.mirrornode.hedera.com`
- Mainnet: `https://mainnet-public.mirrornode.hedera.com`
- Validated at startup, no hardcoded URLs

### Polling for Consensus
```typescript
async pollForMessage(
  topicId: string,
  startTime: string,
  maxWaitMs: number = 30000
): Promise<HCSMessage> {
  const startAt = Date.now();

  while (Date.now() - startAt < maxWaitMs) {
    const response = await fetch(
      `${this.mirrorNodeUrl}/api/v1/topics/${topicId}/messages?` +
      `timestamp=gte:${startTime}&order=asc&limit=1`
    );
    const data = await response.json();

    if (data.messages.length > 0) {
      return JSON.parse(data.messages[0].message);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  throw new Error('Message consensus timeout');
}
```

- Poll mirror node for message confirmation
- Reasonable timeout (30s default)
- Retry interval: 1-2 seconds

## Logging and Auditability

### Transaction ID Logging
Every transaction must log its ID:
```typescript
const txId = await transaction.execute(client);
this.logger.log(
  `Hedera transaction submitted: ${txId} for user ${userId} operation ${operationType}`
);
```

- TransactionID: `AccountId(0.0.123456)@timestamp.nanoseconds`
- Used for auditability and debugging
- Stored in database alongside operation record

### Context Logging
```typescript
this.logger.log({
  event: 'hcs_message_submitted',
  topicId: topicId,
  transactionId: txId.toString(),
  userId: userId,
  messageLength: message.length,
  network: this.config.hederaNetwork,
});
```

## Cost Management

### Fee Estimation
Before batch operations, estimate costs:
```typescript
const estimatedFee = new Hbar(0.50); // Per transaction

async submitBatch(messages: Message[]): Promise<void> {
  const totalFee = estimatedFee.to(HbarUnit.Tinybar) * messages.length;
  const accountBalance = await this.getOperatorBalance();

  if (accountBalance < totalFee) {
    throw new InsufficientBalanceError(
      `Need ${totalFee} tinybar, have ${accountBalance}`
    );
  }

  // Proceed with batch
}
```

### Transaction Fee Limits
Set reasonable `maxTransactionFee` for each operation:
- Topic creation: 2-5 HBAR
- Message submission: 0.25-0.50 HBAR
- NFT minting: 1-2 HBAR
- Token operations: 0.50-1 HBAR

## ID Management

### No Hardcoding IDs
Never hardcode Hedera IDs in code:
```typescript
// Bad
const TREASURY_ID = AccountId.fromString('0.0.123456789');
const TOPIC_ID = TopicId.fromString('0.0.987654321');

// Good
const TREASURY_ID = AccountId.fromString(process.env.HEDERA_TREASURY_ID);
const TOPIC_ID = await this.getTopicIdFromDatabase(conversationId);
```

- Account IDs: from environment, database, or user input
- Topic IDs: from database after creation
- Token IDs: from database after creation
- Validate IDs on retrieval

### ID Storage
All Hedera IDs stored in database:
```typescript
@Entity()
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  hederaTopicId: string; // Store as string "0.0.123456789"

  @Column()
  createdAt: Date;
}
```

## Error Handling
```typescript
export class BlockchainError extends BaseException {
  constructor(code: string, message: string, public cause?: Error) {
    super(code, message, 503); // Service Unavailable
  }
}

// Usage
try {
  await transaction.execute(client);
} catch (error) {
  throw new BlockchainError(
    'TRANSACTION_FAILED',
    `Hedera transaction failed: ${error.message}`,
    error
  );
}
```

## Testing: REAL Testnet Only

**All Hedera tests run against the real Hedera Testnet. There are NO mocks.**

### Real Test Requirements
- Create real topics via `ConsensusTopicCreateTransaction`
- Submit real messages to topics via `ConsensusMessageSubmitTransaction`
- Mint real NFTs via `TokenCreateTransaction` and `TokenMintTransaction`
- Verify results via real Mirror Node REST API queries
- Set `testTimeout` to 30000ms (30 seconds) minimum for all Hedera tests
- Tests create real on-chain state and must clean up after themselves

### Test Structure
```typescript
describe('HCS Topics', () => {
  jest.setTimeout(30000); // Network operations need time

  let client: Client;
  let operatorId: AccountId;
  let operatorKey: PrivateKey;

  beforeAll(() => {
    // Use real testnet credentials from environment
    operatorId = AccountId.fromString(process.env.HEDERA_OPERATOR_ID!);
    operatorKey = PrivateKey.fromString(process.env.HEDERA_OPERATOR_KEY!);

    client = Client.forTestnet();
    client.setOperator(operatorId, operatorKey);
  });

  afterAll(() => {
    client.close();
  });

  it('should create a real topic and verify via mirror node', async () => {
    // Create real topic on testnet
    const createTx = new ConsensusTopicCreateTransaction()
      .setAdminKey(null)
      .setSubmitKey(null)
      .setMemo('Real integration test topic');

    const txId = await createTx.execute(client);
    const receipt = await txId.getReceipt(client);
    const topicId = receipt.topicId;

    expect(topicId).toBeDefined();

    // Submit real message to real topic
    const message = {
      version: 1,
      timestamp: new Date().toISOString(),
      content: 'Integration test message',
    };

    const submitTx = new ConsensusMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(JSON.stringify(message));

    const msgTxId = await submitTx.execute(client);
    await msgTxId.getReceipt(client);

    // Verify message appears on real Mirror Node
    const mirrorNodeUrl = process.env.HEDERA_MIRROR_NODE_URL ||
      'https://testnet.mirrornode.hedera.com';

    let messageFound = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await fetch(
        `${mirrorNodeUrl}/api/v1/topics/${topicId}/messages?order=asc`
      );
      const data = await response.json();

      if (data.messages.length > 0) {
        const parsedMsg = JSON.parse(
          Buffer.from(data.messages[0].message, 'base64').toString()
        );
        expect(parsedMsg.content).toBe('Integration test message');
        messageFound = true;
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    expect(messageFound).toBe(true);
  });

  it('should mint real NFTs and verify ownership', async () => {
    // Create real NFT token on testnet
    const tokenTx = new TokenCreateTransaction()
      .setTokenType(TokenType.NonFungibleUnique)
      .setTokenMemo('Real integration test NFT')
      .setName('TestBadge')
      .setSymbol('TBADGE')
      .setDecimals(0)
      .setInitialSupply(0)
      .setSupplyType(TokenSupplyType.Infinite)
      .setSupplyKey(operatorKey)
      .setTreasuryAccountId(operatorId);

    const tokenTxId = await tokenTx.execute(client);
    const tokenReceipt = await tokenTxId.getReceipt(client);
    const tokenId = tokenReceipt.tokenId;

    expect(tokenId).toBeDefined();

    // Mint real NFT
    const metadata = Buffer.from(JSON.stringify({
      name: 'TestBadge',
      description: 'Integration test badge',
    }));

    const mintTx = new TokenMintTransaction()
      .setTokenId(tokenId)
      .addMetadata(metadata);

    const mintTxId = await mintTx.execute(client);
    await mintTxId.getReceipt(client);

    // Verify token exists on real Mirror Node
    const mirrorNodeUrl = process.env.HEDERA_MIRROR_NODE_URL ||
      'https://testnet.mirrornode.hedera.com';

    const response = await fetch(
      `${mirrorNodeUrl}/api/v1/tokens/${tokenId}`
    );
    const tokenData = await response.json();

    expect(tokenData.token_id).toBe(tokenId.toString());
  });
});
```

### Environment Setup for Tests
Tests require real testnet credentials in `.env.test`:
```bash
HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ID=0.0.xxxxx
HEDERA_OPERATOR_KEY=302e0201...
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com
```

### Cleanup
After each test that creates on-chain resources:
- Delete topics if possible (not supported by SDK, but record in database for manual cleanup)
- Document created IDs for reference
- Keep resources for a week, then clean up in batch
- Never leave unused test accounts with positive balances

### CI/CD Integration
- Test accounts must be pre-created with sufficient HBAR balance
- Run tests in serial (not parallel) to avoid account balance issues
- Tests are integration tests, not unit tests — they are slow but verify real behavior
- Expect 5-10 minute test suites due to network latency and consensus time
