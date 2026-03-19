import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ProfileService,
  PublicProfileData,
  OwnProfileData,
} from "../services/profile.service";
import { UpdateProfileDto } from "../dto/update-profile.dto";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type { JwtPayload } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";

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
 * ProfileController — Handles profile viewing, updating, and user search.
 *
 * Endpoints:
 *   GET  /api/v1/profile/me              — Get own profile (JWT required)
 *   GET  /api/v1/profile/:accountId      — Get public profile by Hedera Account ID
 *   PUT  /api/v1/profile/me              — Update own profile (JWT required, multipart)
 *
 * Note: The /me routes MUST be registered before /:accountId to avoid
 * "me" being parsed as an accountId parameter.
 *
 * Reference: tasks/phase-1-identity/P1-T12-profile-crud.md
 */
@Controller("api/v1/profile")
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(private readonly profileService: ProfileService) {}

  /**
   * GET /api/v1/profile/me
   *
   * Get the authenticated user's own profile.
   * Returns all public fields plus private fields (email, phone).
   *
   * Requires: Valid JWT token in Authorization header.
   */
  @Get("me")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyProfile(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<OwnProfileData>> {
    this.logger.log(`Getting own profile for user ${user.sub}`);

    const profile = await this.profileService.getMyProfile(user.sub);

    return {
      success: true,
      data: profile,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * PUT /api/v1/profile/me
   *
   * Update the authenticated user's profile.
   * Accepts multipart/form-data with optional avatar file.
   *
   * When profile changes, automatically refreshes the DID NFT:
   * - Wipes old NFT
   * - Mints new NFT with updated metadata
   * - Freezes new NFT (soulbound)
   *
   * Requires: Valid JWT token. User must be in 'active' status.
   */
  @Put("me")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor("avatarFile"))
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ): Promise<ApiResponse<PublicProfileData>> {
    this.logger.log(
      `Updating profile for user ${user.sub}${avatarFile ? " (with avatar)" : ""}`,
    );

    const profile = await this.profileService.updateProfile(user.sub, {
      displayName: dto.displayName,
      bio: dto.bio,
      location: dto.location,
      encryptionPublicKey: dto.encryptionPublicKey,
      username: dto.username,
      avatarFile: avatarFile
        ? {
            buffer: avatarFile.buffer,
            mimetype: avatarFile.mimetype,
            originalname: avatarFile.originalname,
          }
        : undefined,
    });

    return {
      success: true,
      data: profile,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/profile/check-username/:username
   *
   * Public availability check for a username.
   * Returns { available: true } if the handle is valid and unclaimed.
   * No authentication required.
   *
   * Note: This route MUST be registered before /:accountId so that
   * the literal segment "check-username" is not parsed as an accountId.
   */
  @Get("check-username/:username")
  @HttpCode(HttpStatus.OK)
  async checkUsername(
    @Param("username") username: string,
  ): Promise<ApiResponse<{ available: boolean }>> {
    const result =
      await this.profileService.checkUsernameAvailability(username);

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/profile/:accountId
   *
   * Get a public profile by Hedera Account ID.
   * Public endpoint — no authentication required.
   *
   * Returns: identity info, DID NFT details, topic IDs, social stats.
   */
  @Get(":accountId")
  @HttpCode(HttpStatus.OK)
  async getPublicProfile(
    @Param("accountId") accountId: string,
  ): Promise<ApiResponse<PublicProfileData>> {
    this.logger.log(`Getting public profile for ${accountId}`);

    const profile = await this.profileService.getPublicProfile(accountId);

    return {
      success: true,
      data: profile,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
