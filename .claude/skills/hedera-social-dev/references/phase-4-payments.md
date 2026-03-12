# Phase 4: In-Chat Payments

**Status**: PARTIALLY BLOCKED on Tamam Payment Rails.

**Scope**: Tasks T21–T22

---

## Overview: Payment Flows

The payment system has two modes:

1. **Tamam Payment Rails** (BLOCKED) — External payment processor
   - Handles cross-chain fiat conversion
   - KYC'd user accounts
   - Compliance & reporting

2. **Direct HTS Token Transfers** (IMPLEMENTABLE) — For testing/fallback
   - Direct Hedera token transfers between accounts
   - No external API needed

This guide implements the full flow assuming Tamam will be integrated, but will throw `NotImplementedError` at the Tamam call point.

**CRITICAL DECISION FOR USER**: Which approach for production?
- Option A: Wait for Tamam documentation, implement full Tamam integration
- Option B: Use direct HTS transfers as MVP, integrate Tamam later
- Option C: Use direct HTS transfers for demo or show "payment feature in development" state, note blockers in submission

---

## HCS Payment Event Schemas

### Payment Receipt (Posted to Conversation Topic)

When a payment is confirmed, a receipt message is posted to the conversation's HCS topic.

```json
{
  "v": "1.0",
  "type": "payment",
  "sender": "0.0.11111",
  "ts": 1700000000000,
  "content": {
    "action": "send",
    "amount": 50.00,
    "currency": "USD",
    "recipient": "0.0.22222",
    "txHash": "0xabc123...",
    "status": "confirmed",
    "metadata": {
      "memo": "Thanks for the coffee!",
      "requestId": null
    }
  }
}
```

**Fields**:
- `action`: "send", "request", "split"
- `amount`: Numeric amount in specified currency
- `currency`: "USD", "HBAR", or other token symbol
- `recipient`: Hedera account ID
- `txHash`: Reference to on-chain transaction (HTS transaction hash or Tamam reference)
- `status`: "pending", "confirmed", "failed", "cancelled"
- `metadata.memo`: Optional memo/description
- `metadata.requestId`: For payment requests, reference to the request

### Payment Request

When a user requests payment from another user.

```json
{
  "v": "1.0",
  "type": "payment_request",
  "sender": "0.0.11111",
  "ts": 1700000000000,
  "content": {
    "action": "request",
    "amount": 50.00,
    "currency": "USD",
    "recipient": "0.0.22222",
    "requestId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "pending",
    "metadata": {
      "memo": "Dinner expense split",
      "expiresAt": 1700086400000
    }
  }
}
```

---

## Backend: Payment Module

### Payment Entity

**File**: `apps/backend/src/payments/entities/payment.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('payments')
@Index(['senderAccountId', 'recipientAccountId'], { unique: false })
@Index(['createdAt'], { unique: false })
export class Payment {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // UUID

  @Column('varchar', { length: 64 })
  conversationId: string; // FK to conversations.id

  @Column('varchar', { length: 30 })
  senderAccountId: string; // Hedera account ID

  @Column('varchar', { length: 30 })
  recipientAccountId: string; // Hedera account ID

  @Column('decimal', { precision: 18, scale: 8 })
  amount: number; // Amount in currency

  @Column('varchar', { length: 10 })
  currency: string; // USD, HBAR, etc.

  @Column('varchar', { length: 20 })
  status: 'pending' | 'confirmed' | 'failed' | 'cancelled';

  @Column('varchar', { length: 1000, nullable: true })
  txHash?: string; // HTS transaction hash or Tamam reference

  @Column('varchar', { length: 1000, nullable: true })
  hcsPaymentId?: string; // Reference to HCS message ID

  @Column('varchar', { length: 500, nullable: true })
  memo?: string; // User-provided memo

  @CreateDateColumn()
  createdAt: Date;
}
```

### Payment Request Entity

