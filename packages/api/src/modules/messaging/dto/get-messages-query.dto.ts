import { IsOptional, IsString, IsNumberString } from "class-validator";

/**
 * Query parameters for GET /api/v1/conversations/:topicId/messages
 */
export class GetMessagesQueryDto {
  @IsOptional()
  @IsNumberString()
  limit?: string;

  @IsOptional()
  @IsString()
  cursor?: string;
}
