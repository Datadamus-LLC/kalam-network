# P0-T06: Hedera Service — Core SDK Integration

| Field | Value |
|-------|-------|
| Task ID | P0-T06 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 5 hours |
| Depends On | P0-T04 (NestJS Backend) |
| Phase | 0 — Project Setup |
| Assignee | Backend developer (blockchain-experienced preferred) |

---

## Objective

Create complete, working implementations of the **HederaService** and **MirrorNodeService** with ALL methods fully implemented (not stubs). After this task, the backend can submit transactions to Hedera testnet and query the Mirror Node API.

This is the **MOST CRITICAL service** — every feature depends on it.

---

## Background

The Hedera Social Platform integrates with Hedera at two levels:

1. **HederaService** — Uses the @hashgraph/sdk to submit transactions (create topics, mint NFTs, transfer HBAR, etc.)
2. **MirrorNodeService** — Queries the REST API to read on-chain data (past messages, account info, etc.)

All business logic flows through these two services. If they're not implemented correctly, nothing works.

---

## Pre-requisites

- P0-T04 complete (NestJS structure exists with hedera.service.ts and mirror-node.service.ts stubs)
- Hedera testnet account with HBAR balance
  - Get one at: https://portal.hedera.com
  - You'll receive an Account ID (format: 0.0.XXXXX) and a private key
- .env file with HEDERA_NETWORK, HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY filled in
- @hashgraph/sdk v2.47.0+ installed (already in package.json from P0-T04)

---

## Step-by-Step Instructions

### Step 1: Update HederaService with complete implementation

Replace `packages/api/src/modules/hedera/hedera.service.ts` with:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  TokenMintTransaction,
  TokenFreezeAccountTransaction,
  TokenWipeTransaction,
  TransferTransaction,
  Hbar,
  AccountId,
  TopicId,
  TokenId,
  TokenSupplyType,
  TokenType,
} from '@hashgraph/sdk';
import { Logger } from '@nestjs/common';

@Injectable()
export class HederaService implements OnModuleInit, OnModuleDestroy {
  private client: Client;
  private operatorKey: PrivateKey;
  private operatorId: string;
  private readonly logger = new Logger(HederaService.name);

  constructor(private configService: ConfigService) {}

  /**
   * Initialize Hedera client on module startup
   */
  async onModuleInit() {
    try {
      this.initializeClient();
      this.logger.log('Hedera client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Hedera client:', error);
      throw error;
    }
  }

  /**
   * Close Hedera client on module shutdown
   */
  async onModuleDestroy() {
    if (this.client) {
      await this.client.close();
      this.logger.log('Hedera client closed');
    }
  }

  /**
   * Initialize the Hedera client
   */
  private initializeClient() {
    const network = this.configService.get<string>('hedera.network');
    const operatorIdStr = this.configService.get<string>('hedera.operatorId');
    const operatorKeyHex = this.configService.get<string>('hedera.operatorKey');

    if (!operatorIdStr || !operatorKeyHex) {
      throw new Error(
        'HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env',
      );
    }

    this.operatorId = operatorIdStr;

    // Initialize client for the correct network
    if (network === 'testnet') {
      this.client = Client.forTestnet();
    } else if (network === 'previewnet') {
      this.client = Client.forPreviewnet();
    } else if (network === 'mainnet') {
      this.client = Client.forMainnet();
    } else {
      throw new Error(`Unknown Hedera network: ${network}`);
    }

    // Set operator (platform account that signs all transactions)
    try {
      this.operatorKey = PrivateKey.fromStringDer(operatorKeyHex);
      this.client.setOperator(this.operatorId, this.operatorKey);
      this.logger.debug(`Operator set to ${this.operatorId}`);
    } catch (error) {
      this.logger.error('Invalid operator key format:', error);
      throw new Error('HEDERA_OPERATOR_KEY must be a valid DER-encoded private key');
    }
  }