**File**: `apps/backend/src/payments/entities/payment-request.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('payment_requests')
export class PaymentRequest {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // UUID

  @Column('varchar', { length: 64 })
  conversationId: string;

  @Column('varchar', { length: 30 })
  requesterAccountId: string; // Who is requesting

  @Column('varchar', { length: 30 })
  requesteeAccountId: string; // Who is being asked

  @Column('decimal', { precision: 18, scale: 8 })
  amount: number;

  @Column('varchar', { length: 10 })
  currency: string;

  @Column('varchar', { length: 20 })
  status: 'pending' | 'accepted' | 'rejected' | 'expired';

  @Column('varchar', { length: 500, nullable: true })
  memo?: string;

  @Column('bigint')
  expiresAt: number; // Timestamp in ms

  @CreateDateColumn()
  createdAt: Date;
}
```

### Tamam Payment Rails Service

**File**: `apps/backend/src/payments/tamam-payment-rails.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { NotImplementedError } from '../common/errors';

interface TamamPaymentRequest {
  senderAccountId: string;
  recipientAccountId: string;
  amount: number;
  currency: string;
  memo?: string;
}

interface TamamPaymentResponse {
  transactionHash: string;
  status: 'confirmed' | 'pending' | 'failed';
  amount: number;
  currency: string;
}

@Injectable()
export class TamamPaymentRailsService {
  /**
   * BLOCKED: Awaiting Tamam Payment Rails API documentation.
   * Expected to call: POST /v1/transfer with payment details.
   */
  async submitPayment(request: TamamPaymentRequest): Promise<TamamPaymentResponse> {
    throw new NotImplementedError(
      'Tamam Payment Rails API integration blocked — awaiting API documentation. ' +
      'Expected endpoint: POST /v1/transfer with sender, recipient, amount, currency'
    );
  }

  /**
   * BLOCKED: Check payment status via Tamam.
   */
  async getPaymentStatus(transactionHash: string): Promise<string> {
    throw new NotImplementedError(
      'Tamam Payment Rails API integration blocked'
    );
  }

  /**
   * BLOCKED: Get Tamam account balance.
   */
  async getBalance(accountId: string): Promise<{ balance: number; currency: string }> {
    throw new NotImplementedError(
      'Tamam Payment Rails API integration blocked'
    );
  }
}
```

### Payment Service

