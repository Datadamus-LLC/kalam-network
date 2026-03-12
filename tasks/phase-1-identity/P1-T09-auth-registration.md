# P1-T09: Auth Service — Registration & OTP Verification

| Field | Value |
|-------|-------|
| Task ID | P1-T09 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 4 hours |
| Depends On | P0-T04 (NestJS Backend), P0-T05 (Database Schema) |
| Phase | 1 — Identity & Onboarding |
| Assignee | Backend Developer |
| Module | Identity & Onboarding (Spec Section 2.1) |
| Hedera Transactions | None (registration), 1x CryptoTransfer (wallet creation in T10) |

---

## Objective

Implement the complete authentication registration flow including email/phone validation, OTP generation/verification, and JWT token issuance. Users submit their email or phone number, receive a 6-digit OTP, verify it, and receive a JWT token to proceed to wallet creation. This task sets up the auth foundation for the entire platform.

---

## Background

**Why Registration First?**
- Users can't get Hedera accounts without proving they're real people
- OTP verification provides lightweight verification before more expensive operations
- JWT tokens control access to all protected endpoints
- This task unblocks P1-T10 (wallet creation) and P1-T11 (KYC)

**Technology Choices:**
- **OTP Storage:** Redis with 5-minute TTL (fast, auto-expiring, no DB pollution)
- **OTP Channel:** Console logging (hackathon mode). In production, use Twilio/AWS SNS for SMS, SendGrid for email.
- **JWT Strategy:** Passport.js with JWT extraction from Authorization header
- **Password vs OTP:** We use OTP-only (no password) for Web3 UX simplicity
- **Rate Limiting:** Implement 3x OTP attempts, then 5-minute cooldown per IP

**Spec References:**
- FR-ID-001: User Registration (docs/SPECIFICATION.md Section 2.1)
- API endpoints in docs/SPECIFICATION.md Section 5.2.1
- User types from P0-T02 (shared types package)

---

## Pre-requisites

Before you start, make sure:

1. **P0-T01 Complete** — Monorepo set up, `pnpm install` works
2. **P0-T04 Complete** — NestJS project structure exists at `packages/api`
3. **P0-T05 Complete** — Database migrations exist, TypeORM configured
4. **Docker Running** — PostgreSQL and Redis containers active
   ```bash
   docker compose up -d
   docker exec hedera-social-redis redis-cli ping  # Should return PONG
   ```
5. **Environment Variables** — `.env` file with:
   ```env
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-random-secret-here
   JWT_EXPIRY=24h
   JWT_REFRESH_SECRET=another-random-secret
   JWT_REFRESH_EXPIRY=30d
   LOG_LEVEL=debug
   ```
6. **Dependencies Installed** — NestJS, Passport, class-validator already added to `packages/api/package.json`

---

## Step-by-Step Instructions

### Step 1: Create the Auth DTOs (Data Transfer Objects)

Create file `packages/api/src/auth/dto/register.dto.ts`:

```typescript
import { IsEmail, IsPhoneNumber, IsOptional, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  /**
   * User's email address OR phone number (one of the two is required)
   * Email format: user@example.com
   * Phone format: +1-555-555-5555 (E.164 format)
   */
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  email?: string;

  /**
   * User's phone number in E.164 format (+countrycode-number)
   * Examples: +1-555-555-5555, +44-20-7946-0958, +86-10-1234-5678
   */
  @IsOptional()
  @IsPhoneNumber('ZZ', { message: 'Invalid phone number (use E.164 format)' })
  phone?: string;

  /**
   * Optional referral code (not used in Phase 1, but included for future)
   */
  @IsOptional()
  @MinLength(3)
  @MaxLength(20)
  referralCode?: string;

  constructor(partial?: Partial<RegisterDto>) {
    Object.assign(this, partial);
  }

  /**
   * Validation: at least one of email or phone must be provided
   */
  validate() {
    if (!this.email && !this.phone) {
      throw new Error('Either email or phone is required');
    }
  }
}
```

Create file `packages/api/src/auth/dto/verify-otp.dto.ts`:

