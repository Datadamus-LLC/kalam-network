import {
  Injectable,
  Logger,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
} from "@nestjs/common";
// NOTE: Using NestJS HTTP status exceptions (BadRequestException, UnauthorizedException, etc.)
// is acceptable here as they map to standard HTTP status codes. These are not mocks or test doubles,
// but framework-provided exceptions for HTTP semantics. Custom exceptions would be appropriate for
// domain-specific business errors (e.g., InvalidOtpException, UserAlreadyOnboardedException).
// If those custom exceptions are needed in the future, they should extend BaseException.
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { RegisterDto, hasContactMethod } from "./dto/register.dto";
import { VerifyOtpDto } from "./dto/verify-otp.dto";
import {
  RegisterResponseDto,
  AuthResponseDto,
  RefreshResponseDto,
} from "./dto/auth-response.dto";
import { OtpService } from "./services/otp.service";
import { UsersService } from "./services/users.service";
import { JwtPayload } from "./strategies/jwt.strategy";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly otpService: OtpService,
    private readonly usersService: UsersService,
  ) {}

  /**
   * Register a new user.
   * 1. Validates at least one contact method (email or phone) is provided.
   * 2. Checks for existing user with same email/phone.
   * 3. Creates the user in the database with status 'pending_wallet'.
   * 4. Generates and stores a 6-digit OTP in Redis.
   * 5. Returns registration ID and expiry.
   */
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    if (!hasContactMethod(dto)) {
      throw new BadRequestException(
        "At least one of email or phone is required",
      );
    }

    const identifier = this.resolveIdentifier(dto.email);

    // If account exists but was never verified (OTP delivery failed previously),
    // allow re-registration by resending OTP to the existing account.
    // If the account is active/onboarded, reject with conflict.
    const existing = await this.usersService.findByEmailOrPhone(dto.email);

    if (existing) {
      if (existing.status === "pending_wallet") {
        const { expiresAt } = await this.otpService.generateOtp(identifier);
        this.logger.log(`Re-sent OTP to unverified account: ${existing.id}`);
        const response = new RegisterResponseDto();
        response.registrationId = existing.id;
        response.otpSent = true;
        response.expiresAt = expiresAt;
        return response;
      }
      throw new ConflictException("An account with this email already exists");
    }

    // Create user, then send OTP. Roll back the user if delivery fails.
    const user = await this.usersService.create({ email: dto.email });

    try {
      const { expiresAt } = await this.otpService.generateOtp(identifier);
      this.logger.log(`User registered: ${user.id}`);
      const response = new RegisterResponseDto();
      response.registrationId = user.id;
      response.otpSent = true;
      response.expiresAt = expiresAt;
      return response;
    } catch (error) {
      await this.usersService.delete(user.id);
      throw error;
    }
  }

  /**
   * Verify OTP and issue JWT tokens.
   * 1. Validates contact method is provided.
   * 2. Verifies OTP against Redis.
   * 3. Finds the user by email/phone.
   * 4. Generates access and refresh tokens.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<AuthResponseDto> {
    const identifier = this.resolveIdentifier(dto.email);

    if (!identifier) {
      throw new BadRequestException("Email is required");
    }

    const isValid = await this.otpService.verifyOtp(identifier, dto.otp);

    if (!isValid) {
      throw new UnauthorizedException("Invalid or expired OTP");
    }

    // Find the user
    const user = await this.usersService.findByEmailOrPhone(dto.email);

    if (!user) {
      throw new UnauthorizedException("No account found for this email");
    }

    // Generate tokens
    const payload: JwtPayload = {
      sub: user.id,
      identifier,
      hederaAccountId: user.hederaAccountId ?? "",
    };

    const accessToken = this.jwtService.sign(payload);

    const refreshSecret = this.configService.get<string>("jwt.refreshSecret");
    const refreshExpiresIn = this.configService.get<string>(
      "jwt.refreshExpiresIn",
      "30d",
    );

    if (!refreshSecret) {
      throw new UnauthorizedException(
        "JWT_REFRESH_SECRET environment variable is not configured",
      );
    }

    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn: refreshExpiresIn,
    });

    this.logger.log(`OTP verified and tokens issued for user: ${user.id}`);

    const response = new AuthResponseDto();
    response.accessToken = accessToken;
    response.refreshToken = refreshToken;
    response.status = user.status;
    response.identifier = identifier;
    return response;
  }

  /**
   * Refresh access token using a valid refresh token.
   * 1. Verifies the refresh token signature and expiry.
   * 2. Validates the user still exists.
   * 3. Issues a new access token.
   */
  async refreshToken(refreshToken: string): Promise<RefreshResponseDto> {
    const refreshSecret = this.configService.get<string>("jwt.refreshSecret");

    if (!refreshSecret) {
      throw new UnauthorizedException(
        "JWT_REFRESH_SECRET environment variable is not configured",
      );
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken, {
        secret: refreshSecret,
      });
    } catch {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    // Verify user still exists
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // Issue new access token
    const newPayload: JwtPayload = {
      sub: user.id,
      identifier: payload.identifier,
      hederaAccountId: user.hederaAccountId ?? "",
    };

    const accessToken = this.jwtService.sign(newPayload);

    this.logger.log(`Access token refreshed for user: ${user.id}`);

    const response = new RefreshResponseDto();
    response.accessToken = accessToken;
    return response;
  }

  /**
   * Login an existing user by sending OTP to their email or phone.
   * Unlike register, this requires the user to already exist.
   * 1. Validates at least one contact method is provided.
   * 2. Looks up existing user by email/phone.
   * 3. Generates and stores a 6-digit OTP in Redis.
   * 4. Returns the user ID and expiry.
   */
  async login(dto: RegisterDto): Promise<RegisterResponseDto> {
    if (!hasContactMethod(dto)) {
      throw new BadRequestException("Email is required");
    }

    const user = await this.usersService.findByEmailOrPhone(dto.email);

    if (!user) {
      throw new NotFoundException("User not found");
    }

    const identifier = this.resolveIdentifier(dto.email);

    const { expiresAt } = await this.otpService.generateOtp(identifier);

    this.logger.log(`Login OTP sent for user: ${user.id}`);

    const response = new RegisterResponseDto();
    response.registrationId = user.id;
    response.otpSent = true;
    response.expiresAt = expiresAt;
    return response;
  }

  /**
   * Resolve the identifier — email only.
   */
  private resolveIdentifier(email?: string): string {
    return email ?? "";
  }
}
