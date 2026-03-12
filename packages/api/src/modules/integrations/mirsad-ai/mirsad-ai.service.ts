import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MirsadAiService {
  private readonly logger = new Logger(MirsadAiService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Submit KYC data to Mirsad AI for verification
   * BLOCKED: awaiting full Mirsad AI API docs for implementation details
   */
  async submitKyc(
    kycData: Record<string, unknown>,
  ): Promise<{ kycId: string; status: string }> {
    const mirsadEnabled = this.configService.get<boolean>('mirsadKyc.enabled');
    if (!mirsadEnabled) {
      this.logger.warn('Mirsad AI KYC is disabled — skipping submission');
      return { kycId: '', status: 'disabled' };
    }

    // TODO: implement actual Mirsad AI API call
    // See: .claude/skills/hedera-social-dev/references/mirsad-ai-integration.md
    this.logger.log('Mirsad AI KYC submission placeholder');
    return { kycId: '', status: 'pending' };
  }

  /**
   * Check KYC verification status
   * BLOCKED: awaiting full Mirsad AI API docs for status polling
   */
  async checkKycStatus(
    kycId: string,
  ): Promise<{ status: string; details: Record<string, unknown> }> {
    // TODO: implement actual Mirsad AI status check
    this.logger.log(`Checking KYC status for: ${kycId}`);
    return { status: 'pending', details: {} };
  }
}