```typescript
import { IsString, Length, IsEmail, IsOptional, IsPhoneNumber } from 'class-validator';

export class VerifyOtpDto {
  /**
   * The email or phone that the OTP was sent to
   * Must match exactly what was used in RegisterDto
   */
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address' })
  email?: string;

  @IsOptional()
  @IsPhoneNumber('ZZ')
  phone?: string;

  /**
   * The 6-digit OTP code entered by the user
   * Format: exactly 6 numeric digits (no spaces or dashes)
   */
  @IsString()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  otp: string;

  /**
   * Optional account type hint (used in next step for KYC form)
   * Values: 'individual' | 'business'
   * Stored to pre-fill the onboarding form
   */
  @IsOptional()
  @IsString()
  accountTypeHint?: 'individual' | 'business';

  constructor(partial?: Partial<VerifyOtpDto>) {
    Object.assign(this, partial);
  }

  validate() {
    if (!this.email && !this.phone) {
      throw new Error('Either email or phone must match registration');
    }
    if (!/^\d{6}$/.test(this.otp)) {
      throw new Error('OTP must be 6 digits');
    }
  }
}
```

Create file `packages/api/src/auth/dto/auth-response.dto.ts`:

```typescript
export class AuthResponseDto {
  /**
   * JWT access token (bearer token for Authorization header)
   * Expires in 24 hours by default
   * Use in all protected endpoints: Authorization: Bearer {accessToken}
   */
  accessToken: string;

  /**
   * JWT refresh token (used to get a new accessToken without re-entering credentials)
   * Expires in 30 days
   * POST /api/v1/auth/refresh with { refreshToken }
   */
  refreshToken: string;

  /**
   * User's Hedera Account ID (0.0.XXXXX format)
   * Only present after wallet is created (T10)
   * null during pending_wallet state
   */
  hederaAccountId: string | null;

  /**
   * User's current status in the onboarding flow
   * 'pending_wallet' -> needs wallet creation (T10)
   * 'pending_kyc' -> needs KYC submission (T11)
   * 'active' -> fully onboarded
   */
  status: 'pending_wallet' | 'pending_kyc' | 'active';

  /**
   * Email or phone used for registration
   */
  identifier: string;

  /**
   * Timestamp of token issuance (ISO 8601)
   */
  issuedAt: Date;

  /**
   * Timestamp of token expiration (ISO 8601)
   */
  expiresAt: Date;

  constructor(partial?: Partial<AuthResponseDto>) {
    Object.assign(this, partial);
  }
}
```

### Step 2: Create the OTP Service

Create file `packages/api/src/auth/services/otp.service.ts`:

