import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { ProfileService, SearchResultItem } from "../services/profile.service";
import { SearchUsersDto } from "../dto/search-users.dto";

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
 * UsersSearchController — Handles user search by display name, accountId, or email.
 *
 * Endpoints:
 *   GET /api/v1/users/search?q=...&limit=...  — Search users (requires JWT)
 *
 * Used for:
 * - Finding people to add to group conversations
 * - Finding people to follow
 * - Mentioning users in posts
 *
 * Uses PostgreSQL ILIKE on displayName, username, and hederaAccountId.
 * Consider Meilisearch or Elasticsearch for production at scale.
 *
 * Reference: tasks/phase-1-identity/P1-T12-profile-crud.md
 */
@Controller("api/v1/users")
@UseGuards(JwtAuthGuard)
export class UsersSearchController {
  private readonly logger = new Logger(UsersSearchController.name);

  constructor(private readonly profileService: ProfileService) {}

  /**
   * GET /api/v1/users/search?q=...&limit=...
   *
   * Search users by display name, Hedera account ID, or email.
   * Requires JWT authentication.
   *
   * Query parameters:
   * - q: Search query (minimum 2 characters, max 100, required)
   * - limit: Max results (default 20, max 100)
   *
   * Returns array of matching user profiles with social stats.
   */
  @Get("search")
  @HttpCode(HttpStatus.OK)
  async searchUsers(
    @Query() dto: SearchUsersDto,
  ): Promise<ApiResponse<SearchResultItem[]>> {
    const parsedLimit = dto.limit ? parseInt(dto.limit, 10) : 20;
    const sanitizedLimit = Number.isNaN(parsedLimit)
      ? 20
      : Math.min(Math.max(parsedLimit, 1), 100);

    this.logger.log(
      `Searching users for "${dto.q}" (limit: ${sanitizedLimit})`,
    );

    const results = await this.profileService.searchUsers(
      dto.q,
      sanitizedLimit,
    );

    return {
      success: true,
      data: results,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
