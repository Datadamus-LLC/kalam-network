import {
  IsString,
  IsOptional,
  MaxLength,
  IsObject,
  IsUrl,
} from "class-validator";

/**
 * DTO for updating organization profile.
 *
 * PUT /api/v1/organizations/me
 */
export class UpdateOrgProfileDto {
  /** Organization display name */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  name?: string;

  /** Short biography / description */
  @IsOptional()
  @IsString()
  @MaxLength(256)
  bio?: string;

  /** Business category (e.g., "retail", "tech", "finance") */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  /** Organization website URL */
  @IsOptional()
  @IsUrl({}, { message: "website must be a valid URL" })
  @MaxLength(256)
  website?: string;

  /** Business hours as key-value pairs (e.g., { "mon": "9:00-17:00" }) */
  @IsOptional()
  @IsObject()
  businessHours?: Record<string, string>;

  /** IPFS CID for the organization logo (uploaded separately) */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  logoCid?: string;
}
