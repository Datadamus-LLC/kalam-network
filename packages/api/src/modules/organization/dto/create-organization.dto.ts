import { IsString, IsNotEmpty, MaxLength, MinLength } from "class-validator";

/**
 * DTO for creating a new organization.
 *
 * POST /api/v1/organizations
 */
export class CreateOrganizationDto {
  /** Organization display name */
  @IsString()
  @IsNotEmpty({ message: "Organization name is required" })
  @MinLength(2, { message: "Organization name must be at least 2 characters" })
  @MaxLength(128, {
    message: "Organization name must not exceed 128 characters",
  })
  name!: string;
}
