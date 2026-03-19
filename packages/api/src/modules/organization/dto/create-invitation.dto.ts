import { IsString, IsEmail, IsIn, IsOptional } from "class-validator";

/**
 * DTO for creating an organization invitation.
 *
 * POST /api/v1/organizations/me/invitations
 */
export class CreateInvitationDto {
  /** Email address of the person to invite */
  @IsEmail({}, { message: "A valid email address is required" })
  email!: string;

  /** Role to assign when the invitation is accepted */
  @IsString()
  @IsIn(["admin", "member", "viewer"], {
    message: "Role must be one of: admin, member, viewer",
  })
  role!: "admin" | "member" | "viewer";

  /** Optional message to include in the invitation */
  @IsOptional()
  @IsString()
  message?: string;
}
