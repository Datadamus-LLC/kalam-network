import { InternalServerErrorException } from "@nestjs/common";

/**
 * Thrown when the Resend API fails to deliver an OTP email.
 */
export class EmailDeliveryException extends InternalServerErrorException {
  constructor(recipient: string, cause?: unknown) {
    super(`Failed to deliver OTP email to ${recipient}`, {
      cause,
      description: "EMAIL_DELIVERY_FAILED",
    });
  }
}
