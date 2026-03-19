import {
  IsArray,
  IsString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  ArrayMinSize,
  ArrayMaxSize,
  MaxLength,
  Matches,
} from "class-validator";

/**
 * DTO for creating a new conversation (direct 1:1 or group).
 *
 * For direct conversations, exactly 1 participant account ID is required
 * (the other participant is the authenticated initiator).
 *
 * For group conversations, at least 2 participant account IDs are required,
 * and groupName is mandatory.
 */
export class CreateConversationDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @Matches(/^\d+\.\d+\.\d+$/, {
    each: true,
    message:
      "Each participant must be a valid Hedera account ID (e.g. 0.0.12345)",
  })
  participantAccountIds!: string[];

  @IsIn(["direct", "group"])
  @IsNotEmpty()
  type!: "direct" | "group";

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  groupName?: string;

  @IsOptional()
  @IsString()
  groupAvatarCid?: string;
}
