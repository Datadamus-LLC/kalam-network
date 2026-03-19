import {
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  Matches,
} from "class-validator";

/**
 * DTO for profile update requests (PUT /api/v1/profile/me).
 *
 * All fields are optional — only provided fields are updated.
 * Avatar is handled separately via multipart file upload (not in this DTO).
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: "Display name must not be empty" })
  @MaxLength(100, { message: "Display name must not exceed 100 characters" })
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: "Bio must not exceed 500 characters" })
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: "Location must not exceed 200 characters" })
  location?: string;

  /**
   * X25519 public key (base64-encoded) for end-to-end encrypted messaging.
   * Must be a base64 string encoding exactly 32 bytes (44 chars with padding).
   * The conversation service decodes this as base64 for nacl.box key exchange.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9+/]{43}=$/, {
    message:
      "encryptionPublicKey must be a base64-encoded 32-byte X25519 public key (44 characters)",
  })
  encryptionPublicKey?: string;
}
