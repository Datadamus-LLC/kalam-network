import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
} from "@nestjs/common";
import { ThrottlerGuard, Throttle } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import type {
  RegisterResponseDto,
  AuthResponseDto,
  RefreshResponseDto,
} from "./dto/auth-response.dto";

interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string } | null;
  timestamp: string;
}

@Controller("api/v1/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /api/v1/auth/register
   * Register a new user with email and/or phone.
   * Sends a 6-digit OTP for verification.
   * Rate limited: 5 requests per 60 seconds.
   */
  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async register(
    @Body() registerDto: RegisterDto,
  ): Promise<ApiEnvelope<RegisterResponseDto>> {
    const result = await this.authService.register(registerDto);
    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/auth/login
   * Send OTP to an existing user's email or phone.
   * Rate limited: 5 requests per 60 seconds.
   */
  @Post("login")
  @HttpCode(HttpStatus.OK)
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async login(
    @Body() loginDto: RegisterDto,
  ): Promise<ApiEnvelope<RegisterResponseDto>> {
    const result = await this.authService.login(loginDto);
    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/auth/verify-otp
   * Verify the OTP sent during registration.
   * Returns JWT access and refresh tokens on success.
   */
  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  async verifyOtp(
    @Body() verifyOtpDto: VerifyOtpDto,
  ): Promise<ApiEnvelope<AuthResponseDto>> {
    const result = await this.authService.verifyOtp(verifyOtpDto);
    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/auth/refresh
   * Refresh an expired access token using a valid refresh token.
   */
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() refreshTokenDto: RefreshTokenDto,
  ): Promise<ApiEnvelope<RefreshResponseDto>> {
    const result = await this.authService.refreshToken(
      refreshTokenDto.refreshToken,
    );
    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
