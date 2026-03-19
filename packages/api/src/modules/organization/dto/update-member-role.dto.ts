import { IsString, IsIn } from "class-validator";

/**
 * DTO for updating a member's role within an organization.
 *
 * PUT /api/v1/organizations/me/members/:userId/role
 */
export class UpdateMemberRoleDto {
  /** New role to assign to the member */
  @IsString()
  @IsIn(["admin", "member", "viewer"], {
    message: "Role must be one of: admin, member, viewer",
  })
  role!: "admin" | "member" | "viewer";
}
