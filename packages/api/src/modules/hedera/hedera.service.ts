import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  Client,
  PrivateKey,
  PublicKey,
  AccountId,
  TokenId,
  AccountCreateTransaction,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
  TopicUpdateTransaction,
  TokenMintTransaction,
  TokenFreezeTransaction,
  TokenWipeTransaction,
  TokenAssociateTransaction,
  TransferTransaction,
  Hbar,
} from "@hashgraph/sdk";
import {
  HederaClientNotInitializedException,
  HederaTopicCreationException,
  HederaMessageSubmissionException,
  HederaNftMintException,
  HederaAccountCreationException,
} from "./exceptions/hedera.exceptions";

@Injectable()
export class HederaService implements OnModuleDestroy {
  private readonly logger = new Logger(HederaService.name);
  private client: Client | undefined;
  private operatorKey: PrivateKey | undefined;

  constructor(private readonly configService: ConfigService) {
    this.initializeClient();
  }

  private initializeClient(): void {
    const network = this.configService.get<string>("hedera.network");
    const operatorId = this.configService.get<string>("hedera.operatorId");
    const operatorKeyHex = this.configService.get<string>("hedera.operatorKey");

    if (!operatorId || !operatorKeyHex) {
      this.logger.warn(
        "Hedera operator credentials not configured. HederaService will not be functional until HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY are set.",
      );
      return;
    }

    if (network === "mainnet") {
      this.client = Client.forMainnet();
    } else {
      this.client = Client.forTestnet();
    }

    this.operatorKey = PrivateKey.fromStringDer(operatorKeyHex);
    this.client.setOperator(operatorId, this.operatorKey);
    this.logger.log(
      `Hedera client initialized for ${network} with operator ${operatorId}`,
    );
  }

  /** Return the operator account ID (treasury for NFTs) */
  getOperatorId(): string {
    return this.configService.get<string>("hedera.operatorId") ?? "";
  }

  /**
   * Return the operator's ED25519 public key as a DER/hex string.
   * Used when creating org-owned Hedera accounts keyed to the platform operator.
   *
   * @throws HederaClientNotInitializedException if the operator key is not configured
   */
  getOperatorPublicKeyHex(): string {
    if (!this.operatorKey) {
      throw new HederaClientNotInitializedException(
        "Operator public key is not available: HEDERA_OPERATOR_KEY is not configured.",
      );
    }
    return this.operatorKey.publicKey.toStringDer();
  }

  private ensureClient(): Client {
    if (!this.client) {
      throw new HederaClientNotInitializedException(
        "Hedera client is not initialized. Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY environment variables.",
      );
    }
    return this.client;
  }