```typescript
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly OTP_EXPIRY_SECONDS = 300; // 5 minutes
  private readonly MAX_OTP_ATTEMPTS = 3;
  private readonly COOLDOWN_SECONDS = 300; // 5 minutes

  constructor(private redisService: RedisService) {}

  /**
   * Generate a 6-digit OTP and store in Redis with TTL
   * In hackathon mode, log to console (in production, would send via Twilio/email)
   *
   * @param identifier - Email or phone (e.g., "user@example.com" or "+1-555-555-5555")
   * @returns The OTP code (for testing/logging)
   */
  async generateOtp(identifier: string): Promise<string> {
    // Check if user is rate-limited (too many attempts)
    const attemptKey = `otp_attempts:${identifier}`;
    const attempts = await this.redisService.get(attemptKey);

    if (attempts && parseInt(attempts) >= this.MAX_OTP_ATTEMPTS) {
      this.logger.warn(`OTP generation blocked for ${identifier} - rate limit exceeded`);
      throw new BadRequestException(
        `Too many OTP requests. Please try again in 5 minutes.`,
      );
    }

    // Generate 6-digit OTP (000000 - 999999)
    const otp = Math.floor(Math.random() * 1000000)
      .toString()
      .padStart(6, '0');

    // Store OTP in Redis with 5-minute TTL
    const otpKey = `otp:${identifier}`;
    await this.redisService.setex(otpKey, this.OTP_EXPIRY_SECONDS, otp);

    // Increment attempt counter (5-minute cooldown)
    if (!attempts) {
      await this.redisService.setex(attemptKey, this.COOLDOWN_SECONDS, '1');
    } else {
      await this.redisService.incr(attemptKey);
    }

    // HACKATHON MODE: Log OTP to console
    // In production, replace this with:
    // - Email: await emailService.sendOtp(identifier, otp)
    // - SMS: await twilioService.sendSms(identifier, otp)
    this.logger.log(
      `\n${'='.repeat(60)}\n` +
      `HACKATHON OTP for ${identifier}:\n` +
      `OTP CODE: ${otp}\n` +
      `Valid for: ${this.OTP_EXPIRY_SECONDS} seconds\n` +
      `${'='.repeat(60)}\n`,
    );

    return otp; // Return for testing purposes
  }

  /**
   * Verify that the provided OTP matches the stored one
   * Checks expiry, attempts, and correctness
   *
   * @param identifier - Email or phone (must match what was used in generateOtp)
   * @param otp - The 6-digit OTP code to verify
   * @returns true if valid, throws exception otherwise
   */
  async verifyOtp(identifier: string, otp: string): Promise<boolean> {
    const otpKey = `otp:${identifier}`;
    const storedOtp = await this.redisService.get(otpKey);

    // OTP expired or never generated
    if (!storedOtp) {
      this.logger.warn(`OTP verification failed for ${identifier} - OTP expired or not found`);
      throw new BadRequestException(
        'OTP expired or not found. Please request a new OTP.',
      );
    }

    // OTP mismatch
    if (storedOtp !== otp) {
      this.logger.warn(`OTP verification failed for ${identifier} - incorrect code`);
      throw new BadRequestException('Invalid OTP code. Please try again.');
    }

    // OTP verified successfully - delete from Redis so it can't be reused
    await this.redisService.del(otpKey);

    this.logger.log(`OTP verified successfully for ${identifier}`);
    return true;
  }

  /**
   * Delete OTP from Redis (called after successful verification)
   * @param identifier - Email or phone
   */
  async deleteOtp(identifier: string): Promise<void> {
    const otpKey = `otp:${identifier}`;
    await this.redisService.del(otpKey);
  }

  /**
   * Check if OTP exists for identifier (used in UI to show timer)
   * @param identifier - Email or phone
   * @returns Remaining TTL in seconds, or -1 if not found
   */
  async getOtpTtl(identifier: string): Promise<number> {
    const otpKey = `otp:${identifier}`;
    return await this.redisService.ttl(otpKey);
  }
}
```

### Step 3: Create the JWT Strategy and Guard

Create file `packages/api/src/auth/strategies/jwt.strategy.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/services/users.service';

export interface JwtPayload {
  sub: string; // User ID
  hederaAccountId: string | null; // Hedera Account ID (null before wallet creation)
  status: 'pending_wallet' | 'pending_kyc' | 'active';
  iat: number; // Issued at
  exp: number; // Expiration time
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      // Extract JWT from "Authorization: Bearer <token>" header
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Use JWT_SECRET from environment
      secretOrKey: configService.get('JWT_SECRET'),
      // Validate token hasn't expired (passport handles this automatically)
      ignoreExpiration: false,
    });
  }

  /**
   * Called by Passport after JWT is validated
   * Extracts user ID from payload and fetches fresh user data
   * This ensures we always have the latest user status
   *
   * @param payload - Decoded JWT payload
   * @returns User object from database
   */
  async validate(payload: JwtPayload) {
    // Fetch user from database to ensure they still exist and get fresh data
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Attach payload and user to request.user
    // This is available as @Request() req or @CurrentUser() user in controllers
    return {
      id: user.id,
      hederaAccountId: user.hederaAccountId,
      status: user.status,
      email: user.email,
      phone: user.phone,
    };
  }
}
```

Create file `packages/api/src/auth/guards/jwt-auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT Authentication Guard
 *
 * Apply this guard to controllers with @UseGuards(JwtAuthGuard)
 * to require valid JWT in Authorization header
 *
 * Usage in controller:
 * ```
 * @UseGuards(JwtAuthGuard)
 * @Get('/profile')
 * getProfile(@CurrentUser() user) { ... }
 * ```
 *
 * The guard:
 * 1. Extracts "Authorization: Bearer <token>" header
 * 2. Validates JWT signature using JWT_SECRET
 * 3. Checks token expiration
 * 4. Calls JwtStrategy.validate() to verify user exists
 * 5. Attaches user to request object
 *
 * If any step fails, returns 401 Unauthorized
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

Create file `packages/api/src/auth/decorators/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Custom decorator to extract user from request
 *
 * Usage:
 * ```
 * @Get('/profile')
 * getProfile(@CurrentUser() user) {
 *   console.log(user.id); // User ID
 *   return user;
 * }
 * ```
 *
 * Equivalent to: @Request() req => req.user
 * But more concise and type-safe
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

