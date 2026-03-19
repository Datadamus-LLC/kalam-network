import { IsString, IsUUID } from "class-validator";

/**
 * DTO for transferring organization ownership to another member.
 *
 * POST /api/v1/organizations/me/transfer-ownership
 */
export class TransferOwnershipDto {
  /** The user ID (UUID) of the member to receive ownership */
  @IsString()
  @IsUUID("4", { message: "newOwnerUserId must be a valid UUID" })
  newOwnerUserId!: string;
}
