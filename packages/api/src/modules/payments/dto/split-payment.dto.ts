import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  Min,
  MaxLength,
  Matches,
  ArrayMinSize,
  ArrayMaxSize,
  IsIn,
} from "class-validator";
import { PAYMENT_CONSTANTS } from "../constants/payment.constants";

/**
 * DTO for creating a split payment request in a conversation.
 *
 * POST /api/v1/payments/split
 */
export class CreateSplitPaymentDto {
  /** Total amount to split */
  @IsNumber()
  @Min(PAYMENT_CONSTANTS.MIN_AMOUNT)
  totalAmount!: number;

  /** Currency code: HBAR, USDC, or USD */
  @IsString()
  currency!: string;

  /** How to split: equal parts or custom amounts */
  @IsString()
  @IsIn(["equal", "custom"])
  splitMethod!: "equal" | "custom";

  /** Hedera account IDs of participants (excluding the initiator) */
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(PAYMENT_CONSTANTS.MAX_SPLIT_PARTICIPANTS)
  participantAccountIds!: string[];

  /** HCS topic ID of the conversation (optional) */
  @IsOptional()
  @IsString()
  @Matches(/^0\.0\.\d+$/, {
    message: "topicId must be a valid Hedera topic ID (e.g., 0.0.12345)",
  })
  topicId?: string;

  /** Optional note/description */
  @IsOptional()
  @IsString()
  @MaxLength(PAYMENT_CONSTANTS.MAX_NOTE_LENGTH)
  note?: string;

  /**
   * Custom amounts per participant (required if splitMethod is 'custom').
   * Keys are Hedera account IDs, values are amounts.
   */
  @IsOptional()
  customAmounts?: Record<string, number>;
}
