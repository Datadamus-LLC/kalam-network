import { IsString, IsNotEmpty, Matches } from "class-validator";

/**
 * DTO for adding a participant to a group conversation.
 */
export class AddParticipantDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message: "accountId must be a valid Hedera account ID (e.g. 0.0.12345)",
  })
  accountId!: string;
}
