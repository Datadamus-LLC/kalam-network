import { Controller, Post, Body, Get } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() registerDto: { method: string; value: string },
  ): Promise<{ message: string }> {
    // TODO: implement registration flow
    return { message: `Register endpoint — method: ${registerDto.method}` };
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body() verifyOtpDto: { registrationId: string; otp: string },
  ): Promise<{ message: string }> {
    // TODO: implement OTP verification
    return { message: `Verify OTP endpoint — id: ${verifyOtpDto.registrationId}` };
  }

  @Post('kyc')
  async submitKyc(
    @Body() kycDto: { accountType: string; data: Record<string, unknown> },
  ): Promise<{ message: string }> {
    // TODO: implement KYC submission via Mirsad AI
    return { message: `Submit KYC endpoint — type: ${kycDto.accountType}` };
  }

  @Get('kyc-status')
  async getKycStatus(): Promise<{ message: string }> {
    // TODO: implement KYC status check
    return { message: 'Get KYC status endpoint' };
  }
}
