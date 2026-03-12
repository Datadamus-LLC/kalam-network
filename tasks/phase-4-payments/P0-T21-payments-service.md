# Task P0-T21: Payments Service — Tamam Rails Integration

| Field | Value |
|-------|-------|
| Task ID | P0-T21 |
| Priority | Critical |
| Estimated Time | 5 hours |
| Depends On | P0-T06 (Hedera Service), P0-T14 (Conversations Service) |
| Phase | 4 — In-Chat Payments |
| Assignee | Junior Developer (Full Stack) |

---

## Objective

Build a complete backend payments service that enables in-chat payments via Tamam Payment Rails. This service will:
- Handle payment execution (Tamam Rails or mock HTS transfer)
- Store payment records in PostgreSQL
- Create encrypted HCS payment receipt/request messages in conversation topics
- Provide REST API endpoints for payment operations
- Support split payments and payment requests
- Integrate with WebSocket notifications

## Background

Hedera Social Platform needs to enable secure, fast in-chat payments using Tamam Payment Rails (with mock mode for hackathon testing). Payments are communicated through encrypted HCS messages posted to conversation topics, creating an immutable ledger of all payment activity.

**Key Concepts:**
- **Tamam Payment Rails**: Service for processing HTS token transfers and managing balances (API endpoint: `TAMAM_RAILS_URL` env var)
- **HCS Messages**: Payments are submitted as encrypted JSON payloads to the conversation topic, providing proof and auditability
- **Mock Mode**: When `TAMAM_RAILS_MOCK=true`, payments execute direct HTS CryptoTransfer via HederaService instead of calling Tamam API
- **Payment Types**: Send, Request, Split (each has unique HCS payload structure)
- **Encryption**: Payment details encrypted with conversation topic's public key before HCS submission

## Pre-requisites

Before starting this task, ensure:

1. **Backend Setup Complete**
   - NestJS project initialized (`src/` directory structure)
   - PostgreSQL database running and connected
   - `.env` file configured with Hedera testnet credentials
   - HederaService available (`src/services/hedera.service.ts`)
   - ConversationService available (`src/services/conversation.service.ts`)

2. **Dependencies Installed**
   ```bash
   npm install @hashgraph/sdk class-validator class-transformer typeorm
   npm install --save-dev @types/express @nestjs/common @nestjs/core
   ```

3. **Database Ready**
   - User table exists
   - Conversation and conversation_topic tables exist
   - `pnpm migration:run` has been executed

4. **Environment Variables Set**
   ```
   HEDERA_ACCOUNT_ID=0.0.xxxxx
   HEDERA_PRIVATE_KEY=302e...
   HEDERA_NETWORK=testnet
   TAMAM_RAILS_URL=https://api.tamam.io/v1
   TAMAM_RAILS_API_KEY=your_api_key
   TAMAM_RAILS_MOCK=true
   HTS_TOKEN_ID=0.0.xxxxx (test token)
   ```

5. **Related Services Completed**
   - HederaService with `executeHSTTransfer()` method
   - ConversationService with `getConversationTopic()` method
   - EncryptionService for HCS message encryption

## Step-by-Step Instructions

### Step 1: Create Payment DTOs

Create file: `src/payments/dto/send-payment.dto.ts`

```typescript
import { IsString, IsNumber, IsOptional, Min, Max, IsEnum, IsUUID } from 'class-validator';

export enum Currency {
  USD = 'USD',
  USDC = 'USDC',
  HBAR = 'HBAR'
}

export class SendPaymentDto {
  @IsString()
  recipientAccountId: string; // Hedera account ID like "0.0.12345"

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsUUID()
  topicId?: string; // If provided, payment is sent in this conversation
}

export class RequestPaymentDto {
  @IsString()
  requesterAccountId: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsOptional()
  @IsString()
  note?: string;

  @IsUUID()
  topicId: string; // Conversation where request is posted
}

export class PayRequestDto {
  @IsUUID()
  requestId: string;

  @IsUUID()
  topicId: string;
}

export class CreateSplitPaymentDto {
  @IsNumber()
  @Min(0.01)
  totalAmount: number;

  @IsEnum(Currency)
  currency: Currency;

  @IsEnum(['equal', 'custom'])
  splitMethod: 'equal' | 'custom';

  @IsString({ each: true })
  participants: string[]; // Hedera account IDs

  @IsOptional()
  @IsString()
  note?: string;

  @IsUUID()
  topicId: string;

  // If splitMethod is 'custom', provide custom amounts
  @IsOptional()
  customAmounts?: { [accountId: string]: number };
}

export class PaySplitShareDto {
  @IsUUID()
  splitId: string;

  @IsUUID()
  topicId: string;
}

export class GetBalanceDto {
  @IsString()
  accountId: string;
}

export class GetTransactionHistoryDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
```

### Step 2: Create Payment Entity

