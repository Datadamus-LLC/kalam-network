import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomInt } from "crypto";
import { RedisService } from "../../redis/redis.service";
import { EmailService } from "./email.service";

/** Redis key prefixes for OTP storage */
const OTP_PREFIX = "otp:";
const OTP_ATTEMPTS_PREFIX = "otp_attempts:";
const OTP_COOLDOWN_PREFIX = "otp_cooldown:";

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly otpTtlSeconds: number;
  private readonly maxAttempts: number;
  private readonly cooldownSeconds: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    this.otpTtlSeconds = this.configService.get<number>("otp.ttlSeconds", 300);
    this.maxAttempts = this.configService.get<number>("otp.maxAttempts", 3);
    this.cooldownSeconds = this.configService.get<number>(
      "otp.cooldownSeconds",
      300,
    );
  }

  /**
   * Generate a 6-digit OTP for the given identifier (email or phone).
   * Stores in Redis with 5-minute TTL.
   * In development mode (NODE_ENV=development), logs the OTP via NestJS Logger.
   */
  async generateOtp(
    identifier: string,
  ): Promise<{ otp: string; expiresAt: string }> {
    const cooldownKey = `${OTP_COOLDOWN_PREFIX}${identifier}`;
    const cooldownTtl = await this.redisService.ttl(cooldownKey);

    if (cooldownTtl > 0) {
      throw new BadRequestException(
        `Too many OTP requests. Try again in ${cooldownTtl} seconds.`,
      );
    }

    // Generate cryptographically random 6-digit OTP
    const otp = randomInt(100000, 999999).toString();
    const otpKey = `${OTP_PREFIX}${identifier}`;
    const attemptsKey = `${OTP_ATTEMPTS_PREFIX}${identifier}`;

    // Store OTP with TTL
    await this.redisService.setex(otpKey, this.otpTtlSeconds, otp);

    // Reset attempt counter for new OTP
    await this.redisService.del(attemptsKey);

    const expiresAt = new Date(
      Date.now() + this.otpTtlSeconds * 1000,
    ).toISOString();

    await this.emailService.sendOtp(identifier, otp, expiresAt);

    return { otp, expiresAt };
  }

  /**
   * Verify an OTP for the given identifier.
   * Enforces rate limiting: max attempts, then cooldown.
   * Deletes OTP on successful verification.
   */
  async verifyOtp(identifier: string, otp: string): Promise<boolean> {
    // Development backdoor — never active in production
    if (
      this.configService.get<string>("nodeEnv") === "development" &&
      otp === "123123"
    ) {
      this.logger.warn(`[DEV] Backdoor OTP accepted for ${identifier}`);
      return true;
    }

    const cooldownKey = `${OTP_COOLDOWN_PREFIX}${identifier}`;
    const cooldownTtl = await this.redisService.ttl(cooldownKey);

    if (cooldownTtl > 0) {
      throw new BadRequestException(
        `Account temporarily locked. Try again in ${cooldownTtl} seconds.`,
      );
    }

    const attemptsKey = `${OTP_ATTEMPTS_PREFIX}${identifier}`;
    const attempts = await this.redisService.incr(attemptsKey);

    // Set TTL on attempts key if this is the first attempt
    if (attempts === 1) {
      await this.redisService.expire(attemptsKey, this.otpTtlSeconds);
    }

    // Check if max attempts exceeded
    if (attempts > this.maxAttempts) {
      // Set cooldown
      await this.redisService.setex(cooldownKey, this.cooldownSeconds, "1");
      // Clean up OTP and attempts
      await this.redisService.del(`${OTP_PREFIX}${identifier}`);
      await this.redisService.del(attemptsKey);

      this.logger.warn(
        `OTP max attempts exceeded for ${identifier} — cooldown applied`,
      );

      throw new BadRequestException(
        "Too many failed attempts. Please request a new OTP after the cooldown period.",
      );
    }

    const otpKey = `${OTP_PREFIX}${identifier}`;
    const storedOtp = await this.redisService.get(otpKey);

    if (!storedOtp) {
      this.logger.debug(`No OTP found for ${identifier} — may be expired`);
      return false;
    }

    if (storedOtp !== otp) {
      this.logger.debug(
        `Invalid OTP attempt for ${identifier} — attempt ${attempts}/${this.maxAttempts}`,
      );
      return false;
    }

    // OTP matches — clean up
    await this.redisService.del(otpKey);
    await this.redisService.del(attemptsKey);

    this.logger.log(`OTP verified successfully for ${identifier}`);
    return true;
  }
}