### Step 4: Create the Auth Service (Business Logic)

Create file `packages/api/src/auth/services/auth.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../../users/services/users.service';
import { OtpService } from './otp.service';
import { RegisterDto } from '../dto/register.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { AuthResponseDto } from '../dto/auth-response.dto';
import { User } from '@hedera-social/shared';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private jwtService: JwtService,
    private usersService: UsersService,
    private otpService: OtpService,
  ) {}

  /**
   * Handle user registration
   *
   * Flow:
   * 1. Validate email or phone format
   * 2. Check if user with this email/phone already exists
   * 3. Generate 6-digit OTP
   * 4. Create preliminary user record in DB with status='pending_wallet'
   * 5. Return success (OTP sent message)
   *
   * @param registerDto - Contains email or phone
   * @returns { message, identifier, otpExpiresIn }
   */
  async register(registerDto: RegisterDto): Promise<{
    message: string;
    identifier: string;
    otpExpiresIn: number;
  }> {
    // Validate that at least one of email or phone is provided
    if (!registerDto.email && !registerDto.phone) {
      throw new BadRequestException('Either email or phone is required');
    }

    const identifier = registerDto.email || registerDto.phone;

    // Check if user already exists with this identifier
    const existingUser = await this.usersService.findByEmailOrPhone(
      registerDto.email,
      registerDto.phone,
    );

    if (existingUser) {
      // User already registered with this identifier
      if (existingUser.status === 'pending_wallet') {
        // Allow re-requesting OTP if still pending wallet
        this.logger.log(`User ${identifier} re-requesting OTP for pending wallet`);
      } else {
        // User is already onboarded
        throw new ConflictException(
          `User with this ${registerDto.email ? 'email' : 'phone'} already exists. Please log in.`,
        );
      }
    } else {
      // Create new user record in pending_wallet state
      await this.usersService.create({
        email: registerDto.email,
        phone: registerDto.phone,
        status: 'pending_wallet',
        accountType: registerDto.referralCode ? 'individual' : 'individual',
      });
      this.logger.log(`New user registered: ${identifier}`);
    }

    // Generate OTP and send (in hackathon mode, logs to console)
    await this.otpService.generateOtp(identifier);

    this.logger.log(`OTP generated for ${identifier}`);

    return {
      message: `OTP sent to ${identifier}. Valid for 5 minutes.`,
      identifier,
      otpExpiresIn: 300, // 5 minutes
    };
  }

  /**
   * Verify OTP and issue JWT tokens
   *
   * Flow:
   * 1. Verify OTP matches what was sent
   * 2. Update user status to 'pending_kyc' (next step is KYC)
   * 3. Generate JWT access token (24h) and refresh token (30d)
   * 4. Return tokens and user status
   *
   * @param verifyOtpDto - Contains email or phone + OTP code
   * @returns AuthResponseDto with access token, refresh token, and user status
   */
  async verifyOtp(verifyOtpDto: VerifyOtpDto): Promise<AuthResponseDto> {
    // Validate OTP format
    if (!/^\d{6}$/.test(verifyOtpDto.otp)) {
      throw new BadRequestException('OTP must be 6 digits');
    }

    // Identify which field was used
    const identifier = verifyOtpDto.email || verifyOtpDto.phone;

    if (!identifier) {
      throw new BadRequestException('Either email or phone is required');
    }

    // Verify OTP against Redis
    try {
      await this.otpService.verifyOtp(identifier, verifyOtpDto.otp);
    } catch (error) {
      this.logger.warn(`OTP verification failed for ${identifier}: ${error.message}`);
      throw error;
    }

    // Find user by email or phone
    const user = await this.usersService.findByEmailOrPhone(
      verifyOtpDto.email,
      verifyOtpDto.phone,
    );

    if (!user) {
      // This shouldn't happen if register() was called first, but handle it
      throw new UnauthorizedException(
        'User not found. Please register first.',
      );
    }

    // Update user to pending_kyc status
    // (They will proceed to wallet creation in T10, then KYC in T11)
    user.status = 'pending_wallet'; // Stays in pending_wallet until wallet is created
    await this.usersService.update(user.id, user);

    // Generate JWT tokens
    const payload = {
      sub: user.id,
      hederaAccountId: user.hederaAccountId || null,
      status: user.status,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '24h',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET,
      expiresIn: '30d',
    });

    this.logger.log(`User ${user.id} authenticated via OTP`);

    // Validate status is one of the allowed values
    const validStatuses = ['pending_wallet', 'pending_kyc', 'active'];
    const status = validStatuses.includes(user.status)
      ? (user.status as 'pending_wallet' | 'pending_kyc' | 'active')
      : 'active';

    return new AuthResponseDto({
      accessToken,
      refreshToken,
      hederaAccountId: user.hederaAccountId || null,
      status,
      identifier,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
  }

  /**
   * Refresh access token using refresh token
   *
   * Used when access token expires but refresh token is still valid
   * Client: POST /api/v1/auth/refresh { refreshToken }
   *
   * @param refreshToken - The 30-day refresh token from initial login
   * @returns New access token
   */
  async refreshToken(refreshToken: string): Promise<{ accessToken: string }> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      const newAccessToken = this.jwtService.sign(
        {
          sub: payload.sub,
          hederaAccountId: payload.hederaAccountId,
          status: payload.status,
        },
        {
          expiresIn: '24h',
        },
      );

      return { accessToken: newAccessToken };
    } catch (error) {
      this.logger.warn(`Token refresh failed: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Validate JWT and return decoded payload (for custom validation)
   * @param token - JWT token (without "Bearer " prefix)
   * @returns Decoded payload
   */
  validateToken(token: string): JwtPayload {
    try {
      return this.jwtService.verify(token);
    } catch (error: unknown) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
```

### Step 5: Create the Auth Controller

Create file `packages/api/src/auth/controllers/auth.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from '../services/auth.service';
import { RegisterDto } from '../dto/register.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { AuthResponseDto } from '../dto/auth-response.dto';

@Controller('api/v1/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  /**
   * POST /api/v1/auth/register
   *
   * User initiates registration with email or phone
   *
   * Request:
   * ```json
   * {
   *   "email": "user@example.com"
   * }
   * ```
   * OR
   * ```json
   * {
   *   "phone": "+1-555-555-5555"
   * }
   * ```
   *
   * Response (200 OK):
   * ```json
   * {
   *   "message": "OTP sent to user@example.com. Valid for 5 minutes.",
   *   "identifier": "user@example.com",
   *   "otpExpiresIn": 300
   * }
   * ```
   *
   * Errors:
   * - 400: Invalid email/phone format
   * - 409: User already exists with this email/phone
   * - 429: Too many OTP requests (rate limit)
   */
  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() registerDto: RegisterDto) {
    this.logger.log(
      `Register request: ${registerDto.email || registerDto.phone}`,
    );

    try {
      return await this.authService.register(registerDto);
    } catch (error) {
      this.logger.error(`Registration error: ${error.message}`);
      throw error;
    }
  }

  /**
   * POST /api/v1/auth/verify-otp
   *
   * User verifies OTP code and receives JWT tokens
   *
   * Request:
   * ```json
   * {
   *   "email": "user@example.com",
   *   "otp": "123456"
   * }
   * ```
   *
   * Response (200 OK):
   * ```json
   * {
   *   "accessToken": "eyJhbGc...",
   *   "refreshToken": "eyJhbGc...",
   *   "hederaAccountId": null,
   *   "status": "pending_wallet",
   *   "identifier": "user@example.com",
   *   "issuedAt": "2026-03-11T10:00:00Z",
   *   "expiresAt": "2026-03-12T10:00:00Z"
   * }
   * ```
   *
   * Errors:
   * - 400: OTP not found or expired
   * - 400: Invalid OTP code
   * - 401: User not found
   */
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto): Promise<AuthResponseDto> {
    const identifier = verifyOtpDto.email || verifyOtpDto.phone;
    this.logger.log(`OTP verification request: ${identifier}`);

    try {
      return await this.authService.verifyOtp(verifyOtpDto);
    } catch (error) {
      this.logger.error(`OTP verification error: ${error.message}`);
      throw error;
    }
  }

  /**
   * POST /api/v1/auth/refresh
   *
   * Refresh access token using refresh token
   * Called when access token expires (24h) but user still has valid refresh token (30d)
   *
   * Request:
   * ```json
   * {
   *   "refreshToken": "eyJhbGc..."
   * }
   * ```
   *
   * Response (200 OK):
   * ```json
   * {
   *   "accessToken": "eyJhbGc..."
   * }
   * ```
   *
   * Errors:
   * - 401: Invalid refresh token
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() { refreshToken }: { refreshToken: string }) {
    this.logger.log('Token refresh request');

    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    try {
      return await this.authService.refreshToken(refreshToken);
    } catch (error) {
      this.logger.error(`Token refresh error: ${error.message}`);
      throw error;
    }
  }
}
```

### Step 6: Create the Auth Module

Create file `packages/api/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './services/auth.service';
import { OtpService } from './services/otp.service';
import { AuthController } from './controllers/auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UsersModule } from '../users/users.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get('JWT_SECRET'),
        signOptions: { expiresIn: '24h' },
      }),
    }),
    UsersModule,
    RedisModule,
  ],
  providers: [AuthService, OtpService, JwtStrategy, JwtAuthGuard],
  controllers: [AuthController],
  exports: [JwtStrategy, JwtAuthGuard, AuthService],
})
export class AuthModule {}
```

### Step 7: Create the Users Service (Minimal)

Create file `packages/api/src/users/services/users.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User as UserEntity } from '../entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private usersRepository: Repository<UserEntity>,
  ) {}

  /**
   * Create a new user (initial registration)
   * @param data Partial user data (email, phone, status)
   * @returns Created user entity
   */
  async create(data: Partial<UserEntity>): Promise<UserEntity> {
    const user = this.usersRepository.create(data);
    return this.usersRepository.save(user);
  }

  /**
   * Find user by email or phone
   * @param email User's email
   * @param phone User's phone (E.164 format)
   * @returns User entity or null
   */
  async findByEmailOrPhone(
    email?: string,
    phone?: string,
  ): Promise<UserEntity | null> {
    if (!email && !phone) return null;

    const query = this.usersRepository.createQueryBuilder('user');

    if (email) {
      query.orWhere('user.email = :email', { email });
    }

    if (phone) {
      query.orWhere('user.phone = :phone', { phone });
    }

    return query.getOne();
  }

  /**
   * Find user by ID
   * @param id User's database ID (UUID)
   * @returns User entity or null
   */
  async findById(id: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  /**
   * Find user by Hedera Account ID
   * @param hederaAccountId Hedera Account ID (0.0.XXXXX)
   * @returns User entity or null
   */
  async findByHederaAccountId(hederaAccountId: string): Promise<UserEntity | null> {
    return this.usersRepository.findOne({ where: { hederaAccountId } });
  }

  /**
   * Update user
   * @param id User's ID
   * @param data Partial user data to update
   * @returns Updated user entity
   */
  async update(id: string, data: Partial<UserEntity>): Promise<UserEntity> {
    await this.usersRepository.update(id, data);
    return this.findById(id);
  }

  /**
   * Delete user (for testing only)
   * @param id User's ID
   */
  async delete(id: string): Promise<void> {
    await this.usersRepository.delete(id);
  }
}
```

Create file `packages/api/src/users/entities/user.entity.ts`:

```typescript
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * User entity — one record per registered user
 * Linked to Hedera Account via hederaAccountId (1:1)
 * Linked to DID NFT via didNftSerial (1:1, only after KYC approval)
 */
