import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { KycService } from "../services/kyc.service";
import { OnboardingService } from "../services/onboarding.service";
import { MirsadKycCallbackDto } from "../dto/kyc-callback.dto";

/**
 * Standard API envelope for all responses.
 */
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  timestamp: string;
}

/**
 * KYC Webhook Controller — handles Mirsad AI async callbacks.
 *
 * Mirsad AI processes KYC/KYB requests asynchronously and POSTs results
 * to the callback_url provided during submission. This controller receives
 * those callbacks and triggers the appropriate post-KYC actions.
 *
 * Endpoints:
 *   POST /api/v1/webhooks/mirsad-kyc-callback — Receive KYC completion callback
 *
 * Security notes:
 * - This is a public endpoint (no JWT required) because Mirsad AI POSTs directly
 * - Request validation: we verify request_id matches a known pending KYC
 * - Idempotent: safe to receive duplicate callbacks (checked by kycCompletedAt)
 * - In production, add HMAC signature verification if Mirsad AI supports it
 *
 * Reference: mirsad-ai-integration.md — Callback Response section
 */
@Controller("api/v1/webhooks")
export class KycWebhookController {
  private readonly logger = new Logger(KycWebhookController.name);

  constructor(
    private readonly kycService: KycService,
    private readonly onboardingService: OnboardingService,
  ) {}

  /**
   * POST /api/v1/webhooks/mirsad-kyc-callback
   *
   * Receive KYC verification result from Mirsad AI.
   * Always returns HTTP 200 to prevent Mirsad AI from retrying.
   *
   * If status is 'approved', triggers the full onboarding flow:
   * - Mint DID NFT
   * - Create HCS topics
   * - Activate user
   *
   * If status is 'rejected', updates user status to allow resubmission.
   * If status is 'on_hold', keeps user in kyc_submitted state.
   */
  @Post("mirsad-kyc-callback")
  @HttpCode(HttpStatus.OK)
  async handleMirsadKycCallback(
    @Body() payload: MirsadKycCallbackDto,
  ): Promise<ApiResponse<{ acknowledged: boolean }>> {
    this.logger.log(
      `Mirsad AI KYC callback received: request_id=${payload.request_id}, status=${payload.status}`,
    );

    try {
      // Step 1: Update KYC status in database
      const user = await this.kycService.handleKycCallback(
        payload.request_id,
        payload.status,
      );

      // Step 2: If approved, trigger full onboarding (DID NFT + topics)
      if (payload.status === "approved" && user.status !== "active") {
        this.logger.log(
          `KYC approved for user ${user.id} — triggering onboarding flow`,
        );

        try {
          const result = await this.onboardingService.completeOnboarding(
            user.id,
          );
          this.logger.log(
            `Onboarding complete for user ${user.id}: ` +
              `DID NFT serial=${result.didNft.serial}, ` +
              `feed=${result.topics.publicFeedTopic}, ` +
              `notifications=${result.topics.notificationTopic}`,
          );
        } catch (onboardingError: unknown) {
          // Log the error but still return 200 to Mirsad AI.
          // The KYC status is already updated; onboarding can be retried.
          const message =
            onboardingError instanceof Error
              ? onboardingError.message
              : "Unknown onboarding error";
          this.logger.error(
            `Onboarding failed for user ${user.id} after KYC approval: ${message}. ` +
              `KYC status is saved — onboarding can be retried.`,
          );
        }
      }

      return {
        success: true,
        data: { acknowledged: true },
        error: null,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      // Even on error, return 200 to prevent Mirsad AI from endlessly retrying.
      // The error is logged for investigation.
      const message =
        error instanceof Error ? error.message : "Unknown callback error";
      this.logger.error(
        `KYC callback processing failed for request_id=${payload.request_id}: ${message}`,
      );

      return {
        success: true,
        data: { acknowledged: true },
        error: null,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
