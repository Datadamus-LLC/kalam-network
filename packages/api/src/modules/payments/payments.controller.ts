import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  Query,
  Headers,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import type { JwtPayload } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { SendPaymentDto } from "./dto/send-payment.dto";
import { CreateSplitPaymentDto } from "./dto/split-payment.dto";
import {
  RequestPaymentDto,
  FulfillPaymentRequestDto,
  DeclinePaymentRequestDto,
  PaymentRequestQueryDto,
} from "./dto/request-payment.dto";
import { PaymentHistoryQueryDto } from "./dto/payment-history-query.dto";
import { TransactionQueryDto } from "./dto/transaction-query.dto";
import type {
  PaymentResponse,
  PaymentRequestResponse,
  PaginatedPaymentHistoryResponse,
  TransactionDetailResponse,
  BalanceResponse,
  SplitPaymentResponse,
} from "./dto/payment-response.dto";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error: null;
  timestamp: string;
}

function envelope<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
    timestamp: new Date().toISOString(),
  };
}

@Controller("api/v1/payments")
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /api/v1/payments/send — Send a payment to another user
   */
  @Post("send")
  async sendPayment(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SendPaymentDto,
  ): Promise<ApiResponse<PaymentResponse>> {
    const result = await this.paymentsService.sendPayment(
      user,
      dto.recipientAccountId,
      dto.amount,
      dto.currency,
      dto.topicId,
      dto.note,
    );
    return envelope(result);
  }

  /**
   * POST /api/v1/payments/split — Create a split payment across participants
   */
  @Post("split")
  async createSplitPayment(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSplitPaymentDto,
  ): Promise<ApiResponse<SplitPaymentResponse>> {
    const result = await this.paymentsService.createSplitPayment(user, {
      totalAmount: dto.totalAmount,
      currency: dto.currency,
      splitMethod: dto.splitMethod,
      participantAccountIds: dto.participantAccountIds,
      topicId: dto.topicId,
      note: dto.note,
      customAmounts: dto.customAmounts,
    });
    return envelope(result);
  }

  /**
   * POST /api/v1/payments/request — Create a payment request
   */
  @Post("request")
  async createPaymentRequest(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RequestPaymentDto,
  ): Promise<ApiResponse<PaymentRequestResponse>> {
    const result = await this.paymentsService.createPaymentRequest(
      user,
      dto.topicId,
      dto.amount,
      dto.currency,
      dto.description,
      dto.expiresAt,
    );
    return envelope(result);
  }

  /**
   * POST /api/v1/payments/request/:requestId/pay — Fulfill a payment request
   */
  @Post("request/:requestId/pay")
  async fulfillPaymentRequest(
    @CurrentUser() user: JwtPayload,
    @Param("requestId") requestId: string,
    @Body() dto: FulfillPaymentRequestDto,
  ): Promise<ApiResponse<PaymentRequestResponse>> {
    const result = await this.paymentsService.fulfillPaymentRequest(
      user,
      requestId,
      dto.topicId,
    );
    return envelope(result);
  }

  /**
   * POST /api/v1/payments/request/:requestId/decline — Decline a payment request
   */
  @Post("request/:requestId/decline")
  @HttpCode(HttpStatus.OK)
  async declinePaymentRequest(
    @CurrentUser() user: JwtPayload,
    @Param("requestId") requestId: string,
    @Body() dto: DeclinePaymentRequestDto,
  ): Promise<ApiResponse<PaymentRequestResponse>> {
    const result = await this.paymentsService.declinePaymentRequest(
      user,
      requestId,
      dto.reason,
    );
    return envelope(result);
  }

  /**
   * POST /api/v1/payments/request/:requestId/cancel — Cancel own payment request
   */
  @Post("request/:requestId/cancel")
  @HttpCode(HttpStatus.OK)
  async cancelPaymentRequest(
    @CurrentUser() user: JwtPayload,
    @Param("requestId") requestId: string,
  ): Promise<ApiResponse<PaymentRequestResponse>> {
    const result = await this.paymentsService.cancelPaymentRequest(
      user,
      requestId,
    );
    return envelope(result);
  }

  /**
   * GET /api/v1/payments/request/:requestId — Get a single payment request
   */
  @Get("request/:requestId")
  async getPaymentRequest(
    @Param("requestId") requestId: string,
  ): Promise<ApiResponse<PaymentRequestResponse>> {
    const result = await this.paymentsService.getPaymentRequest(requestId);
    return envelope(result);
  }

  /**
   * GET /api/v1/payments/requests — List payment requests
   */
  @Get("requests")
  async getPaymentRequests(@Query() query: PaymentRequestQueryDto): Promise<
    ApiResponse<{
      requests: PaymentRequestResponse[];
      cursor: string | null;
      hasMore: boolean;
    }>
  > {
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const result = await this.paymentsService.getPaymentRequests(
      query.conversationId,
      query.status,
      limit,
      query.cursor,
    );
    return envelope(result);
  }

  /**
   * GET /api/v1/payments/balance — Get account balance
   */
  @Get("balance")
  async getBalance(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<BalanceResponse>> {
    const result = await this.paymentsService.getBalance(user.hederaAccountId);
    return envelope(result);
  }

  /**
   * GET /api/v1/payments/history — Get paginated payment history (legacy, uses PaymentIndex)
   */
  @Get("history")
  async getPaymentHistory(
    @CurrentUser() user: JwtPayload,
    @Query() query: PaymentHistoryQueryDto,
  ): Promise<ApiResponse<PaginatedPaymentHistoryResponse>> {
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const result = await this.paymentsService.getPaymentHistory(
      user.hederaAccountId,
      limit,
      query.cursor,
    );
    return envelope(result);
  }

  /**
   * GET /api/v1/payments/transactions — Rich transaction query with filters (T32)
   */
  @Get("transactions")
  async queryTransactions(
    @CurrentUser() user: JwtPayload,
    @Query() query: TransactionQueryDto,
    @Headers("x-org-context") orgContextId?: string,
  ): Promise<ApiResponse<PaginatedPaymentHistoryResponse>> {
    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const result = await this.paymentsService.queryTransactions(user.sub, {
      direction: query.direction,
      status: query.status,
      from: query.from,
      to: query.to,
      search: query.search,
      organizationId: orgContextId,
      limit,
      cursor: query.cursor,
    });
    return envelope(result);
  }

  /**
   * GET /api/v1/payments/transactions/:id — Transaction detail with on-chain proof (T32)
   */
  @Get("transactions/:id")
  async getTransactionDetail(
    @CurrentUser() user: JwtPayload,
    @Param("id") transactionId: string,
  ): Promise<ApiResponse<TransactionDetailResponse>> {
    const result = await this.paymentsService.getTransactionDetail(
      transactionId,
      user.sub,
    );
    return envelope(result);
  }
}