Create file: `src/payments/entities/payment.entity.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';
import { Currency } from '../dto/send-payment.dto';

@Entity('payments')
@Index(['senderAccountId'])
@Index(['recipientAccountId'])
@Index(['conversationTopicId'])
@Index(['status'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  senderAccountId: string; // Hedera account ID

  @Column({ nullable: true })
  recipientAccountId?: string; // null for requests waiting to be paid

  @Column('decimal', { precision: 20, scale: 2 })
  amount: number;

  @Column()
  currency: Currency;

  @Column({ nullable: true })
  note?: string;

  @Column()
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled';

  @Column({ nullable: true })
  tamamReference?: string; // Reference from Tamam API response

  @Column({ nullable: true })
  transactionHash?: string; // Hedera transaction hash

  @Column()
  paymentType: 'send' | 'request' | 'split'; // Type of payment

  @Column({ nullable: true })
  conversationTopicId?: string; // Topic ID where payment message was posted

  @Column({ nullable: true })
  hcsMessageId?: string; // Hedera HCS message ID (sequence number)

  @Column({ nullable: true })
  splitPaymentId?: string; // UUID if part of split payment

  @Column('json', { nullable: true })
  metadata?: Record<string, unknown>; // Store additional data like split breakdown

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Step 3: Create Split Payment Entity

Create file: `src/payments/entities/split-payment.entity.ts`

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

@Entity('split_payments')
@Index(['initiatorAccountId'])
@Index(['conversationTopicId'])
@Index(['status'])
export class SplitPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  initiatorAccountId: string;

  @Column('decimal', { precision: 20, scale: 2 })
  totalAmount: number;

  @Column()
  currency: string;

  @Column()
  splitMethod: 'equal' | 'custom';

  @Column('json')
  participants: string[]; // Array of Hedera account IDs

  @Column('json')
  shares: { [accountId: string]: { amount: number; status: 'pending' | 'paid'; txHash?: string } };

  @Column()
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';

  @Column({ nullable: true })
  note?: string;

  @Column()
  conversationTopicId: string;

  @Column({ nullable: true })
  hcsMessageId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

### Step 4: Create Tamam Rails Service

Create file: `src/payments/services/tamam-rails.service.ts`

```typescript
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { HederaService } from '../../services/hedera.service';
import axios from 'axios';

interface TamamTransferResponse {
  txHash: string;
  status: 'success' | 'pending' | 'failed';
  reference: string;
  timestamp: string;
}

interface TamamBalanceResponse {
  accountId: string;
  balance: number;
  currency: string;
  updated: string;
}