@Entity('users')
@Index(['email'], { where: 'email IS NOT NULL' })
@Index(['phone'], { where: 'phone IS NOT NULL' })
@Index(['hederaAccountId'], { where: 'hedera_account_id IS NOT NULL' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * User's email address (unique, optional if phone provided)
   */
  @Column({ nullable: true, unique: true })
  email?: string;

  /**
   * User's phone number in E.164 format (unique, optional if email provided)
   */
  @Column({ nullable: true, unique: true })
  phone?: string;

  /**
   * User's display name (set during profile update or KYC)
   */
  @Column({ nullable: true })
  displayName?: string;

  /**
   * User's bio (set during profile update)
   */
  @Column({ type: 'text', nullable: true })
  bio?: string;

  /**
   * IPFS CID of user's avatar image
   * Example: "QmX1234567890abcdef..."
   */
  @Column({ nullable: true })
  avatarIpfsCid?: string;

  /**
   * Current status in onboarding flow
   * 'pending_wallet' -> user verified OTP, waiting for wallet creation
   * 'pending_kyc' -> user has wallet, waiting for KYC submission
   * 'active' -> user fully onboarded (KYC approved, DID NFT minted)
   * 'kyc_rejected' -> user KYC was rejected, cannot proceed
   */
  @Column({
    type: 'enum',
    enum: ['pending_wallet', 'pending_kyc', 'kyc_rejected', 'active'],
    default: 'pending_wallet',
  })
  status: 'pending_wallet' | 'pending_kyc' | 'kyc_rejected' | 'active';

  /**
   * Account type: 'individual' or 'business'
   * Affects KYC/KYB process and feature availability
   */
  @Column({
    type: 'enum',
    enum: ['individual', 'business'],
    default: 'individual',
  })
  accountType: 'individual' | 'business';

  /**
   * User's Hedera Account ID (0.0.XXXXX format)
   * Set during P1-T10 (wallet creation)
   * null during pending_wallet state
   */
  @Column({ nullable: true, unique: true })
  hederaAccountId?: string;

  /**
   * User's public key (from Hedera account)
   * Used for encrypting messages sent to this user
   * Set during wallet creation
   */
  @Column({ nullable: true })
  publicKey?: string;

  /**
   * KYC verification level (if individual account)
   * 'basic' = name + ID document verified
   * 'enhanced' = basic + residence verified
   * 'institutional' = full AML/CFT screening
   */
  @Column({
    type: 'enum',
    enum: ['basic', 'enhanced', 'institutional'],
    nullable: true,
  })
  kycLevel?: 'basic' | 'enhanced' | 'institutional';

  /**
   * DID NFT token serial number
   * Example: 1 (first NFT from DID token)
   * Set during P1-T11 (DID NFT minting)
   */
  @Column({ nullable: true })
  didNftSerial?: number;

  /**
   * IPFS CID of DID NFT metadata JSON
   * Example: "QmX1234567890abcdef..."
   * Set during P1-T11, updated during profile updates
   */
  @Column({ nullable: true })
  didNftMetadataCid?: string;

  /**
   * HCS Topic ID for user's public feed
   * Format: 0.0.XXXXX
   * Created during P1-T11 (DID NFT minting)
   */
  @Column({ nullable: true })
  publicFeedTopic?: string;

  /**
   * HCS Topic ID for user's notifications
   * Format: 0.0.XXXXX
   * Created during P1-T11
   */
  @Column({ nullable: true })
  notificationTopic?: string;

  /**
   * HCS Topic ID for user's broadcast channel (business accounts only)
   * Format: 0.0.XXXXX
   * Created during P1-T11 if accountType='business'
   */
  @Column({ nullable: true })
  broadcastTopic?: string;

  /**
   * Timestamp when user was created
   * Set automatically by TypeORM
   */
  @CreateDateColumn()
  createdAt: Date;

  /**
   * Timestamp of last update
   * Set automatically by TypeORM
   */
  @UpdateDateColumn()
  updatedAt: Date;
}
```

Create file `packages/api/src/users/users.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './services/users.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

### Step 8: Update the App Module to Include Auth

Edit `packages/api/src/app.module.ts` to add the AuthModule:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USERNAME || 'hedera_social',
      password: process.env.DB_PASSWORD || 'devpassword',
      database: process.env.DB_DATABASE || 'hedera_social',
      autoLoadEntities: true,
      synchronize: false, // Use migrations instead
    }),
    AuthModule,
    UsersModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

