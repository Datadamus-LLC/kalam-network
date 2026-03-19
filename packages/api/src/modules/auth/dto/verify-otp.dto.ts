import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from "class-validator";

/**
 * OTP verification DTO — requires the email used during registration + the 6-digit OTP.
 */
export class VerifyOtpDto {
  @IsNotEmpty({ message: "Email is required" })
  @IsEmail({}, { message: "Invalid email address format" })
  email!: string;

  @IsString()
  @Length(6, 6, { message: "OTP must be exactly 6 digits" })
  @Matches(/^\d{6}$/, { message: "OTP must contain only digits" })
  otp!: string;
}