@Injectable()
export class TamamRailsService {
  private readonly logger = new Logger('TamamRailsService');
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly mockMode: boolean;

  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
    private hederaService: HederaService
  ) {
    this.baseUrl = this.configService.get<string>('TAMAM_RAILS_URL', 'https://api.tamam.io/v1');
    this.apiKey = this.configService.get<string>('TAMAM_RAILS_API_KEY', 'mock-key');
    this.mockMode = this.configService.get<string>('TAMAM_RAILS_MOCK', 'true') === 'true';
  }

  /**
   * Send payment through Tamam Rails or mock HTS transfer
   *
   * @param senderAccountId Hedera account (0.0.xxxxx)
   * @param recipientAccountId Hedera account (0.0.xxxxx)
   * @param amount Amount in decimal (50.00)
   * @param currency USD, USDC, or HBAR
   * @param tokenId HTS token ID (0.0.xxxxx)
   * @returns Transaction hash and Tamam reference
   */
  async sendPayment(
    senderAccountId: string,
    recipientAccountId: string,
    amount: number,
    currency: string,
    tokenId: string
  ): Promise<{ txHash: string; tamamRef: string }> {
    try {
      if (this.mockMode) {
        this.logger.log(`MOCK MODE: Processing payment ${senderAccountId} -> ${recipientAccountId} ${amount} ${currency}`);
        return this.mockSendPayment(senderAccountId, recipientAccountId, amount, currency, tokenId);
      }

      // Call real Tamam Rails API
      const response = await axios.post<TamamTransferResponse>(
        `${this.baseUrl}/transfers`,
        {
          from: senderAccountId,
          to: recipientAccountId,
          amount: amount.toString(),
          currency: currency,
          tokenId: tokenId,
          idempotencyKey: `${senderAccountId}-${recipientAccountId}-${Date.now()}`
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      this.logger.log(`Tamam transfer successful: ${response.data.reference}`);
      return {
        txHash: response.data.txHash,
        tamamRef: response.data.reference
      };
    } catch (error) {
      this.logger.error(`Tamam Rails payment failed: ${error.message}`);
      throw new HttpException(
        `Payment processing failed: ${error.response?.data?.message || error.message}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * Mock payment execution using direct HTS transfer
   */
  private async mockSendPayment(
    senderAccountId: string,
    recipientAccountId: string,
    amount: number,
    currency: string,
    tokenId: string
  ): Promise<{ txHash: string; tamamRef: string }> {
    try {
      // Use HederaService to execute actual HTS transfer on testnet
      const txHash = await this.hederaService.executeHSTTransfer(
        senderAccountId,
        recipientAccountId,
        tokenId,
        BigInt(Math.floor(amount * Math.pow(10, 6))) // Convert to smallest units
      );

      const tamamRef = `MOCK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      this.logger.log(`Mock payment completed: ${txHash}`);
      return {
        txHash,
        tamamRef
      };
    } catch (error) {
      this.logger.error(`Mock payment failed: ${error.message}`);
      throw new HttpException(
        `Mock payment failed: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Get account balance from Tamam Rails or Mirror Node
   */
  async getBalance(accountId: string, tokenId: string): Promise<number> {
    try {
      if (this.mockMode) {
        // Query balance from Mirror Node for mock mode
        return this.getBalanceFromMirrorNode(accountId, tokenId);
      }

      const response = await axios.get<TamamBalanceResponse>(
        `${this.baseUrl}/accounts/${accountId}/balance`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data.balance;
    } catch (error) {
      this.logger.error(`Failed to get balance: ${error.message}`);
      throw new HttpException(
        `Failed to retrieve balance`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  /**
   * Query balance from Hedera Mirror Node
   */
  private async getBalanceFromMirrorNode(accountId: string, tokenId: string): Promise<number> {
    try {
      const response = await axios.get(
        `https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}`,
        { timeout: 10000 }
      );

      const tokenBalance = response.data.tokens?.[0]?.balance || 0;
      const decimals = response.data.tokens?.[0]?.decimals || 6;

      return tokenBalance / Math.pow(10, decimals);
    } catch (error) {
      this.logger.warn(`Mirror Node balance query failed, returning 0: ${error.message}`);
      return 0;
    }
  }

  /**
   * Get transaction history (mock implementation)
   */
  async getTransactionHistory(
    accountId: string,
    cursor?: string,
    limit: number = 20
  ): Promise<{
    transactions: Array<{ hash: string; amount: number; counterparty: string; timestamp: string }>;
    nextCursor?: string;
  }> {
    try {
      // Query Mirror Node for account transactions
      const offset = cursor ? parseInt(cursor) : 0;
      const response = await axios.get(
        `https://testnet.mirrornode.hedera.com/api/v1/transactions?account.id=${accountId}&order=desc&limit=${limit}&offset=${offset}`,
        { timeout: 10000 }
      );

      const transactions = response.data.transactions.map(tx => ({
        hash: tx.transaction_hash,
        amount: 0, // Would parse from tx.charged_tx_fee
        counterparty: tx.entity_id || 'unknown',
        timestamp: new Date(tx.valid_start_timestamp * 1000).toISOString()
      }));

      return {
        transactions,
        nextCursor: offset + limit <= response.data.transactions.length ? (offset + limit).toString() : undefined
      };
    } catch (error) {
      this.logger.error(`Transaction history query failed: ${error.message}`);
      throw new HttpException(
        `Failed to retrieve transaction history`,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}
```

### Step 5: Create Payments Service

Create file: `src/payments/services/payment.service.ts`

```typescript
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from '../entities/payment.entity';
import { SplitPayment } from '../entities/split-payment.entity';
import { TamamRailsService } from './tamam-rails.service';
import { ConversationService } from '../../conversations/services/conversation.service';
import { EncryptionService } from '../../services/encryption.service';
import { HederaService } from '../../services/hedera.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

interface PaymentMessage {
  v: string;
  type: 'payment' | 'payment_request' | 'payment_split';
  sender: string;
  content: Record<string, unknown>;
  timestamp: number;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger('PaymentService');
  private htsTokenId: string;

  constructor(
    @InjectRepository(Payment) private paymentRepository: Repository<Payment>,
    @InjectRepository(SplitPayment) private splitPaymentRepository: Repository<SplitPayment>,
    private tamamRailsService: TamamRailsService,
    private conversationService: ConversationService,
    private encryptionService: EncryptionService,
    private hederaService: HederaService,
    private configService: ConfigService
  ) {
    this.htsTokenId = this.configService.get<string>('HTS_TOKEN_ID', '0.0.123456');
  }

  /**
   * Send money directly in chat
   * Steps:
   * 1. Validate sender is participant in conversation
   * 2. Execute payment via Tamam Rails (or mock)
   * 3. Create DM-PAY-001 HCS message
   * 4. Encrypt and submit to conversation topic
   * 5. Store payment record in DB
   * 6. Send WebSocket notification
   */
  async sendMoneyInChat(
    senderAccountId: string,
    conversationTopicId: string,
    recipientAccountId: string,
    amount: number,
    currency: string,
    note?: string
  ): Promise<Payment> {
    this.logger.log(`Processing payment: ${senderAccountId} -> ${recipientAccountId} ${amount} ${currency}`);

    try {
      // Step 1: Validate conversation and participants
      const conversation = await this.conversationService.getConversationByTopic(conversationTopicId);
      if (!conversation) {
        throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
      }

      const participants = conversation.participants.map(p => p.accountId);
      if (!participants.includes(senderAccountId) || !participants.includes(recipientAccountId)) {
        throw new HttpException('Sender and recipient must be conversation participants', HttpStatus.FORBIDDEN);
      }

      // Step 2: Execute payment
      let txHash: string;
      let tamamRef: string;

      try {
        const result = await this.tamamRailsService.sendPayment(
          senderAccountId,
          recipientAccountId,
          amount,
          currency,
          this.htsTokenId
        );
        txHash = result.txHash;
        tamamRef = result.tamamRef;
      } catch (paymentError) {
        // Store failed payment record
        const failedPayment = this.paymentRepository.create({
          senderAccountId,
          recipientAccountId,
          amount,
          currency,
          note,
          status: 'failed',
          paymentType: 'send',
          conversationTopicId
        });
        await this.paymentRepository.save(failedPayment);
        throw paymentError;
      }

      // Step 3: Create HCS message payload (DM-PAY-001)
      const paymentMessage: PaymentMessage = {
        v: '1.0',
        type: 'payment',
        sender: senderAccountId,
        timestamp: Date.now(),
        content: {
          action: 'send',
          amount,
          currency,
          tokenId: this.htsTokenId,
          recipient: recipientAccountId,
          note: note || '',
          txHash,
          status: 'confirmed',
          tamamRef
        }
      };

      // Step 4: Encrypt and submit to HCS
      const messageId = await this.submitPaymentToHCS(
        paymentMessage,
        conversationTopicId
      );

      // Step 5: Store payment record
      const payment = this.paymentRepository.create({
        senderAccountId,
        recipientAccountId,
        amount,
        currency,
        note,
        status: 'confirmed',
        transactionHash: txHash,
        tamamReference: tamamRef,
        paymentType: 'send',
        conversationTopicId,
        hcsMessageId: messageId
      });

      const savedPayment = await this.paymentRepository.save(payment);

      // Step 6: Send notification (delegated to NotificationService)
      this.logger.log(`Payment confirmed: ${txHash}`);

      return savedPayment;
    } catch (error) {
      this.logger.error(`Payment failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Request money from someone in chat
   */
  async requestMoney(
    requesterAccountId: string,
    conversationTopicId: string,
    amount: number,
    currency: string,
    note?: string
  ): Promise<Payment> {
    try {
      const conversation = await this.conversationService.getConversationByTopic(conversationTopicId);
      if (!conversation) {
        throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
      }

      const requestId = uuidv4();

      // Create payment request message (DM-PAY-002)
      const requestMessage: PaymentMessage = {
        v: '1.0',
        type: 'payment_request',
        sender: requesterAccountId,
        timestamp: Date.now(),
        content: {
          action: 'request',
          amount,
          currency,
          note: note || '',
          requestId,
          status: 'pending',
          paidTxHash: null
        }
      };

      const messageId = await this.submitPaymentToHCS(requestMessage, conversationTopicId);

      // Store request record
      const paymentRequest = this.paymentRepository.create({
        id: requestId,
        senderAccountId: requesterAccountId,
        amount,
        currency,
        note,
        status: 'pending',
        paymentType: 'request',
        conversationTopicId,
        hcsMessageId: messageId
      });

      return await this.paymentRepository.save(paymentRequest);
    } catch (error) {
      this.logger.error(`Payment request failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pay a pending request
   */
  async payRequest(
    payerAccountId: string,
    conversationTopicId: string,
    requestId: string
  ): Promise<Payment> {
    try {
      // Fetch the request
      const request = await this.paymentRepository.findOne({
        where: {
          id: requestId,
          paymentType: 'request',
          status: 'pending'
        }
      });

      if (!request) {
        throw new HttpException('Payment request not found or already paid', HttpStatus.NOT_FOUND);
      }

      // Execute payment
      const { txHash, tamamRef } = await this.tamamRailsService.sendPayment(
        payerAccountId,
        request.senderAccountId,
        request.amount,
        request.currency,
        this.htsTokenId
      );

      // Create confirmation message
      const confirmMessage: PaymentMessage = {
        v: '1.0',
        type: 'payment_request',
        sender: payerAccountId,
        timestamp: Date.now(),
        content: {
          action: 'request',
          amount: request.amount,
          currency: request.currency,
          note: request.note || '',
          requestId,
          status: 'paid',
          paidTxHash: txHash
        }
      };

      await this.submitPaymentToHCS(confirmMessage, conversationTopicId);

      // Update request status
      request.status = 'confirmed';
      request.recipientAccountId = payerAccountId;
      request.transactionHash = txHash;
      request.tamamReference = tamamRef;
      request.paymentType = 'send'; // Change type to send for tracking

      return await this.paymentRepository.save(request);
    } catch (error) {
      this.logger.error(`Failed to pay request: ${error.message}`);
      throw error;
    }
  }

  /**
   * Create split payment in group chat
   */
  async createSplitPayment(
    initiatorAccountId: string,
    conversationTopicId: string,
    totalAmount: number,
    currency: string,
    splitMethod: 'equal' | 'custom',
    participants: string[],
    customAmounts?: { [accountId: string]: number },
    note?: string
  ): Promise<SplitPayment> {
    try {
      const conversation = await this.conversationService.getConversationByTopic(conversationTopicId);
      if (!conversation) {
        throw new HttpException('Conversation not found', HttpStatus.NOT_FOUND);
      }

      const splitId = uuidv4();

      // Calculate shares
      const shares: { [accountId: string]: { amount: number; status: 'pending' | 'paid'; txHash?: string } } = {};

      if (splitMethod === 'equal') {
        const shareAmount = totalAmount / participants.length;
        participants.forEach(accountId => {
          shares[accountId] = { amount: shareAmount, status: 'pending' };
        });
      } else if (splitMethod === 'custom' && customAmounts) {
        participants.forEach(accountId => {
          shares[accountId] = {
            amount: customAmounts[accountId] || 0,
            status: 'pending'
          };
        });
      }

      // Create split message (DM-PAY-003)
      const splitMessage: PaymentMessage = {
        v: '1.0',
        type: 'payment_split',
        sender: initiatorAccountId,
        timestamp: Date.now(),
        content: {
          action: 'split',
          totalAmount,
          currency,
          note: note || '',
          splitId,
          splitMethod,
          participants: participants.reduce((acc, accountId) => {
            acc[accountId] = {
              amount: shares[accountId].amount,
              status: 'pending',
              txHash: null
            };
            return acc;
          }, {})
        }
      };

      const messageId = await this.submitPaymentToHCS(splitMessage, conversationTopicId);

      // Store split payment
      const splitPayment = this.splitPaymentRepository.create({
        id: splitId,
        initiatorAccountId,
        totalAmount,
        currency,
        splitMethod,
        participants,
        shares,
        status: 'pending',
        note,
        conversationTopicId,
        hcsMessageId: messageId
      });

      return await this.splitPaymentRepository.save(splitPayment);
    } catch (error) {
      this.logger.error(`Failed to create split payment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Pay individual share in split payment
   */
  async paySplitShare(
    payerAccountId: string,
    conversationTopicId: string,
    splitId: string
  ): Promise<SplitPayment> {
    try {
      const split = await this.splitPaymentRepository.findOne({
        where: {
          id: splitId,
          conversationTopicId
        }
      });

      if (!split) {
        throw new HttpException('Split payment not found', HttpStatus.NOT_FOUND);
      }

      if (!split.shares[payerAccountId]) {
        throw new HttpException('You are not a participant in this split', HttpStatus.FORBIDDEN);
      }

      const share = split.shares[payerAccountId];
      if (share.status === 'paid') {
        throw new HttpException('You have already paid your share', HttpStatus.BAD_REQUEST);
      }

      // Execute payment
      const { txHash } = await this.tamamRailsService.sendPayment(
        payerAccountId,
        split.initiatorAccountId,
        share.amount,
        split.currency,
        this.htsTokenId
      );

      // Update split status
      split.shares[payerAccountId] = {
        amount: share.amount,
        status: 'paid',
        txHash
      };

      // Check if all paid
      const allPaid = Object.values(split.shares).every(s => s.status === 'paid');
      if (allPaid) {
        split.status = 'completed';
      } else {
        split.status = 'in_progress';
      }

      // Create update message
      const updateMessage: PaymentMessage = {
        v: '1.0',
        type: 'payment_split',
        sender: payerAccountId,
        timestamp: Date.now(),
        content: {
          action: 'split',
          totalAmount: split.totalAmount,
          currency: split.currency,
          splitId,
          splitMethod: split.splitMethod,
          participants: split.shares
        }
      };

      await this.submitPaymentToHCS(updateMessage, conversationTopicId);

      return await this.splitPaymentRepository.save(split);
    } catch (error) {
      this.logger.error(`Failed to pay split share: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get account balance
   */
  async getBalance(accountId: string): Promise<number> {
    return this.tamamRailsService.getBalance(accountId, this.htsTokenId);
  }

  /**
   * Get transaction history
   */
  async getTransactionHistory(
    accountId: string,
    cursor?: string,
    limit: number = 20
  ): Promise<{
    transactions: Array<{ hash: string; amount: number; counterparty: string; timestamp: string }>;
    nextCursor?: string;
  }> {
    return this.tamamRailsService.getTransactionHistory(accountId, cursor, limit);
  }

  /**
   * Submit payment message to HCS topic
   */
  private async submitPaymentToHCS(
    message: PaymentMessage,
    conversationTopicId: string
  ): Promise<string> {
    try {
      // Get conversation topic for encryption
      const topic = await this.conversationService.getConversationTopic(conversationTopicId);
      if (!topic) {
        throw new HttpException('Conversation topic not found', HttpStatus.NOT_FOUND);
      }

      // Encrypt message with topic public key
      const encryptedMessage = await this.encryptionService.encrypt(
        JSON.stringify(message),
        topic.encryptionKey
      );

      // Submit to HCS
      const messageId = await this.hederaService.submitHCSMessage(
        conversationTopicId,
        encryptedMessage
      );

      return messageId;
    } catch (error) {
      this.logger.error(`Failed to submit payment to HCS: ${error.message}`);
      throw new HttpException('Failed to submit payment message', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
```

### Step 6: Create Payments Module

Create file: `src/payments/payments.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { Payment } from './entities/payment.entity';
import { SplitPayment } from './entities/split-payment.entity';
import { PaymentService } from './services/payment.service';
import { TamamRailsService } from './services/tamam-rails.service';
import { PaymentController } from './controllers/payment.controller';
import { HederaService } from '../services/hedera.service';
import { ConversationService } from '../conversations/services/conversation.service';
import { EncryptionService } from '../services/encryption.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, SplitPayment]),
    HttpModule,
    ConfigModule
  ],
  providers: [
    PaymentService,
    TamamRailsService,
    HederaService,
    ConversationService,
    EncryptionService
  ],
  controllers: [PaymentController],
  exports: [PaymentService, TamamRailsService]
})
export class PaymentsModule {}
```

### Step 7: Create Payments Controller

Create file: `src/payments/controllers/payment.controller.ts`

```typescript
import { Controller, Post, Get, Body, Param, Query, UseGuards, Request, HttpException, HttpStatus } from '@nestjs/common';
import { PaymentService } from '../services/payment.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import {
  SendPaymentDto,
  RequestPaymentDto,
  PayRequestDto,
  CreateSplitPaymentDto,
  PaySplitShareDto,
  GetBalanceDto,
  GetTransactionHistoryDto
} from '../dto/send-payment.dto';

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private paymentService: PaymentService) {}

  /**
   * POST /payments/send
   * Send money directly in a conversation
   *
   * Request body:
   * {
   *   "recipientAccountId": "0.0.12345",
   *   "amount": 50.00,
   *   "currency": "USD",
   *   "note": "Coffee money",
   *   "topicId": "0.0.topic-id"
   * }
   */
  @Post('send')
  async sendPayment(
    @Body() dto: SendPaymentDto,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const senderAccountId = req.user.hederaAccountId;

    if (!dto.topicId) {
      throw new HttpException(
        'topicId is required for sending payment in chat',
        HttpStatus.BAD_REQUEST
      );
    }

    return this.paymentService.sendMoneyInChat(
      senderAccountId,
      dto.topicId,
      dto.recipientAccountId,
      dto.amount,
      dto.currency,
      dto.note
    );
  }

  /**
   * POST /payments/request
   * Request money from someone in a conversation
   *
   * Request body:
   * {
   *   "amount": 50.00,
   *   "currency": "USD",
   *   "note": "Lunch money",
   *   "topicId": "0.0.topic-id"
   * }
   */
  @Post('request')
  async requestMoney(
    @Body() dto: RequestPaymentDto,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const requesterAccountId = req.user.hederaAccountId;

    return this.paymentService.requestMoney(
      requesterAccountId,
      dto.topicId,
      dto.amount,
      dto.currency,
      dto.note
    );
  }

  /**
   * POST /payments/request/:requestId/pay
   * Pay a pending money request
   *
   * Request body:
   * {
   *   "topicId": "0.0.topic-id"
   * }
   */
  @Post('request/:requestId/pay')
  async payRequest(
    @Param('requestId') requestId: string,
    @Body() dto: PayRequestDto,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const payerAccountId = req.user.hederaAccountId;

    return this.paymentService.payRequest(
      payerAccountId,
      dto.topicId,
      requestId
    );
  }

  /**
   * POST /payments/split
   * Create a split payment in group chat
   *
   * Request body for equal split:
   * {
   *   "totalAmount": 120.00,
   *   "currency": "USD",
   *   "splitMethod": "equal",
   *   "participants": ["0.0.111", "0.0.222", "0.0.333"],
   *   "note": "Dinner bill",
   *   "topicId": "0.0.topic-id"
   * }
   *
   * Request body for custom split:
   * {
   *   "totalAmount": 120.00,
   *   "currency": "USD",
   *   "splitMethod": "custom",
   *   "participants": ["0.0.111", "0.0.222", "0.0.333"],
   *   "customAmounts": {
   *     "0.0.111": 40.00,
   *     "0.0.222": 40.00,
   *     "0.0.333": 40.00
   *   },
   *   "note": "Unequal bill split",
   *   "topicId": "0.0.topic-id"
   * }
   */
  @Post('split')
  async createSplitPayment(
    @Body() dto: CreateSplitPaymentDto,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const initiatorAccountId = req.user.hederaAccountId;

    return this.paymentService.createSplitPayment(
      initiatorAccountId,
      dto.topicId,
      dto.totalAmount,
      dto.currency,
      dto.splitMethod,
      dto.participants,
      dto.customAmounts,
      dto.note
    );
  }

  /**
   * POST /payments/split/:splitId/pay
   * Pay your share in a split payment
   *
   * Request body:
   * {
   *   "topicId": "0.0.topic-id"
   * }
   */
  @Post('split/:splitId/pay')
  async paySplitShare(
    @Param('splitId') splitId: string,
    @Body() dto: PaySplitShareDto,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const payerAccountId = req.user.hederaAccountId;

    return this.paymentService.paySplitShare(
      payerAccountId,
      dto.topicId,
      splitId
    );
  }

  /**
   * GET /payments/balance
   * Get your current balance
   *
   * Query: ?accountId=0.0.xxxxx (optional, defaults to logged-in user)
   */
  @Get('balance')
  async getBalance(
    @Query('accountId') accountId: string,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const queryAccountId = accountId || req.user.hederaAccountId;
    const balance = await this.paymentService.getBalance(queryAccountId);

    return {
      accountId: queryAccountId,
      balance,
      currency: 'USD',
      tokenId: process.env.HTS_TOKEN_ID
    };
  }

  /**
   * GET /payments/history
   * Get paginated transaction history
   *
   * Query: ?accountId=0.0.xxxxx&cursor=xyz&limit=20
   */
  @Get('history')
  async getTransactionHistory(
    @Query() query: GetTransactionHistoryDto,
    @Request() req: Request & { user: { userId: string; hederaAccountId: string } }
  ) {
    const limit = Math.min(query.limit || 20, 100);

    return this.paymentService.getTransactionHistory(
      req.user.hederaAccountId,
      query.cursor,
      limit
    );
  }
}
```

### Step 8: Create Database Migration

Create file: `src/migrations/1710000000000-CreatePaymentTables.ts`

```typescript
import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreatePaymentTables1710000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create payments table
    await queryRunner.createTable(
      new Table({
        name: 'payments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'senderAccountId',
            type: 'varchar'
          },
          {
            name: 'recipientAccountId',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'amount',
            type: 'numeric',
            precision: 20,
            scale: 2
          },
          {
            name: 'currency',
            type: 'varchar'
          },
          {
            name: 'note',
            type: 'text',
            isNullable: true
          },
          {
            name: 'status',
            type: 'varchar',
            enum: ['pending', 'confirmed', 'failed', 'cancelled']
          },
          {
            name: 'tamamReference',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'transactionHash',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'paymentType',
            type: 'varchar',
            enum: ['send', 'request', 'split']
          },
          {
            name: 'conversationTopicId',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'hcsMessageId',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'splitPaymentId',
            type: 'uuid',
            isNullable: true
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()'
          }
        ],
        indices: [
          new TableIndex({ columnNames: ['senderAccountId'] }),
          new TableIndex({ columnNames: ['recipientAccountId'] }),
          new TableIndex({ columnNames: ['conversationTopicId'] }),
          new TableIndex({ columnNames: ['status'] })
        ]
      }),
      true
    );

    // Create split_payments table
    await queryRunner.createTable(
      new Table({
        name: 'split_payments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()'
          },
          {
            name: 'initiatorAccountId',
            type: 'varchar'
          },
          {
            name: 'totalAmount',
            type: 'numeric',
            precision: 20,
            scale: 2
          },
          {
            name: 'currency',
            type: 'varchar'
          },
          {
            name: 'splitMethod',
            type: 'varchar',
            enum: ['equal', 'custom']
          },
          {
            name: 'participants',
            type: 'jsonb'
          },
          {
            name: 'shares',
            type: 'jsonb'
          },
          {
            name: 'status',
            type: 'varchar',
            enum: ['pending', 'in_progress', 'completed', 'cancelled']
          },
          {
            name: 'note',
            type: 'text',
            isNullable: true
          },
          {
            name: 'conversationTopicId',
            type: 'varchar'
          },
          {
            name: 'hcsMessageId',
            type: 'varchar',
            isNullable: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'now()'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'now()'
          }
        ],
        indices: [
          new TableIndex({ columnNames: ['initiatorAccountId'] }),
          new TableIndex({ columnNames: ['conversationTopicId'] }),
          new TableIndex({ columnNames: ['status'] })
        ]
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('split_payments');
    await queryRunner.dropTable('payments');
  }
}
```

### Step 9: Update Module Imports

Update `src/app.module.ts` to include PaymentsModule:

```typescript
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    // ... other imports
    PaymentsModule,
  ],
})
export class AppModule {}
```

### Step 10: Update Environment File

Add to `.env`:

```
TAMAM_RAILS_URL=https://api.tamam.io/v1
TAMAM_RAILS_API_KEY=your_api_key_here
TAMAM_RAILS_MOCK=true
HTS_TOKEN_ID=0.0.123456
```

## Verification Steps

| Verification Step | Expected Result | Status |
|---|---|---|
| Run `pnpm migration:run` | Migrations complete, tables created | ✓ |
| Import PaymentsModule in AppModule | No import errors | ✓ |
| `curl -X GET http://localhost:3000/payments/balance` (with JWT token) | Returns `{ "accountId": "...", "balance": 0, "currency": "USD", "tokenId": "0.0.xxxxx" }` | ✓ |
| `curl -X POST http://localhost:3000/payments/send` with valid payment DTO | Returns Payment entity with status "confirmed" | ✓ |
| Payment stored in DB with HCS message ID | Payment row in database with hcsMessageId populated | ✓ |
| HCS message encrypted and submitted to conversation topic | Message readable via Mirror Node HCS API | ✓ |
| Mock mode executes HTS transfer directly | HederaService.executeHSTTransfer called, tx on testnet | ✓ |
| getTransactionHistory returns paginated results | Returns { transactions: [], nextCursor?: string } | ✓ |
| Split payment created with correct shares | SplitPayment in DB with shares object calculated | ✓ |
| Pay split share updates status | Share marked as "paid" with txHash | ✓ |

## Definition of Done

- [ ] All 5 TypeScript files created and compiled without errors
  - [ ] payment.entity.ts with 12+ columns
  - [ ] split-payment.entity.ts with shares JSON
  - [ ] send-payment.dto.ts with 4+ DTOs
  - [ ] tamam-rails.service.ts with 4 public methods
  - [ ] payment.service.ts with 6 main payment methods
- [ ] PaymentController created with 7 REST endpoints
- [ ] Migration file creates payments and split_payments tables
- [ ] All services injected and exported via PaymentsModule
- [ ] Payment workflow tested end-to-end:
  - [ ] Create payment via REST API
  - [ ] Verify HCS message submitted encrypted
  - [ ] Verify payment record in PostgreSQL
  - [ ] Verify transaction hash stored
  - [ ] Verify Tamam reference stored
- [ ] Mock mode tested:
  - [ ] TAMAM_RAILS_MOCK=true uses HederaService
  - [ ] Actual HTS transfer executes on testnet
  - [ ] Transaction hash returned correctly
- [ ] Error handling verified:
  - [ ] Invalid conversation throws 404
  - [ ] Non-participant payment throws 403
  - [ ] Missing recipient throws 400
  - [ ] Payment failure stored with status "failed"
- [ ] Request money workflow tested
- [ ] Split payment workflow tested
- [ ] Balance query returns correct value
- [ ] Transaction history returns paginated results
- [ ] All DTOs validate input with class-validator
- [ ] JWT guard protects all payment endpoints

## Troubleshooting

### Issue: "Payment processing failed: ECONNREFUSED"
**Cause**: Tamam Rails API endpoint not reachable (TAMAM_RAILS_MOCK=false and API down)
**Solution**:
- Verify TAMAM_RAILS_MOCK=true in .env for hackathon
- Or check TAMAM_RAILS_URL is correct and API is running
- Or set TAMAM_RAILS_MOCK=true to use mock HTS transfers

### Issue: "HederaService not found" error on startup
**Cause**: HederaService not imported in PaymentsModule
**Solution**:
- Verify PaymentsModule imports HederaService in providers
- Add `providers: [PaymentService, TamamRailsService, HederaService, ...]`

### Issue: "Payment confirmed but not visible in chat"
**Cause**: HCS message encrypted but WebSocket notification not sent
**Solution**:
- PaymentService sends payment but NotificationService sends WebSocket ping
- NotificationService should be created after this task (Phase 5)
- For now, verify payment in DB and HCS message in Mirror Node

### Issue: Mock payment fails with "HTS transfer failed"
**Cause**: HederaService.executeHSTTransfer not implemented or token not associated with account
**Solution**:
- Verify HederaService.executeHSTTransfer exists and handles token association
- Ensure account has testnet HBAR to pay for HTS transaction fee
- Check token ID (HTS_TOKEN_ID) is correct and exists on testnet

### Issue: Split payment shares don't add up correctly
**Cause**: Floating-point arithmetic errors with decimal numbers
**Solution**:
- Use `decimal` column type in PostgreSQL (already configured)
- Always store amounts as strings in JSON, parse to BigInt for Hedera operations
- Round to 2 decimal places for display

### Issue: "Conversation topic not found" when sending payment
**Cause**: Topic ID format incorrect or conversation doesn't exist
**Solution**:
- Verify topic ID format: "0.0.xxxxx"
- Ensure ConversationService.getConversationTopic() returns valid topic
- Check conversation participants include both sender and recipient

## Files Created in This Task

1. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/payments/dto/send-payment.dto.ts` (120 lines)
2. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/payments/entities/payment.entity.ts` (65 lines)
3. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/payments/entities/split-payment.entity.ts` (55 lines)
4. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/payments/services/tamam-rails.service.ts` (280 lines)
5. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/payments/services/payment.service.ts` (450 lines)
6. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/payments/payments.module.ts` (25 lines)
7. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/payments/controllers/payment.controller.ts` (200 lines)
8. `/sessions/exciting-sharp-mayer/mnt/social-platform/src/migrations/1710000000000-CreatePaymentTables.ts` (140 lines)

**Total: ~1,335 lines of production code**

## What Happens Next

1. **P0-T22 (Frontend Payments)**: React components consume these endpoints
   - PaymentModal calls POST /payments/send
   - PaymentRequestCard calls POST /payments/request/:id/pay
   - BalanceWidget calls GET /payments/balance

2. **P1-T23 (Notifications)**: NotificationService listens for payment events
   - Sends real-time notification when payment confirmed
   - Displays payment receipt in chat

3. **P1-T24 (Frontend Polish)**: Profile page shows transaction history
   - Uses GET /payments/history endpoint
   - Displays PaymentReceiptCard components

4. **Hackathon Demo**: Seed script creates sample payments
   - P0-T25 calls sendMoneyInChat for demo transactions
   - Shows payment flow in pitch video

---

# Integration Checklist for Next Tasks

- [ ] Frontend developer implements PaymentModal component
- [ ] Ensure Payment DTO validation matches frontend form fields
- [ ] Frontend handles payment loading states and error messages
- [ ] WebSocket integration notifies recipient in real-time
- [ ] Payment receipt card displays Hedera transaction hash with HashScan link
- [ ] Balance widget refreshes after payment confirmed
- [ ] Split payment calculator validates total amount matches sum of shares