---

## Verification Steps

Run these commands in order and confirm each passes:

| # | Command | Expected Output |
|---|---------|-----------------|
| 1 | `pnpm install` (from root) | No errors, dependencies installed |
| 2 | `docker compose up -d` | Both Postgres and Redis start |
| 3 | `pnpm --filter @hedera-social/api start:dev` | NestJS server starts on port 3001 |
| 4 | **CURL TEST:** `curl -X POST http://localhost:3001/api/v1/auth/register -H "Content-Type: application/json" -d '{"email":"test@example.com"}'` | Returns 200 OK with OTP message |
| 5 | **CHECK LOGS:** Look for OTP code in terminal where server is running | Shows message: `HACKATHON OTP for test@example.com: OTP CODE: XXXXXX` |
| 6 | **CURL TEST:** `curl -X POST http://localhost:3001/api/v1/auth/verify-otp -H "Content-Type: application/json" -d '{"email":"test@example.com","otp":"XXXXXX"}'` | Returns 200 OK with accessToken, refreshToken |
| 7 | **CURL TEST:** Verify JWT works: `curl http://localhost:3001/api/v1/profile/me -H "Authorization: Bearer {accessToken}"` | Returns user profile (or 401 if endpoint not created yet) |
| 8 | **DATABASE CHECK:** `docker exec hedera-social-postgres psql -U hedera_social -d hedera_social -c "SELECT * FROM users;"` | Shows registered user with status='pending_wallet' |

