import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import {
  KycService,
  type KycSubmissionResult,
  type KycStatusInfo,
} from "../services/kyc.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type { JwtPayload } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import {
  IndividualKycSubmitDto,
  CorporateKycSubmitDto,
} from "../dto/kyc-submit.dto";

/**
 * Standard API envelope response.
 */
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
  } | null;
  timestamp: string;
}

/**
 * KycController — Handles KYC submission and status queries.
 *
 * Endpoints:
 *   POST /api/v1/identity/kyc/individual  — Submit individual KYC data
 *   POST /api/v1/identity/kyc/corporate   — Submit corporate KYC/KYB data
 *   GET  /api/v1/identity/kyc/status      — Get KYC submission status
 *
 * All endpoints require JWT authentication.
 * Users must be in 'pending_kyc' or 'kyc_rejected' status to submit.
 *
 * Reference: mirsad-ai-integration.md
 */
@Controller("api/v1/identity/kyc")
@UseGuards(JwtAuthGuard)
export class KycController {
  private readonly logger = new Logger(KycController.name);

  constructor(private readonly kycService: KycService) {}

  /**
   * POST /api/v1/identity/kyc/individual
   *
   * Submit individual KYC data to Mirsad AI for verification.
   * The user must be in 'pending_kyc' or 'kyc_rejected' status.
   *
   * On success, user status transitions to 'kyc_submitted'.
   * Mirsad AI will asynchronously POST a callback to the webhook endpoint.
   */
  @Post("individual")
  @HttpCode(HttpStatus.ACCEPTED)
  async submitIndividualKyc(
    @CurrentUser() user: JwtPayload,
    @Body() dto: IndividualKycSubmitDto,
  ): Promise<ApiResponse<KycSubmissionResult>> {
    this.logger.log(`POST /identity/kyc/individual — user: ${user.sub}`);

    const result = await this.kycService.submitIndividualKyc(user.sub, dto);

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/identity/kyc/corporate
   *
   * Submit corporate KYC/KYB data to Mirsad AI for verification.
   * The user must be in 'pending_kyc' or 'kyc_rejected' status.
   *
   * On success, user status transitions to 'kyc_submitted' and
   * accountType transitions to 'business'.
   */
  @Post("corporate")
  @HttpCode(HttpStatus.ACCEPTED)
  async submitCorporateKyc(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CorporateKycSubmitDto,
  ): Promise<ApiResponse<KycSubmissionResult>> {
    this.logger.log(`POST /identity/kyc/corporate — user: ${user.sub}`);

    const result = await this.kycService.submitCorporateKyc(user.sub, dto);

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/identity/kyc/status
   *
   * Get the current KYC submission status for the authenticated user.
   * Returns request_id, submission timestamps, and whether resubmission is allowed.
   */
  @Get("status")
  async getKycStatus(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<KycStatusInfo>> {
    this.logger.log(`GET /identity/kyc/status — user: ${user.sub}`);

    const status = await this.kycService.getKycStatus(user.sub);

    return {
      success: true,
      data: status,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
