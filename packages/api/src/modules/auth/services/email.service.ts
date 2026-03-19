import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { EmailDeliveryException } from "../exceptions/email-delivery.exception";

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.getOrThrow<string>("resend.apiKey");
    this.fromAddress =
      this.configService.getOrThrow<string>("resend.fromEmail");
    this.resend = new Resend(apiKey);
    this.logger.log(`EmailService initialized — from: ${this.fromAddress}`);
  }

  /**
   * Send a 6-digit OTP to the given email address.
   * Throws EmailDeliveryException on any Resend API failure.
   *
   * In development mode, emails to *@test.hedera.social are logged only
   * (no actual delivery) — this avoids exhausting the Resend daily limit
   * during automated testing. The dev backdoor OTP (123123) still works.
   */
  async sendOtp(email: string, otp: string, expiresAt: string): Promise<void> {
    const isDevelopment =
      this.configService.get<string>("nodeEnv") === "development";
    const isTestEmail = email.endsWith("@test.hedera.social");

    if (isDevelopment && isTestEmail) {
      this.logger.log(
        `[DEV] Skipping email delivery for test address ${email} — OTP: ${otp}`,
      );
      return;
    }

    const expiryMinutes = Math.round(
      (new Date(expiresAt).getTime() - Date.now()) / 60000,
    );

    const { error } = await this.resend.emails.send({
      from: this.fromAddress,
      to: email,
      subject: "Your Hedera Social verification code",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#1d4ed8;margin-bottom:8px">Hedera Social</h2>
          <p style="color:#374151;margin-bottom:24px">Use the code below to verify your account. It expires in ${expiryMinutes} minutes.</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:24px;text-align:center;margin-bottom:24px">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#111827;font-family:monospace">${otp}</span>
          </div>
          <p style="color:#6b7280;font-size:14px">If you didn't request this code, you can safely ignore this email.</p>
        </div>
      `,
    });

    if (error) {
      this.logger.error(`Resend API error for ${email}: ${error.message}`);
      throw new EmailDeliveryException(email, error);
    }

    this.logger.log(`OTP email delivered to ${email}`);
  }
}
