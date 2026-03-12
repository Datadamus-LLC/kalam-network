import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Client,
  PrivateKey,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  TokenMintTransaction,
  TokenFreezeTransaction,
  TokenWipeTransaction,
  TransferTransaction,
  Hbar,
} from '@hashgraph/sdk';

@Injectable()
export class HederaService implements OnModuleDestroy {
  private readonly logger = new Logger(HederaService.name);
  private client: Client | undefined;
  private operatorKey: PrivateKey | undefined;

  constructor(private readonly configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient(): void {
    const network = this.configService.get<string>('hedera.network');
    const operatorId = this.configService.get<string>('hedera.operatorId');
    const operatorKeyHex = this.configService.get<string>('hedera.operatorKey');

    if (!operatorId || !operatorKeyHex) {
      this.logger.warn(
        'Hedera operator credentials not configured. HederaService will not be functional until HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are set.',
      );
      return;
    }

    if (network === 'mainnet') {
      this.client = Client.forMainnet();
    } else {
      this.client = Client.forTestnet();
    }

    this.operatorKey = PrivateKey.fromStringDer(operatorKeyHex);
    this.client.setOperator(operatorId, this.operatorKey);
    this.logger.log(`Hedera client initialized for ${network} with operator ${operatorId}`);
  }

  private ensureClient(): Client {
    if (!this.client) {
      throw new Error(
        'Hedera client is not initialized. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY environment variables.',
      );
    }
    return this.client;
  }

  /**
   * Create a new HCS topic
   */
  async createTopic(options: {
    memo?: string;
  }): Promise<string> {
    const client = this.ensureClient();
    const transaction = new TopicCreateTransaction()
      .setTopicMemo(options.memo || 'Hedera Social Platform Topic')
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    const topicId = receipt.topicId;
    if (!topicId) {
      throw new Error('Topic creation succeeded but no topicId returned');
    }

    this.logger.log(`Created HCS topic: ${topicId.toString()}`);
    return topicId.toString();
  }

  /**
   * Submit a message to an HCS topic
   */
  async submitMessage(topicId: string, message: Buffer): Promise<string> {
    const client = this.ensureClient();
    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    const sequenceNumber = receipt.topicSequenceNumber;
    if (!sequenceNumber) {
      throw new Error('Message submission succeeded but no sequence number returned');
    }

    return sequenceNumber.toString();
  }

  /**
   * Update an HCS topic memo
   */
  async updateTopic(
    topicId: string,
    options: { memo?: string },
  ): Promise<void> {
    const client = this.ensureClient();
    const transaction = new TopicUpdateTransaction().setTopicId(topicId);

    if (options.memo) {
      transaction.setTopicMemo(options.memo);
    }

    transaction.freezeWith(client);
    const response = await transaction.execute(client);
    await response.getReceipt(client);
  }

  /**
   * Mint a DID NFT to a user's account
   */
  async mintDIDNft(
    tokenId: string,
    metadataCid: string,
  ): Promise<{ serial: number; transactionId: string }> {
    const client = this.ensureClient();
    const metadata = Buffer.from(
      JSON.stringify({ metadataCid, type: 'DID_NFT' }),
    );

    const transaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .addMetadata(metadata)
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    const serials = receipt.serials;
    if (!serials || serials.length === 0) {
      throw new Error('NFT mint succeeded but no serial number returned');
    }

    return {
      serial: serials[0].toNumber(),
      transactionId: response.transactionId.toString(),
    };
  }

  /**
   * Freeze a token on an account (for soulbound NFTs)
   */
  async freezeToken(tokenId: string, accountId: string): Promise<void> {
    const client = this.ensureClient();
    const transaction = new TokenFreezeTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId)
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);
  }

  /**
   * Wipe (burn) an NFT from an account
   */
  async wipeNft(
    tokenId: string,
    accountId: string,
    serial: number,
  ): Promise<void> {
    const client = this.ensureClient();
    const transaction = new TokenWipeTransaction()
      .setTokenId(tokenId)
      .setAccountId(accountId)
      .setSerials([serial])
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);
  }

  /**
   * Transfer HBAR between accounts
   */
  async transferHbar(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<string> {
    const client = this.ensureClient();
    const transaction = new TransferTransaction()
      .addHbarTransfer(fromAccountId, new Hbar(-amount))
      .addHbarTransfer(toAccountId, new Hbar(amount))
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);
    return response.transactionId.toString();
  }

  /**
   * Get the client instance (for advanced operations)
   */
  getClient(): Client {
    return this.ensureClient();
  }

  /**
   * Lifecycle hook: close client on module destruction
   */
  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      this.client.close();
      this.logger.log('Hedera client closed');
    }
  }
}
