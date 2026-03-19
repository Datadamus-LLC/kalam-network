import { IsOptional, IsString, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";

/**
 * Query parameters for listing user conversations with cursor-based pagination.
 */
export class GetConversationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;
}
