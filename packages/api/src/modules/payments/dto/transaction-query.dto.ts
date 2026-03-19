import {
  IsOptional,
  IsString,
  IsNumberString,
  IsIn,
  IsDateString,
} from "class-validator";

/**
 * Query parameters for GET /api/v1/transactions
 * Supports filtering by direction, status, date range, search, and org context.
 */
export class TransactionQueryDto {
  @IsOptional()
  @IsIn(["sent", "received", "all"])
  direction?: "sent" | "received" | "all";

  @IsOptional()
  @IsIn(["completed", "pending", "failed"])
  status?: "completed" | "pending" | "failed";

  @IsOptional()
  @IsDateString()
  from?: string; // ISO8601 start date

  @IsOptional()
  @IsDateString()
  to?: string; // ISO8601 end date

  @IsOptional()
  @IsString()
  search?: string; // counterparty name or Hedera tx ID

  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
