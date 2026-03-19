import { IsOptional, IsString, IsNumberString } from "class-validator";

/**
 * Query parameters for GET /api/v1/payments/history
 */
export class PaymentHistoryQueryDto {
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
