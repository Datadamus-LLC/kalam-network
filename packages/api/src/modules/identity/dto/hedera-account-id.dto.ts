import { IsNotEmpty, IsString, Matches } from "class-validator";

/**
 * DTO for validating Hedera Account ID path parameters.
 * Hedera account IDs follow the pattern: shard.realm.num (e.g., 0.0.123456)
 */
export class HederaAccountIdParam {
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+\.\d+\.\d+$/, {
    message:
      "hederaAccountId must be a valid Hedera account ID (e.g., 0.0.123456)",
  })
  hederaAccountId!: string;
}
