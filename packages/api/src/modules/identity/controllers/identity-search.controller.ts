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
 * IdentitySearchController — Alias for user search at /api/v1/identity/search.
 *
 * This provides a convenience alias so clients can search via either:
 *   GET /api/v1/users/search?q=...   (primary, via UsersSearchController)
 *   GET /api/v1/identity/search?q=... (alias, via this controller)
 *
 * Both return identical results.
 */
@Controller("api/v1/identity")
@UseGuards(JwtAuthGuard)
export class IdentitySearchController {
  private readonly logger = new Logger(IdentitySearchController.name);

  constructor(private readonly profileService: ProfileService) {}

  /**
   * GET /api/v1/identity/search?q=...&limit=...
   *
   * Alias for GET /api/v1/users/search. Searches users by display name,
   * Hedera account ID, or email.
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
      `Searching users (identity alias) for "${dto.q}" (limit: ${sanitizedLimit})`,
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