**File**: `apps/backend/src/payments/payments.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentRequest } from './entities/payment-request.entity';
import { TamamPaymentRailsService } from './tamam-payment-rails.service';
import { TopicMessageSubmitTransaction, Client } from '@hashgraph/sdk';
import { HederaClient } from '@hedera-social/hedera-config';
import { v4 as uuid } from 'uuid';

interface SendPaymentDto {
  conversationId: string;
  recipientAccountId: string;
  amount: number;
  currency: string;
  memo?: string;
}

interface RequestPaymentDto {
  conversationId: string;
  requesteeAccountId: string;
  amount: number;
  currency: string;
  memo?: string;
  expiresInMinutes?: number;
}

@Injectable()
export class PaymentsService {
  private client: Client;

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(PaymentRequest)
    private paymentRequestRepository: Repository<PaymentRequest>,
    private tamamPaymentRailsService: TamamPaymentRailsService,
  ) {
    this.client = HederaClient.getInstance(
      process.env.HEDERA_NETWORK as 'testnet' | 'mainnet' | 'previewnet',
      process.env.HEDERA_ACCOUNT_ID!,
      process.env.HEDERA_PRIVATE_KEY!,
    );
  }

  /**
   * Send a payment via Tamam Payment Rails.
   * BLOCKED: Requires Tamam API documentation.
   */
  async sendPayment(
    senderAccountId: string,
    conversationId: string,
    dto: SendPaymentDto,
  ): Promise<Payment> {
    // Validate
    if (senderAccountId === dto.recipientAccountId) {
      throw new BadRequestException('Cannot send payment to yourself');
    }

    // Step 1: Create payment record (status: pending)
    const payment = this.paymentRepository.create({
      id: uuid(),
      conversationId,
      senderAccountId,
      recipientAccountId: dto.recipientAccountId,
      amount: dto.amount,
      currency: dto.currency,
      status: 'pending',
      memo: dto.memo,
    });

    await this.paymentRepository.save(payment);

    try {
      // Step 2: Submit payment via Tamam (BLOCKED)
      const tamamResponse = await this.tamamPaymentRailsService.submitPayment({
        senderAccountId,
        recipientAccountId: dto.recipientAccountId,
        amount: dto.amount,
        currency: dto.currency,
        memo: dto.memo,
      });

      // Step 3: Post receipt to HCS conversation topic
      const receiptPayload = {
        v: '1.0',
        type: 'payment',
        sender: senderAccountId,
        ts: Date.now(),
        content: {
          action: 'send',
          amount: dto.amount,
          currency: dto.currency,
          recipient: dto.recipientAccountId,
          txHash: tamamResponse.transactionHash,
          status: tamamResponse.status,
          metadata: {
            memo: dto.memo,
            requestId: null,
          },
        },
      };

      // Note: This requires the conversation's HCS topic ID
      // For now, we'll skip posting to HCS until conversation topic is passed
      // In production, fetch conversation and post to conversation.topicId

      // Step 4: Update payment status
      payment.status = 'confirmed';
      payment.txHash = tamamResponse.transactionHash;
      await this.paymentRepository.save(payment);

      return payment;
    } catch (error) {
      // Step 5: Mark as failed
      payment.status = 'failed';
      await this.paymentRepository.save(payment);
      throw error;
    }
  }

  /**
   * Request a payment from another user.
   */
  async requestPayment(
    requesterAccountId: string,
    conversationId: string,
    dto: RequestPaymentDto,
  ): Promise<PaymentRequest> {
    const request = this.paymentRequestRepository.create({
      id: uuid(),
      conversationId,
      requesterAccountId,
      requesteeAccountId: dto.requesteeAccountId,
      amount: dto.amount,
      currency: dto.currency,
      memo: dto.memo,
      status: 'pending',
      expiresAt: Date.now() + (dto.expiresInMinutes || 60) * 60 * 1000,
    });

    await this.paymentRequestRepository.save(request);

    // Post request to HCS (TODO: requires conversation topic ID)

    return request;
  }

  /**
   * Accept a payment request.
   */
  async acceptPaymentRequest(
    requesterAccountId: string,
    paymentRequestId: string,
  ): Promise<Payment> {
    const paymentRequest = await this.paymentRequestRepository.findOne({
      where: { id: paymentRequestId },
    });

    if (!paymentRequest) {
      throw new BadRequestException('Payment request not found');
    }

    if (paymentRequest.status !== 'pending') {
      throw new BadRequestException('Payment request already processed');
    }

    if (Date.now() > paymentRequest.expiresAt) {
      throw new BadRequestException('Payment request expired');
    }

    // Send payment (from requestee to requester)
    const payment = await this.sendPayment(
      requesterAccountId, // The person accepting (and paying)
      paymentRequest.conversationId,
      {
        recipientAccountId: paymentRequest.requesterAccountId,
        amount: paymentRequest.amount,
        currency: paymentRequest.currency,
        memo: paymentRequest.memo,
      },
    );

    // Update request status
    paymentRequest.status = 'accepted';
    await this.paymentRequestRepository.save(paymentRequest);

    return payment;
  }

  /**
   * Reject a payment request.
   */
  async rejectPaymentRequest(paymentRequestId: string): Promise<void> {
    const paymentRequest = await this.paymentRequestRepository.findOne({
      where: { id: paymentRequestId },
    });

    if (!paymentRequest) {
      throw new BadRequestException('Payment request not found');
    }

    paymentRequest.status = 'rejected';
    await this.paymentRequestRepository.save(paymentRequest);
  }

  /**
   * Get payment history for a conversation.
   */
  async getPaymentHistory(
    conversationId: string,
    limit: number = 50,
  ): Promise<Payment[]> {
    return this.paymentRepository
      .createQueryBuilder('p')
      .where('p.conversationId = :conversationId', { conversationId })
      .orderBy('p.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * Get pending payment requests for a user.
   */
  async getPendingRequests(accountId: string): Promise<PaymentRequest[]> {
    return this.paymentRequestRepository
      .createQueryBuilder('pr')
      .where('pr.requesteeAccountId = :accountId', { accountId })
      .andWhere('pr.status = :status', { status: 'pending' })
      .andWhere('pr.expiresAt > :now', { now: Date.now() })
      .orderBy('pr.createdAt', 'DESC')
      .getMany();
  }
}
```