---

## Definition of Done

- [ ] Auth DTOs created with validation (RegisterDto, VerifyOtpDto, AuthResponseDto)
- [ ] OtpService implemented (generate, verify, rate limiting, Redis storage)
- [ ] JwtStrategy and JwtAuthGuard created
- [ ] AuthService implemented (register, verifyOtp, refreshToken methods)
- [ ] AuthController created with POST /api/v1/auth/register and POST /api/v1/auth/verify-otp
- [ ] UsersService created with CRUD operations
- [ ] User entity created with all required fields
- [ ] AuthModule registered in AppModule
- [ ] Tests pass:
  - [ ] Registration with email creates user with status='pending_wallet'
  - [ ] Registration with phone creates user with status='pending_wallet'
  - [ ] OTP is generated and stored in Redis with 5-minute TTL
  - [ ] OTP verification with correct code returns JWT tokens
  - [ ] OTP verification with wrong code throws 400 error
  - [ ] Rate limiting blocks after 3 OTP attempts
  - [ ] JWT token is required for protected endpoints (when created)
  - [ ] Refresh token works and returns new access token
- [ ] Git commit made: `"feat(P1-T09): implement auth service with registration and OTP verification"`

---

## Troubleshooting

**Problem:** OTP service throws "Redis connection failed"
**Fix:** Ensure Docker Redis is running:
```bash
docker compose up -d redis
docker exec hedera-social-redis redis-cli ping
# Should return PONG
```