  /**
   * Create a new Hedera Consensus Service (HCS) topic
   *
   * A topic is like a message queue on the blockchain. All messages posted to a topic
   * are ordered by the Hedera network and assigned a consensus timestamp.
   *
   * @param options Configuration for the topic
   * @returns Topic ID (e.g., "0.0.99999")
   */
  async createTopic(options: {
    submitKey?: string; // Public key that can submit messages
    adminKey?: string; // Public key that can update/delete the topic
    memo?: string; // Human-readable description
  }): Promise<string> {
    try {
      let transaction = new TopicCreateTransaction()
        .setMemo(options.memo || 'Hedera Social Platform Topic');

      // If a submit key is provided, only messages signed with this key are accepted
      if (options.submitKey) {
        try {
          const submitKey = PrivateKey.fromStringDer(options.submitKey);
          transaction = transaction.setSubmitKey(submitKey.publicKey);
        } catch (error) {
          this.logger.warn('Invalid submit key provided, skipping submitKey');
        }
      }

      // If an admin key is provided, only this key can update/delete the topic
      if (options.adminKey) {
        try {
          const adminKey = PrivateKey.fromStringDer(options.adminKey);
          transaction = transaction.setAdminKey(adminKey.publicKey);
        } catch (error) {
          this.logger.warn('Invalid admin key provided, skipping adminKey');
        }
      }

      // Freeze transaction with current client state and submit
      transaction = transaction.freezeWith(this.client);

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      const topicId = receipt.topicId.toString();
      this.logger.log(`Created HCS topic: ${topicId}`);
      return topicId;
    } catch (error) {
      this.logger.error('Failed to create topic:', error);
      throw new Error(`Topic creation failed: ${error.message}`);
    }
  }

  /**
   * Submit a message to an HCS topic
   *
   * Messages are encrypted by the client before being submitted. The Hedera network
   * assigns a consensus timestamp and sequence number, making the message permanent.
   *
   * @param topicId Topic to submit to (e.g., "0.0.99999")
   * @param message The message payload (encrypted by client)
   * @returns Sequence number of the message in the topic
   */
  async submitMessage(topicId: string, message: Buffer): Promise<string> {
    try {
      // Validate topic ID format
      if (!topicId || !topicId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid topic ID format: ${topicId}`);
      }

      // Validate message size (HCS has a ~6KB limit per message)
      if (message.length > 6000) {
        throw new Error(
          `Message too large (${message.length} bytes, max 6000)`,
        );
      }

      const transaction = new TopicMessageSubmitTransaction()
        .setTopicId(topicId)
        .setMessage(message)
        .freezeWith(this.client);

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      const sequenceNumber = receipt.topicSequenceNumber.toString();
      this.logger.debug(
        `Message submitted to topic ${topicId}, sequence: ${sequenceNumber}`,
      );
      return sequenceNumber;
    } catch (error) {
      this.logger.error('Failed to submit message:', error);
      throw new Error(`Message submission failed: ${error.message}`);
    }
  }

  /**
   * Update an HCS topic
   *
   * Can change the submitKey and adminKey of a topic, making it more restrictive or permissive.
   * Only the current adminKey can perform this operation.
   *
   * @param topicId Topic to update
   * @param options Fields to update
   */
  async updateTopic(
    topicId: string,
    options: {
      submitKey?: string;
      adminKey?: string;
      memo?: string;
    },
  ): Promise<void> {
    try {
      if (!topicId || !topicId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid topic ID format: ${topicId}`);
      }

      let transaction = new TopicUpdateTransaction().setTopicId(topicId);

      if (options.memo) {
        transaction = transaction.setMemo(options.memo);
      }

      if (options.submitKey) {
        try {
          const submitKey = PrivateKey.fromStringDer(options.submitKey);
          transaction = transaction.setSubmitKey(submitKey.publicKey);
        } catch (error) {
          this.logger.warn('Invalid submit key, skipping submitKey update');
        }
      }

      if (options.adminKey) {
        try {
          const adminKey = PrivateKey.fromStringDer(options.adminKey);
          transaction = transaction.setAdminKey(adminKey.publicKey);
        } catch (error) {
          this.logger.warn('Invalid admin key, skipping adminKey update');
        }
      }

      transaction = transaction.freezeWith(this.client);
      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);