### Payments Controller

**File**: `apps/backend/src/payments/payments.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PaymentsService } from './payments.service';

interface SendPaymentDto {
  conversationId: string;
  recipientAccountId: string;
  amount: number;
  currency: string;
  memo?: string;
}

interface RequestPaymentDto {
  conversationId: string;
  requesteeAccountId: string;
  amount: number;
  currency: string;
  memo?: string;
  expiresInMinutes?: number;
}

@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('send')
  async sendPayment(
    @Request() req: any,
    @Body() dto: SendPaymentDto,
  ) {
    return this.paymentsService.sendPayment(
      req.user.accountId,
      dto.conversationId,
      dto,
    );
  }

  @Post('request')
  async requestPayment(
    @Request() req: any,
    @Body() dto: RequestPaymentDto,
  ) {
    return this.paymentsService.requestPayment(
      req.user.accountId,
      dto.conversationId,
      dto,
    );
  }

  @Post('requests/:requestId/accept')
  async acceptPaymentRequest(
    @Request() req: any,
    @Param('requestId') requestId: string,
  ) {
    return this.paymentsService.acceptPaymentRequest(
      req.user.accountId,
      requestId,
    );
  }

  @Post('requests/:requestId/reject')
  async rejectPaymentRequest(@Param('requestId') requestId: string) {
    await this.paymentsService.rejectPaymentRequest(requestId);
    return { message: 'Payment request rejected' };
  }

  @Get('history/:conversationId')
  async getPaymentHistory(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit: number = 50,
  ) {
    return this.paymentsService.getPaymentHistory(conversationId, limit);
  }

  @Get('requests/pending')
  async getPendingRequests(@Request() req: any) {
    return this.paymentsService.getPendingRequests(req.user.accountId);
  }
}
```

### Payments Module

**File**: `apps/backend/src/payments/payments.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { TamamPaymentRailsService } from './tamam-payment-rails.service';
import { Payment } from './entities/payment.entity';
import { PaymentRequest } from './entities/payment-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, PaymentRequest])],
  controllers: [PaymentsController],
  providers: [PaymentsService, TamamPaymentRailsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
```

---

## Alternative: Direct HTS Token Transfers

If you want a working payment system **without** Tamam, use direct HTS transfers.

### HTS Direct Transfer Service

**File**: `apps/backend/src/payments/hts-direct-transfer.service.ts`

