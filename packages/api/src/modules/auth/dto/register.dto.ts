import { IsEmail, IsNotEmpty } from "class-validator";

/**
 * Registration DTO — email is required.
 */
export class RegisterDto {
  @IsNotEmpty({ message: "Email is required" })
  @IsEmail({}, { message: "Invalid email address format" })
  email!: string;
}

/**
 * Type guard kept for backward compatibility with AuthService.
 */
export function hasContactMethod(dto: RegisterDto): boolean {
  return Boolean(dto.email);
}
