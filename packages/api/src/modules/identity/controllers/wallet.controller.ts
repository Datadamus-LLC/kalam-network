import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { IsString, IsNotEmpty } from "class-validator";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import {
  WalletService,
  WalletCreationResult,
  WalletStatusResult,
  EncryptionKeyResult,
} from "../services/wallet.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import type { JwtPayload } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";

/**
 * Standard API envelope response.
 */
interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  timestamp: string;
}

/**
 * Wallet creation response includes fresh tokens with hederaAccountId.
 */
interface WalletCreationResponse extends WalletCreationResult {
  accessToken: string;
  refreshToken: string;
}

/**
 * WalletController — Handles Hedera wallet creation and status.
 *
 * Endpoints:
 *   POST /api/v1/wallet/create  — Create a new Hedera wallet (JWT required)
 *   GET  /api/v1/wallet/status  — Get wallet status (JWT required)
 *
 * Reference: tasks/phase-1-identity/P1-T10-wallet-creation.md
 */
@Controller("api/v1/wallet")
export class WalletController {
  private readonly logger = new Logger(WalletController.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /api/v1/wallet/create
   *
   * Create a Hedera wallet for the authenticated user.
   * Uses Tamam MPC Custody if configured, otherwise local ED25519 fallback.
   * Returns fresh JWT tokens that include the new hederaAccountId.
   *
   * Requires: Valid JWT token in Authorization header.
   *
   * @returns Created wallet info with Hedera account ID and fresh tokens
   */
  @Post("create")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createWallet(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<WalletCreationResponse>> {
    this.logger.log(`Wallet creation requested by user ${user.sub}`);

    const result = await this.walletService.createWallet(user.sub);

    // Issue fresh tokens with the new hederaAccountId
    const tokenPayload = {
      sub: user.sub,
      identifier: user.identifier,
      hederaAccountId: result.hederaAccountId,
    };

    const accessToken = this.jwtService.sign(tokenPayload);

    const refreshSecret = this.configService.get<string>("jwt.refreshSecret");
    const refreshExpiresIn = this.configService.get<string>(
      "jwt.refreshExpiresIn",
      "30d",
    );
    const refreshToken = this.jwtService.sign(tokenPayload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn,
    });

    this.logger.log(
      `Fresh tokens issued for user ${user.sub} with hederaAccountId ${result.hederaAccountId}`,
    );

    return {
      success: true,
      data: {
        ...result,
        accessToken,
        refreshToken,
      },
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/wallet/status
   *
   * Get the wallet status for the authenticated user.
   *
   * Requires: Valid JWT token in Authorization header.
   *
   * @returns Wallet status info
   */
  @Get("status")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getWalletStatus(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<WalletStatusResult>> {
    this.logger.log(`Wallet status requested by user ${user.sub}`);

    const result = await this.walletService.getWalletStatus(user.sub);

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/wallet/encryption-key
   *
   * Ensure the authenticated user has an X25519 encryption keypair
   * for E2E encrypted messaging. If the user already has one, returns it.
   * If not, generates a new keypair and stores the public key.
   *
   * This endpoint is idempotent — calling it multiple times is safe.
   *
   * Requires: Valid JWT token in Authorization header.
   *
   * @returns Encryption key result with public key and whether it was newly generated
   */
  @Post("encryption-key")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async ensureEncryptionKey(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<EncryptionKeyResult & { encryptedBackup?: string }>> {
    this.logger.log(`Encryption key requested by user ${user.sub}`);
    const result = await this.walletService.ensureEncryptionKey(user.sub);
    return { success: true, data: result, error: null, timestamp: new Date().toISOString() };
  }

  /**
   * PUT /api/v1/wallet/encryption-key/backup
   * Store a PIN-encrypted private key backup (client encrypts, server stores opaquely).
   */
  @Put("encryption-key/backup")
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async storeKeyBackup(
    @CurrentUser() user: JwtPayload,
    @Body() body: { encryptedBackup: string },
  ): Promise<ApiResponse<{ stored: boolean }>> {
    await this.walletService.storeKeyBackup(user.sub, body.encryptedBackup);
    return { success: true, data: { stored: true }, error: null, timestamp: new Date().toISOString() };
  }

  /**
   * GET /api/v1/wallet/encryption-key/backup
   * Retrieve the PIN-encrypted private key backup for new device login.
   */
  @Get("encryption-key/backup")
  @UseGuards(JwtAuthGuard)
  async getKeyBackup(
    @CurrentUser() user: JwtPayload,
  ): Promise<ApiResponse<{ encryptedBackup: string | null }>> {
    const encryptedBackup = await this.walletService.getKeyBackup(user.sub);
    return { success: true, data: { encryptedBackup }, error: null, timestamp: new Date().toISOString() };
  }
}
