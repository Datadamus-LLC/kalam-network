import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  MaxLength,
  Matches,
} from "class-validator";
import { PAYMENT_CONSTANTS } from "../constants/payment.constants";

/**
 * DTO for sending a payment in a conversation.
 *
 * POST /api/v1/payments/send
 */
export class SendPaymentDto {
  /** Recipient's Hedera account ID (e.g., "0.0.12345") */
  @IsString()
  @Matches(/^0\.0\.\d+$/, {
    message:
      "recipientAccountId must be a valid Hedera account ID (e.g., 0.0.12345)",
  })
  recipientAccountId!: string;

  /** Amount to send (in token units) */
  @IsNumber()
  @Min(PAYMENT_CONSTANTS.MIN_AMOUNT)
  amount!: number;

  /** Currency code: HBAR, USDC, or USD */
  @IsString()
  currency!: string;

  /** HCS topic ID of the conversation where payment is made (optional) */
  @IsOptional()
  @IsString()
  @Matches(/^0\.0\.\d+$/, {
    message: "topicId must be a valid Hedera topic ID (e.g., 0.0.12345)",
  })
  topicId?: string;

  /** Optional note/memo for the payment */
  @IsOptional()
  @IsString()
  @MaxLength(PAYMENT_CONSTANTS.MAX_NOTE_LENGTH)
  note?: string;
}
