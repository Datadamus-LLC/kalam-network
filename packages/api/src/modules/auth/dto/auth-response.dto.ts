/**
 * Response returned after successful OTP verification.
 */
export class AuthResponseDto {
  accessToken!: string;
  refreshToken!: string;
  status!: string;
  identifier!: string;
}

/**
 * Response returned after successful registration.
 */
export class RegisterResponseDto {
  registrationId!: string;
  otpSent!: boolean;
  expiresAt!: string;
}

/**
 * Response returned after successful token refresh.
 */
export class RefreshResponseDto {
  accessToken!: string;
}
