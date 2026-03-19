import { IsString, IsNotEmpty, IsIn } from "class-validator";

/**
 * DTO for the Mirsad AI KYC callback payload.
 * Mirsad AI POSTs this to our callback_url when processing completes.
 *
 * Reference: mirsad-ai-integration.md — MirsadCallbackResponse interface
 */
export class MirsadKycCallbackDto {
  /** The request_id returned from the initial onboarding submission */
  @IsString()
  @IsNotEmpty()
  request_id!: string;

  /** Final KYC decision */
  @IsString()
  @IsNotEmpty()
  @IsIn(["approved", "rejected", "on_hold"])
  status!: "approved" | "rejected" | "on_hold";
}