  /**
   * Create a new HCS topic
   */
  async createTopic(options: { memo?: string }): Promise<string> {
    const client = this.ensureClient();
    const transaction = new TopicCreateTransaction()
      .setTopicMemo(options.memo || "Hedera Social Platform Topic")
      .setMaxTransactionFee(new Hbar(5))
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    const topicId = receipt.topicId;
    if (!topicId) {
      throw new HederaTopicCreationException(
        "Topic creation succeeded but no topicId returned",
      );
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
      .setMaxTransactionFee(new Hbar(2))
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    const sequenceNumber = receipt.topicSequenceNumber;
    if (!sequenceNumber) {
      throw new HederaMessageSubmissionException(
        "Message submission succeeded but no sequence number returned",
      );
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
    const transaction = new TopicUpdateTransaction()
      .setTopicId(topicId)
      .setMaxTransactionFee(new Hbar(2));

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
      JSON.stringify({ metadataCid, type: "DID_NFT" }),
    );

    const transaction = new TokenMintTransaction()
      .setTokenId(tokenId)
      .addMetadata(metadata)
      .setMaxTransactionFee(new Hbar(5))
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    const serials = receipt.serials;
    if (!serials || serials.length === 0) {
      throw new HederaNftMintException(
        "NFT mint succeeded but no serial number returned",
      );
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
      .setMaxTransactionFee(new Hbar(2))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);
  }

  /**
   * Transfer an NFT from the operator (treasury) to a recipient account.
   * Used to assign DID NFTs to users after minting.
   */
  async transferNft(
    tokenId: string,
    serial: number,
    fromAccountId: string,
    toAccountId: string,
  ): Promise<void> {
    const client = this.ensureClient();
    const transaction = new TransferTransaction()
      .addNftTransfer(tokenId, serial, fromAccountId, toAccountId)
      .setMaxTransactionFee(new Hbar(2))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);
    this.logger.log(
      `NFT ${tokenId}#${serial} transferred from ${fromAccountId} to ${toAccountId}`,
    );
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
      .setMaxTransactionFee(new Hbar(2))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);
  }

  /**
   * Transfer HBAR between accounts using the operator key.
   *
   * Only works when the operator has signing authority on fromAccountId
   * (e.g. the operator's own account). For user-owned accounts whose keys
   * are held by MPC custody, use {@link buildTransferTransaction} +
   * {@link executeSignedTransaction} instead.
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
      .setMaxTransactionFee(new Hbar(2))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);
    return response.transactionId.toString();
  }

  /**
   * Build a frozen TransferTransaction and return its bytes for external signing.
   *
   * Used for MPC custody flow: the transaction bytes are sent to the custody
   * service for threshold signing, then the signed bytes are submitted via
   * {@link executeSignedTransaction}.
   */
  async buildTransferTransaction(
    fromAccountId: string,
    toAccountId: string,
    amount: number,
  ): Promise<{ transactionBytes: Buffer; transactionId: string }> {
    const client = this.ensureClient();
    const transaction = new TransferTransaction()
      .addHbarTransfer(fromAccountId, new Hbar(-amount))
      .addHbarTransfer(toAccountId, new Hbar(amount))
      .setMaxTransactionFee(new Hbar(2))
      .setTransactionMemo("Hedera Social Platform — Payment")
      .freezeWith(client);

    const transactionBytes = Buffer.from(transaction.toBytes());
    const transactionId = transaction.transactionId?.toString() ?? "unknown";

    this.logger.log(
      `Built transfer transaction: ${transactionId} (${amount} HBAR from ${fromAccountId} to ${toAccountId})`,
    );

    return { transactionBytes, transactionId };
  }

  /**
   * Execute a transaction that was signed externally (e.g. by MPC custody).
   *
   * Takes the original frozen transaction bytes and the external signature,
   * adds the signature to the transaction, and submits it to the network.
   */
  async executeSignedTransaction(
    transactionBytes: Buffer,
    signature: Buffer,
    signerPublicKey: string,
  ): Promise<string> {
    const client = this.ensureClient();
    const transaction = TransferTransaction.fromBytes(
      transactionBytes,
    ) as TransferTransaction;

    // Add the MPC custody signature
    const publicKey = PublicKey.fromString(signerPublicKey);
    transaction.addSignature(publicKey, signature);

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    const txId = response.transactionId.toString();
    this.logger.log(`Executed custody-signed transaction: ${txId}`);
    return txId;
  }

  /**
   * Execute a pre-signed transaction (e.g. from MPC custody sign-raw).
   *
   * Takes fully signed transaction bytes (from custody's sign-raw endpoint
   * with broadcast: false) and submits them to the Hedera network.
   *
   * @param signedBytes The fully signed transaction bytes
   * @returns The Hedera transaction ID
   */
  async executePreSignedTransaction(signedBytes: Buffer): Promise<string> {
    const client = this.ensureClient();
    const transaction = TransferTransaction.fromBytes(
      signedBytes,
    ) as TransferTransaction;

    const response = await transaction.execute(client);
    await response.getReceipt(client);

    const txId = response.transactionId.toString();
    this.logger.log(`Executed pre-signed custody transaction: ${txId}`);
    return txId;
  }

  /**
   * Create a new Hedera account funded by the operator.
   *
   * @param publicKeyHex The ED25519 public key (hex or DER) for the new account
   * @param initialBalance Initial HBAR balance to transfer to the new account
   * @returns The new Hedera account ID (e.g. "0.0.123456")
   */
  async createAccount(
    publicKeyHex: string,
    initialBalance: number = 10,
  ): Promise<string> {
    const client = this.ensureClient();

    const newAccountPublicKey = PublicKey.fromString(publicKeyHex);

    const transaction = new AccountCreateTransaction()
      .setKey(newAccountPublicKey)
      .setInitialBalance(new Hbar(initialBalance))
      .setMaxAutomaticTokenAssociations(10) // Allow up to 10 tokens (e.g. DID NFT, HTS tokens)
      .setMaxTransactionFee(new Hbar(5))
      .setTransactionMemo("Hedera Social Platform — New User Account")
      .freezeWith(client);

    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    const accountId = receipt.accountId;
    if (!accountId) {
      throw new HederaAccountCreationException(
        "Account creation succeeded but no accountId returned",
      );
    }

    this.logger.log(
      `Created Hedera account: ${accountId.toString()} with ${initialBalance} HBAR`,
    );
    return accountId.toString();
  }

  /**
   * Fund a Hedera account from the operator account.
   *
   * Used when the Tamam Custody vault auto-provisions a Hedera account
   * (with 0 balance) and we need to seed it with initial HBAR.
   *
   * @param accountId The Hedera account to fund
   * @param amount Amount of HBAR to transfer
   * @returns The transaction ID
   */
  async fundAccount(accountId: string, amount: number): Promise<string> {
    this.ensureClient();
    const operatorId = this.configService.get<string>("hedera.operatorId");
    if (!operatorId) {
      throw new HederaClientNotInitializedException(
        "Cannot fund account: HEDERA_OPERATOR_ID not configured",
      );
    }

    this.logger.log(
      `Funding account ${accountId} with ${amount} HBAR from operator ${operatorId}`,
    );

    return this.transferHbar(operatorId, accountId, amount);
  }

  /**
   * Associate an HTS token with an account using the operator key.
   * Only works when the operator IS the account being associated
   * (i.e. associating a token with the operator's own account).
   */
  async associateToken(accountId: string, tokenId: string): Promise<void> {
    const client = this.ensureClient();
    const transaction = new TokenAssociateTransaction()
      .setAccountId(AccountId.fromString(accountId))
      .setTokenIds([TokenId.fromString(tokenId)])
      .setMaxTransactionFee(new Hbar(2))
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);
    this.logger.log(`Associated token ${tokenId} with account ${accountId}`);
  }

  /**
   * Transfer HTS fungible tokens from the operator account to a recipient.
   * The operator must already be associated with the token.
   * Amount is in the token's smallest units (e.g. 5000 = 50 TMUSD at 2 decimals).
   */
  async transferHts(
    fromAccountId: string,
    toAccountId: string,
    tokenId: string,
    amount: number,
  ): Promise<string> {
    const client = this.ensureClient();
    const transaction = new TransferTransaction()
      .addTokenTransfer(tokenId, fromAccountId, -amount)
      .addTokenTransfer(tokenId, toAccountId, amount)
      .setMaxTransactionFee(new Hbar(2))
      .setTransactionMemo("Hedera Social Platform — TMUSD faucet")
      .freezeWith(client);

    const response = await transaction.execute(client);
    await response.getReceipt(client);
    const txId = response.transactionId.toString();
    this.logger.log(
      `Transferred ${amount} smallest units of ${tokenId} from ${fromAccountId} to ${toAccountId}: ${txId}`,
    );
    return txId;
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
      this.logger.log("Hedera client closed");
    }
  }
}
