import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsNumberString,
} from "class-validator";

/**
 * DTO for user search query parameters (GET /api/v1/users/search?q=...&limit=...).
 */
export class SearchUsersDto {
  @IsString()
  @MinLength(2, { message: "Search query must be at least 2 characters" })
  @MaxLength(100, { message: "Search query must not exceed 100 characters" })
  q!: string;

  @IsOptional()
  @IsNumberString({}, { message: "Limit must be a number" })
  limit?: string;
}
