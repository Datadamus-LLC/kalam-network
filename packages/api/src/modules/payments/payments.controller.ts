import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';

@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('send')
  async sendPayment(
    @Body()
    paymentDto: {
      recipientAccountId: string;
      amount: number;
      currency: string;
      memo?: string;
    },
  ): Promise<{ message: string }> {
    // TODO: implement HBAR/token transfer via Hedera SDK
    return {
      message: `Send payment endpoint — to: ${paymentDto.recipientAccountId}, amount: ${paymentDto.amount}`,
    };
  }

  @Get('history')
  async getPaymentHistory(
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<{ message: string }> {
    // TODO: implement payment history retrieval
    return {
      message: `Payment history endpoint — limit: ${limit ?? '50'}, before: ${before ?? 'latest'}`,
    };
  }

  @Get('balance')
  async getBalance(): Promise<{ message: string }> {
    // TODO: implement balance check via Hedera Mirror Node
    return { message: 'Get balance endpoint' };
  }

  @Get(':transactionId')
  async getTransaction(
    @Param('transactionId') transactionId: string,
  ): Promise<{ message: string }> {
    // TODO: implement transaction lookup
    return {
      message: `Get transaction endpoint — id: ${transactionId}`,
    };
  }
}
