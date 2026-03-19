import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
  Matches,
  IsDateString,
  IsUUID,
} from "class-validator";
import { PAYMENT_CONSTANTS } from "../constants/payment.constants";

/**
 * DTO for creating a payment request in a conversation.
 *
 * POST /api/v1/payments/request
 */
export class RequestPaymentDto {
  /** Amount to request */
  @IsNumber()
  @Min(PAYMENT_CONSTANTS.MIN_AMOUNT)
  amount!: number;

  /** Currency code: HBAR, USDC, or USD */
  @IsString()
  currency!: string;

  /** HCS topic ID of the conversation where request is posted (optional) */
  @IsOptional()
  @IsString()
  @Matches(/^0\.0\.\d+$/, {
    message: "topicId must be a valid Hedera topic ID (e.g., 0.0.12345)",
  })
  topicId?: string;

  /** Optional description for the payment request */
  @IsOptional()
  @IsString()
  @MaxLength(PAYMENT_CONSTANTS.MAX_NOTE_LENGTH)
  description?: string;

  /** Optional custom expiry date (ISO 8601). Defaults to 72 hours from creation. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

/**
 * DTO for fulfilling a payment request.
 *
 * POST /api/v1/payments/request/:requestId/pay
 */
export class FulfillPaymentRequestDto {
  /** HCS topic ID of the conversation (optional) */
  @IsOptional()
  @IsString()
  @Matches(/^0\.0\.\d+$/, {
    message: "topicId must be a valid Hedera topic ID (e.g., 0.0.12345)",
  })
  topicId?: string;
}

/**
 * DTO for declining a payment request.
 *
 * POST /api/v1/payments/request/:requestId/decline
 */
export class DeclinePaymentRequestDto {
  /** Optional reason for declining */
  @IsOptional()
  @IsString()
  @MaxLength(PAYMENT_CONSTANTS.MAX_NOTE_LENGTH)
  reason?: string;
}

/**
 * Query DTO for listing payment requests.
 *
 * GET /api/v1/payments/requests
 */
export class PaymentRequestQueryDto {
  /** Filter by conversation ID */
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  /** Filter by status */
  @IsOptional()
  @IsString()
  status?: "pending" | "paid" | "expired" | "declined" | "cancelled";

  /** Number of results per page (default: 20) */
  @IsOptional()
  @IsString()
  limit?: string;

  /** Cursor for pagination (ISO 8601 timestamp) */
  @IsOptional()
  @IsString()
  cursor?: string;
}
