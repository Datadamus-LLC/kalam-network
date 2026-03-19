import { IsString, IsNotEmpty } from "class-validator";

/**
 * DTO for token refresh requests.
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: "Refresh token is required" })
  refreshToken!: string;
}