```typescript
import { Injectable } from '@nestjs/common';
import { HederaClient } from '@hedera-social/hedera-config';
import { Client, CryptoTransferTransaction, Hbar, AccountId } from '@hashgraph/sdk';

interface TransferResult {
  transactionHash: string;
  status: 'success' | 'failed';
  amount: string;
}

@Injectable()
export class HTSDirectTransferService {
  private client: Client;
  private platformTokenId = process.env.PLATFORM_TOKEN_ID || '0.0.0';

  constructor() {
    this.client = HederaClient.getInstance(
      process.env.HEDERA_NETWORK as 'testnet' | 'mainnet' | 'previewnet',
      process.env.HEDERA_ACCOUNT_ID!,
      process.env.HEDERA_PRIVATE_KEY!,
    );
  }

  /**
   * Transfer HBAR between accounts.
   * IMPLEMENTABLE: Direct Hedera HTS transfer.
   */
  async transferHBAR(
    senderAccountId: string,
    recipientAccountId: string,
    amount: string, // in HBAR
  ): Promise<TransferResult> {
    try {
      const transaction = new CryptoTransferTransaction()
        .addHbarTransfer(senderAccountId, new Hbar(-parseFloat(amount)))
        .addHbarTransfer(recipientAccountId, new Hbar(parseFloat(amount)));

      const submitted = await transaction.execute(this.client);
      const receipt = await submitted.getReceipt(this.client);

      return {
        transactionHash: submitted.transactionHash?.toString() || 'unknown',
        status: receipt.status?.toString() === 'SUCCESS' ? 'success' : 'failed',
        amount,
      };
    } catch (error) {
      return {
        transactionHash: 'failed',
        status: 'failed',
        amount,
      };
    }
  }

  /**
   * Transfer HTS tokens between accounts.
   */
  async transferToken(
    senderAccountId: string,
    recipientAccountId: string,
    amount: number,
    tokenId?: string,
  ): Promise<TransferResult> {
    const token = tokenId || this.platformTokenId;

    try {
      const transaction = new CryptoTransferTransaction()
        .addTokenTransfer(token, senderAccountId, -amount)
        .addTokenTransfer(token, recipientAccountId, amount);

      const submitted = await transaction.execute(this.client);
      const receipt = await submitted.getReceipt(this.client);

      return {
        transactionHash: submitted.transactionHash?.toString() || 'unknown',
        status: receipt.status?.toString() === 'SUCCESS' ? 'success' : 'failed',
        amount: amount.toString(),
      };
    } catch (error) {
      return {
        transactionHash: 'failed',
        status: 'failed',
        amount: amount.toString(),
      };
    }
  }
}
```

---

## Frontend: Payment Widgets

### Send Payment Modal

**File**: `apps/frontend/components/SendPaymentModal.tsx`

```typescript
'use client';

import { useState } from 'react';

export function SendPaymentModal({
  conversationId,
  recipientAccountId,
  onClose,
}: {
  conversationId: string;
  recipientAccountId: string;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [memo, setMemo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSend = async () => {
    if (!amount || isNaN(parseFloat(amount))) {
      setError('Invalid amount');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/payments/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          recipientAccountId,
          amount: parseFloat(amount),
          currency,
          memo,
        }),
      });

      if (res.ok) {
        onClose();
      } else {
        const data = await res.json();
        setError(data.message || 'Failed to send payment');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg w-96">
        <h2 className="text-xl font-bold mb-4">Send Payment</h2>

        {error && <p className="text-red-500 mb-4">{error}</p>}

        <input
          type="number"
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full p-2 border rounded mb-3"
          step="0.01"
        />

        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          className="w-full p-2 border rounded mb-3"
        >
          <option value="USD">USD</option>
          <option value="HBAR">HBAR</option>
        </select>

        <input
          type="text"
          placeholder="Memo (optional)"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          className="w-full p-2 border rounded mb-4"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border rounded"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
            disabled={loading}
          >
            {loading ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Key Takeaways for Phase 4

- **Payment receipt messages** are posted to HCS conversation topics
- **Tamam Payment Rails** is blocked — API documentation required
- **Direct HTS transfers** are an implementable alternative
- **Payment requests** can be sent and tracked
- **All database operations** are implementable
- **Error handling** is clear when Tamam is missing
- **For demo**: Use either direct HTS transfers or show payment UI with "awaiting Tamam integration" state (no simulation/mocking)

**For hackathon submission**:
- If Tamam docs are available: Full integration
- If not: Demo direct HTS transfers OR show payment UI with clear "feature awaiting external integration" message
- Be honest about what's working and what's planned — never simulate missing pieces

Next: Phase 5 (Notifications) — fully implementable.
