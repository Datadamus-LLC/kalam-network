import { IsString, IsNotEmpty, Matches } from "class-validator";

/**
 * DTO for follow and unfollow requests.
 *
 * The target account ID must be a valid Hedera account ID format.
 * The follower (actor) is extracted from the JWT token, not the body.
 */
export class FollowUserDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0\.0\.\d+$/, {
    message: "targetAccountId must be in Hedera account ID format: 0.0.XXXXX",
  })
  targetAccountId!: string;
}

export class UnfollowUserDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0\.0\.\d+$/, {
    message: "targetAccountId must be in Hedera account ID format: 0.0.XXXXX",
  })
  targetAccountId!: string;
}