      this.logger.log(`Updated HCS topic: ${topicId}`);
    } catch (error) {
      this.logger.error('Failed to update topic:', error);
      throw new Error(`Topic update failed: ${error.message}`);
    }
  }

  /**
   * Mint a DID NFT to a user's account
   *
   * A Decentralized Identifier (DID) NFT represents a user's verified identity on-chain.
   * The metadata CID points to an IPFS document with the user's profile data.
   *
   * @param tokenId Token ID of the DID NFT collection
   * @param metadataCid IPFS CID of the NFT metadata JSON
   * @param recipientAccountId Account to mint the NFT to
   * @returns Serial number of the minted NFT and transaction ID
   */
  async mintDIDNft(
    tokenId: string,
    metadataCid: string,
    recipientAccountId: string,
  ): Promise<{ serial: number; transactionId: string }> {
    try {
      if (!tokenId || !tokenId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid token ID format: ${tokenId}`);
      }

      if (!metadataCid || metadataCid.length < 5) {
        throw new Error(`Invalid metadata CID: ${metadataCid}`);
      }

      if (!recipientAccountId || !recipientAccountId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid recipient account ID: ${recipientAccountId}`);
      }

      // Store the metadata CID in the NFT metadata
      const metadata = Buffer.from(
        JSON.stringify({
          type: 'DID_NFT',
          metadataCid,
          mintedAt: new Date().toISOString(),
        }),
      );

      const transaction = new TokenMintTransaction()
        .setTokenId(tokenId)
        .addMetadata(metadata)
        .freezeWith(this.client);

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      const serial = receipt.serials[0].toNumber();
      const transactionId = response.transactionId.toString();

      this.logger.log(
        `Minted DID NFT to ${recipientAccountId}, serial: ${serial}, tx: ${transactionId}`,
      );

      return { serial, transactionId };
    } catch (error) {
      this.logger.error('Failed to mint DID NFT:', error);
      throw new Error(`NFT minting failed: ${error.message}`);
    }
  }

  /**
   * Freeze a token on an account (enforce soulbound NFTs)
   *
   * Once frozen, the account cannot transfer the NFT, making it non-transferable (soulbound).
   * Only the freeze key of the token can perform this operation.
   *
   * @param tokenId Token ID of the NFT
   * @param accountId Account to freeze the token on
   */
  async freezeToken(tokenId: string, accountId: string): Promise<void> {
    try {
      if (!tokenId || !tokenId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid token ID format: ${tokenId}`);
      }

      if (!accountId || !accountId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid account ID format: ${accountId}`);
      }

      const transaction = new TokenFreezeAccountTransaction()
        .setTokenId(tokenId)
        .setAccountId(accountId)
        .freezeWith(this.client);

      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);

      this.logger.log(`Froze token ${tokenId} on account ${accountId}`);
    } catch (error) {
      this.logger.error('Failed to freeze token:', error);
      throw new Error(`Token freeze failed: ${error.message}`);
    }
  }

  /**
   * Wipe (burn) an NFT from an account
   *
   * Used when a user updates their DID NFT (for a new avatar, bio, etc.).
   * The old NFT is burned and a new one is minted.
   *
   * @param tokenId Token ID of the NFT
   * @param accountId Account to wipe the token from
   * @param serial Serial number of the NFT to burn
   */
  async wipeNft(
    tokenId: string,
    accountId: string,
    serial: number,
  ): Promise<void> {
    try {
      if (!tokenId || !tokenId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid token ID format: ${tokenId}`);
      }

      if (!accountId || !accountId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid account ID format: ${accountId}`);
      }

      if (serial < 1) {
        throw new Error(`Invalid serial number: ${serial}`);
      }

      const transaction = new TokenWipeTransaction()
        .setTokenId(tokenId)
        .setAccountId(accountId)
        .addSerialNumber(serial)
        .freezeWith(this.client);

      const response = await transaction.execute(this.client);
      await response.getReceipt(this.client);

      this.logger.log(
        `Wiped NFT serial ${serial} from account ${accountId}`,
      );
    } catch (error) {
      this.logger.error('Failed to wipe NFT:', error);
      throw new Error(`NFT wipe failed: ${error.message}`);
    }
  }

  /**
   * Transfer HBAR between accounts
   *
   * HBAR is the native cryptocurrency of Hedera. It's used for paying transaction fees.
   *
   * @param fromAccountId Sender account
   * @param toAccountId Recipient account
   * @param amount Amount in HBAR (can be decimal, e.g., 0.5)
   * @returns Transaction ID
   */
  async transferHbar(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<string> {
    try {
      if (!fromAccountId || !fromAccountId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid from account ID: ${fromAccountId}`);
      }

      if (!toAccountId || !toAccountId.match(/^\d+\.\d+\.\d+$/)) {
        throw new Error(`Invalid to account ID: ${toAccountId}`);
      }

      if (amount <= 0) {
        throw new Error(`Amount must be positive: ${amount}`);
      }

      const transaction = new TransferTransaction()
        .addHbarTransfer(fromAccountId, new Hbar(-amount))
        .addHbarTransfer(toAccountId, new Hbar(amount))
        .freezeWith(this.client);

      const response = await transaction.execute(this.client);
      const receipt = await response.getReceipt(this.client);

      const transactionId = receipt.transactionId.toString();
      this.logger.log(
        `Transferred ${amount} HBAR from ${fromAccountId} to ${toAccountId}`,
      );

      return transactionId;
    } catch (error) {
      this.logger.error('Failed to transfer HBAR:', error);
      throw new Error(`HBAR transfer failed: ${error.message}`);
    }
  }

  /**
   * Get the current Hedera client
   */
  getClient(): Client {
    return this.client;
  }

  /**
   * Get the operator account ID
   */
  getOperatorId(): string {
    return this.operatorId;
  }

  /**
   * Get the operator public key
   */
  getOperatorPublicKey(): string {
    return this.operatorKey.publicKey.toStringRaw();
  }
}
```

### Step 2: Update MirrorNodeService with complete implementation

Replace `packages/api/src/modules/hedera/mirror-node.service.ts` with:

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';

/**
 * Mirror Node REST API client
 *
 * The Mirror Node is a read-only replica of the Hedera network data.
 * It provides REST APIs to query historical transactions, accounts, topics, etc.
 */
@Injectable()
export class MirrorNodeService {
  private baseUrl: string;
  private readonly logger = new Logger(MirrorNodeService.name);

  constructor(private configService: ConfigService) {
    this.initializeBaseUrl();
  }

  /**
   * Set the correct Mirror Node URL based on network
   */
  private initializeBaseUrl() {
    const network = this.configService.get<string>('hedera.network');

    switch (network) {
      case 'testnet':
        this.baseUrl = 'https://testnet.mirrornode.hedera.com/api/v1';
        break;
      case 'previewnet':
        this.baseUrl = 'https://previewnet.mirrornode.hedera.com/api/v1';
        break;
      case 'mainnet':
        this.baseUrl = 'https://mainnet-public.mirrornode.hedera.com/api/v1';
        break;
      default:
        this.baseUrl = 'https://testnet.mirrornode.hedera.com/api/v1';
    }

    this.logger.log(`Mirror Node base URL: ${this.baseUrl}`);
  }

  /**
   * Get messages from an HCS topic
   *
   * Returns all messages that have been submitted to the topic, in consensus order.
   * The response includes the message content, sender, sequence number, and consensus timestamp.
   *
   * @param topicId Topic ID (e.g., "0.0.99999")
   * @param options Query options (limit, filters, pagination)
   * @returns Array of message objects
   */
  async getTopicMessages(
    topicId: string,
    options?: {
      limit?: number;
      sequenceNumberLt?: number; // Messages before this sequence
      sequenceNumberGt?: number; // Messages after this sequence
    },
  ): Promise<Record<string, unknown>[]> {
    try {
      const params = new URLSearchParams();

      // Set limit (default 100, max 1000)
      if (options?.limit) {
        params.append('limit', Math.min(options.limit, 1000).toString());
      } else {
        params.append('limit', '100');
      }

      // Filter by sequence number range
      if (options?.sequenceNumberLt) {
        params.append('sequencenumber.lt', options.sequenceNumberLt.toString());
      }
      if (options?.sequenceNumberGt) {
        params.append('sequencenumber.gt', options.sequenceNumberGt.toString());
      }

      const url = `${this.baseUrl}/topics/${topicId}/messages?${params}`;
      this.logger.debug(`Fetching topic messages from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mirror Node API error ${response.status}: ${errorText}`,
        );
      }

      const data = await response.json();
      return data.messages || [];
    } catch (error) {
      this.logger.error('Failed to fetch topic messages:', error);
      throw new Error(
        `Failed to get topic messages for ${topicId}: ${error.message}`,
      );
    }
  }

  /**
   * Get information about a Hedera account
   *
   * Returns account details: balance, created date, public key, tokens held, etc.
   *
   * @param accountId Account ID (e.g., "0.0.12345")
   * @returns Account object with details
   */
  async getAccountInfo(accountId: string): Promise<Record<string, unknown>> {
    try {
      const url = `${this.baseUrl}/accounts/${accountId}`;
      this.logger.debug(`Fetching account info from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mirror Node API error ${response.status}: ${errorText}`,
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to fetch account info:', error);
      throw new Error(
        `Failed to get account info for ${accountId}: ${error.message}`,
      );
    }
  }

  /**
   * Get information about a specific NFT
   *
   * Returns details about an individual NFT: metadata, owner, serial number, etc.
   *
   * @param tokenId Token ID (e.g., "0.0.TOKEN")
   * @param serial Serial number of the NFT
   * @returns NFT object with metadata and details
   */
  async getNftInfo(tokenId: string, serial: number): Promise<Record<string, unknown>> {
    try {
      const url = `${this.baseUrl}/tokens/${tokenId}/nfts/${serial}`;
      this.logger.debug(`Fetching NFT info from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mirror Node API error ${response.status}: ${errorText}`,
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to fetch NFT info:', error);
      throw new Error(
        `Failed to get NFT info for ${tokenId}/${serial}: ${error.message}`,
      );
    }
  }

  /**
   * Get all NFTs held by an account
   *
   * @param accountId Account ID
   * @param options Query options (limit, pagination)
   * @returns Array of NFT objects
   */
  async getAccountNfts(
    accountId: string,
    options?: { limit?: number },
  ): Promise<Record<string, unknown>[]> {
    try {
      const params = new URLSearchParams();
      if (options?.limit) {
        params.append('limit', Math.min(options.limit, 1000).toString());
      }

      const url = `${this.baseUrl}/accounts/${accountId}/nfts?${params}`;
      this.logger.debug(`Fetching account NFTs from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mirror Node API error ${response.status}: ${errorText}`,
        );
      }

      const data = await response.json();
      return data.nfts || [];
    } catch (error) {
      this.logger.error('Failed to fetch account NFTs:', error);
      throw new Error(
        `Failed to get NFTs for ${accountId}: ${error.message}`,
      );
    }
  }

  /**
   * Get transaction information
   *
   * @param transactionId Transaction ID (e.g., "0.0.XXX@1710000000.123456789")
   * @returns Transaction object with details and status
   */
  async getTransaction(transactionId: string): Promise<Record<string, unknown>> {
    try {
      const url = `${this.baseUrl}/transactions/${transactionId}`;
      this.logger.debug(`Fetching transaction from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mirror Node API error ${response.status}: ${errorText}`,
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to fetch transaction:', error);
      throw new Error(
        `Failed to get transaction ${transactionId}: ${error.message}`,
      );
    }
  }

  /**
   * Get all transactions from an account (paginated)
   *
   * @param accountId Account ID
   * @param options Query options (limit, pagination)
   * @returns Array of transaction objects
   */
  async getAccountTransactions(
    accountId: string,
    options?: {
      limit?: number;
      transactionType?: string; // Filter by type
    },
  ): Promise<Record<string, unknown>[]> {
    try {
      const params = new URLSearchParams();

      if (options?.limit) {
        params.append('limit', Math.min(options.limit, 1000).toString());
      }

      if (options?.transactionType) {
        params.append('transactiontype', options.transactionType);
      }

      const url = `${this.baseUrl}/accounts/${accountId}/transactions?${params}`;
      this.logger.debug(`Fetching account transactions from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mirror Node API error ${response.status}: ${errorText}`,
        );
      }

      const data = await response.json();
      return data.transactions || [];
    } catch (error) {
      this.logger.error('Failed to fetch account transactions:', error);
      throw new Error(
        `Failed to get transactions for ${accountId}: ${error.message}`,
      );
    }
  }

  /**
   * Subscribe to topic messages using polling
   *
   * This is a simplified subscription that polls the Mirror Node at regular intervals.
   * For production, consider using WebSocket subscriptions instead.
   *
   * @param topicId Topic ID to subscribe to
   * @param onMessage Callback invoked when a new message is detected
   * @param pollIntervalMs Polling interval in milliseconds (default 5000)
   * @returns Function to unsubscribe (stop polling)
   */
  subscribeToTopic(
    topicId: string,
    onMessage: (message: Record<string, unknown>) => void,
    pollIntervalMs: number = 5000,
  ): () => void {
    let lastSequence = 0;
    let isActive = true;

    const poll = async () => {
      if (!isActive) return;

      try {
        const messages = await this.getTopicMessages(topicId, {
          limit: 100,
          sequenceNumberGt: lastSequence,
        });

        // Process messages in chronological order
        const sorted = messages.sort(
          (a, b) => a.sequence_number - b.sequence_number,
        );

        sorted.forEach((msg) => {
          if (msg.sequence_number > lastSequence) {
            lastSequence = msg.sequence_number;
            try {
              onMessage(msg);
            } catch (error) {
              this.logger.error('Error in message callback:', error);
            }
          }
        });
      } catch (error) {
        this.logger.warn(`Error polling topic ${topicId}:`, error.message);
      }

      // LEGITIMATE: Mirror Node polling loop with configurable interval
      if (isActive) {
        setTimeout(poll, pollIntervalMs);
      }
    };

    // Start polling
    poll();

    // Return unsubscribe function
    return () => {
      isActive = false;
    };
  }

  /**
   * Get topic information
   *
   * @param topicId Topic ID
   * @returns Topic object with message count, creation date, etc.
   */
  async getTopicInfo(topicId: string): Promise<Record<string, unknown>> {
    try {
      const url = `${this.baseUrl}/topics/${topicId}`;
      this.logger.debug(`Fetching topic info from: ${url}`);

      const response = await fetch(url);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Mirror Node API error ${response.status}: ${errorText}`,
        );
      }

      return await response.json();
    } catch (error) {
      this.logger.error('Failed to fetch topic info:', error);
      throw new Error(
        `Failed to get topic info for ${topicId}: ${error.message}`,
      );
    }
  }
}
```

### Step 3: Update hedera.module.ts to properly export services

Update `packages/api/src/modules/hedera/hedera.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { HederaService } from './hedera.service';
import { MirrorNodeService } from './mirror-node.service';

@Module({
  providers: [HederaService, MirrorNodeService],
  exports: [HederaService, MirrorNodeService],
})
export class HederaModule {}
```

### Step 4: Create an integration test

Create `packages/api/src/modules/hedera/hedera.service.integration.test.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import configuration from '../../config/configuration';
import { HederaService } from './hedera.service';
import { MirrorNodeService } from './mirror-node.service';

/**
 * Integration test for HederaService and MirrorNodeService
 *
 * IMPORTANT: This test actually submits a transaction to Hedera testnet.
 * It requires HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY to be set in .env.
 *
 * Run with: npm run test:integration
 * Or skip with: npm test (unit tests only)
 */
describe('HederaService Integration Test', () => {
  let hederaService: HederaService;
  let mirrorNodeService: MirrorNodeService;
  let module: TestingModule;

  beforeAll(async () => {
    // Skip test if operator credentials not configured
    if (!process.env.HEDERA_OPERATOR_ID || !process.env.HEDERA_OPERATOR_KEY) {
      // Test will be skipped - operator credentials not set
      return;
    }

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [configuration],
          envFilePath: '../../.env',
          isGlobal: true,
        }),
      ],
      providers: [HederaService, MirrorNodeService],
    }).compile();

    hederaService = module.get<HederaService>(HederaService);
    mirrorNodeService = module.get<MirrorNodeService>(MirrorNodeService);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  /**
   * Test 1: Create an HCS topic (permanent transaction on testnet)
   */
  it('should create an HCS topic', async () => {
    if (!hederaService) {
      return;
    }

    const topicId = await hederaService.createTopic({
      memo: 'Hedera Social Platform Integration Test Topic',
    });

    expect(topicId).toBeDefined();
    expect(topicId).toMatch(/^\d+\.\d+\.\d+$/);
  });

  /**
   * Test 2: Submit a message to a topic and retrieve it
   */
  it('should submit and retrieve a message', async () => {
    if (!hederaService || !mirrorNodeService) {
      return;
    }

    // Create a test topic
    const topicId = await hederaService.createTopic({
      memo: 'Test Topic for Message Submission',
    });

    // Submit a test message
    const testMessage = Buffer.from(
      JSON.stringify({
        text: 'Test message',
        timestamp: new Date().toISOString(),
      }),
    );

    const sequenceNumber = await hederaService.submitMessage(
      topicId,
      testMessage,
    );

    expect(sequenceNumber).toBeDefined();

    // LEGITIMATE: Mirror Node indexing delay — wait for eventual consistency of HCS message
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Retrieve the message from Mirror Node
    const messages = await mirrorNodeService.getTopicMessages(topicId, {
      limit: 10,
    });

    expect(messages.length).toBeGreaterThan(0);
    const retrievedMessage = messages.find(
      (m) => m.sequence_number === parseInt(sequenceNumber),
    );
    expect(retrievedMessage).toBeDefined();
  });

  /**
   * Test 3: Get account info
   */
  it('should retrieve account info from Mirror Node', async () => {
    if (!mirrorNodeService || !hederaService) {
      return;
    }

    const operatorId = hederaService.getOperatorId();
    const accountInfo = await mirrorNodeService.getAccountInfo(operatorId);

    expect(accountInfo).toBeDefined();
    expect(accountInfo.account).toBe(operatorId);
  });

  /**
   * Test 4: Verify operator public key
   */
  it('should retrieve correct operator public key', async () => {
    if (!hederaService) {
      return;
    }

    const publicKey = hederaService.getOperatorPublicKey();
    expect(publicKey).toBeDefined();
    expect(publicKey.length).toBeGreaterThan(0);
  });
});
```

### Step 5: Add test script to package.json

Update `packages/api/package.json` to add integration test script:

```json
{
  "scripts": {
    "test": "jest",
    "test:integration": "jest --testPathPattern=integration",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage"
  }
}
```

### Step 6: Create jest configuration

Create `packages/api/jest.config.js`:

```javascript
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  moduleNameMapper: {
    '@hedera-social/shared': '<rootDir>/../shared/src',
    '@hedera-social/shared/(.*)': '<rootDir>/../shared/src/$1',
  },
};
```

### Step 7: Verify the implementation builds

```bash
cd packages/api
pnpm build
```

Expected output: Build succeeds with no errors.

### Step 8: Run the integration test (optional but recommended)

If you have a Hedera testnet account with HBAR balance:

```bash
cd packages/api

# First, make sure .env has HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY
# cat ../../.env | grep HEDERA_OPERATOR

# Run the integration test
pnpm test:integration
```

Expected output:
```
PASS  src/modules/hedera/hedera.service.integration.test.ts (XX.XXXs)
  HederaService Integration Test
    ✓ should create an HCS topic (XXXms)
    ✓ should submit and retrieve a message (XXXX ms)
    ✓ should retrieve account info from Mirror Node (XXXms)
    ✓ should retrieve correct operator public key (XXms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
```

If HEDERA_OPERATOR_KEY is not set, the test will be skipped automatically.

---

## Verification Steps

Run each of these and confirm the expected output:

| # | Command | Expected |
|---|---------|----------|
| 1 | `grep -c "async.*(" packages/api/src/modules/hedera/hedera.service.ts` | 8+ (all methods are async) |
| 2 | `grep -c "async.*(" packages/api/src/modules/hedera/mirror-node.service.ts` | 8+ (all methods are async) |
| 3 | `grep "createTopic\|submitMessage\|updateTopic\|mintDIDNft\|freezeToken\|wipeNft\|transferHbar" packages/api/src/modules/hedera/hedera.service.ts` | All 7 methods exist |
| 4 | `grep "getTopicMessages\|getAccountInfo\|getNftInfo\|getAccountNfts\|getTransaction\|subscribeToTopic" packages/api/src/modules/hedera/mirror-node.service.ts` | All 6+ methods exist |
| 5 | `pnpm build` | Build succeeds with no TypeScript errors |
| 6 | `pnpm test:integration` (if HEDERA credentials set) | All 4 tests pass |
| 7 | `grep "export.*HederaService" packages/api/src/modules/hedera/hedera.module.ts` | HederaService exported |
| 8 | `grep "export.*MirrorNodeService" packages/api/src/modules/hedera/hedera.module.ts` | MirrorNodeService exported |
| 9 | `grep "@Injectable" packages/api/src/modules/hedera/*.service.ts` | 2 (@Injectable decorators) |
| 10 | `npm run start` (from packages/api) | Server starts, logs "Hedera client initialized successfully" |

---

## Definition of Done

- [ ] HederaService has complete implementation of 7 methods (createTopic, submitMessage, updateTopic, mintDIDNft, freezeToken, wipeNft, transferHbar)
- [ ] MirrorNodeService has complete implementation of 6+ methods (getTopicMessages, getAccountInfo, getNftInfo, getAccountNfts, getTransaction, subscribeToTopic)
- [ ] All methods have full error handling with try/catch
- [ ] All methods have logging at info/debug/error levels
- [ ] HederaService implements OnModuleInit and OnModuleDestroy
- [ ] HederaService initializes client on startup and closes on shutdown
- [ ] HederaService validates all input parameters before using them
- [ ] MirrorNodeService has proper URL construction for testnet/previewnet/mainnet
- [ ] Mirror Node API responses are handled and errors are thrown with descriptive messages
- [ ] Integration tests exist and pass (or skip gracefully if no credentials)
- [ ] Build succeeds: `pnpm build`
- [ ] All services are exported from hedera.module.ts
- [ ] Services can be injected into other modules via dependency injection
- [ ] Public key is correctly extracted from operator private key
- [ ] Topic ID, Account ID, Token ID, Serial Number validation is strict

---

## Troubleshooting

**Problem:** "Cannot set property client, set property client"
**Fix:** The client should be a private property. Make sure `private client: Client;` is typed correctly.

**Problem:** "Invalid operator key format"
**Fix:** The HEDERA_OPERATOR_KEY must be a DER-encoded hex string. Get it from https://portal.hedera.com when you create a testnet account. The format looks like `302e020100300506032b657004220420...`

**Problem:** "HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY must be set in .env"
**Fix:** These are required. Go to https://portal.hedera.com, create a testnet account, and copy the Account ID and Private Key to .env.

**Problem:** "Topic creation failed: INSUFFICIENT_PAYER_BALANCE"
**Fix:** Your testnet account has no HBAR. Go to https://portal.hedera.com and request more testnet HBAR.

**Problem:** "Mirror Node API error 404"
**Fix:** The topic/account/NFT doesn't exist yet, or Mirror Node hasn't indexed it yet. Wait a few seconds and try again.

**Problem:** "Integration test times out"
**Fix:** Mirror Node indexing can take 5-10 seconds. The test already waits 3 seconds, but on slow networks it may need more. Increase the timeout in the test.

**Problem:** "fetch is not defined"
**Fix:** Ensure Node.js v18+ is being used. Fetch is a global in Node.js v18+. Check: `node --version`

---

## Files Created in This Task

```
packages/api/src/modules/hedera/
├── hedera.service.ts                      (COMPLETE implementation, 7 methods)
├── mirror-node.service.ts                 (COMPLETE implementation, 6+ methods)
├── hedera.module.ts                       (exports both services)
└── hedera.service.integration.test.ts     (4 integration tests)

packages/api/
├── jest.config.js                         (Jest configuration)
└── package.json                           (updated with test:integration script)
```

---

## What Happens Next

After this task is complete:
- **P0-T07** (Next.js Frontend) — can start in parallel, will use API endpoints that depend on this service
- **P0-T08** (Testnet Setup) — runs a script that uses createTopic and mintDIDNft from this service to initialize platform resources
- **P1-T01 through P1-T06** (Phase 1 features) — all business logic will flow through these services

---

## Additional Notes

### Transaction Costs on Hedera Testnet

All transactions cost HBAR:
- Create topic: ~0.01 HBAR
- Submit message: ~0.0008 HBAR
- Mint NFT: ~0.05 HBAR
- Freeze token: ~0.001 HBAR
- Wipe NFT: ~0.001 HBAR
- Transfer HBAR: ~0.001 HBAR

Testnet HBAR is free but limited. Get more at: https://portal.hedera.com

### Mirror Node Indexing Latency

Messages submitted to HCS topics are indexed by Mirror Node within 3-10 seconds. If you query immediately after submitting, you might not see the message yet. Always add a small delay (2-5 seconds) in tests.

### Production Considerations

For production deployment:
1. Use mainnet instead of testnet (change HEDERA_NETWORK)
2. Store operator key in a secure vault (AWS Secrets Manager, HashiCorp Vault, etc.)
3. Monitor transaction costs and set up spending limits
4. For better real-time messaging, use WebSocket subscriptions instead of polling Mirror Node
5. Implement transaction batching to reduce fees
6. Add retry logic with exponential backoff for transient failures