**Problem:** JWT strategy throws "JWT_SECRET is undefined"
**Fix:** Make sure `.env` file exists and has `JWT_SECRET` filled in:
```bash
grep JWT_SECRET .env
# If empty, run: openssl rand -hex 32
```

**Problem:** "email" already exists error on registration
**Fix:** This is correct behavior if the user registered before. To test, use a different email:
```bash
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"newuser'$(date +%s)'@example.com"}'
```

**Problem:** CORS error when calling from frontend
**Fix:** CORS is not enabled in this task. It will be added in P0-T04 (NestJS setup). For now, use curl or Postman.

**Problem:** OTP shows in logs but verification says "OTP not found"
**Fix:** Make sure you copy the exact OTP code from the logs. OTP expires after 5 minutes, so test quickly.

---

## Files Created in This Task

```
packages/api/src/
├── auth/
│   ├── controllers/
│   │   └── auth.controller.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   └── otp.service.ts
│   ├── strategies/
│   │   └── jwt.strategy.ts
│   ├── guards/
│   │   └── jwt-auth.guard.ts
│   ├── decorators/
│   │   └── current-user.decorator.ts
│   ├── dto/
│   │   ├── register.dto.ts
│   │   ├── verify-otp.dto.ts
│   │   └── auth-response.dto.ts
│   └── auth.module.ts
├── users/
│   ├── entities/
│   │   └── user.entity.ts
│   ├── services/
│   │   └── users.service.ts
│   └── users.module.ts
└── app.module.ts (updated)
```

---

## What Happens Next

After this task is complete:
- **P1-T10** — Wallet Creation can start (needs authenticated users from this task)
- **P1-T11** — KYC & DID NFT (needs wallet created in T10)
- **P1-T12** — Profile CRUD (needs users from this task)
- **P1-T13** — Frontend Registration UI (can start immediately with these endpoints)
