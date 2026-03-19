import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Request } from "express";

/**
 * JWT payload structure decoded from the access token.
 */
export interface JwtPayload {
  sub: string; // User ID (UUID)
  hederaAccountId: string; // e.g. "0.0.12345" (empty string if wallet not yet linked)
  identifier: string; // email or phone used for auth
  iat: number;
  exp: number;
}

/**
 * Guard that validates JWT bearer tokens on protected endpoints.
 *
 * Extracts the token from the Authorization header, verifies it
 * against the configured secret, and attaches the decoded payload
 * to `request.user`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        code: "MISSING_TOKEN",
        message: "Authorization token is required",
      });
    }

    try {
      const secret = this.configService.get<string>("jwt.secret");
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret,
      });

      // Attach the decoded user to the request
      (request as Request & { user: JwtPayload }).user = payload;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`JWT verification failed: ${message}`);
      throw new UnauthorizedException({
        code: "INVALID_TOKEN",
        message: "Invalid or expired authorization token",
      });
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return undefined;
    }

    const [type, token] = authHeader.split(" ");
    return type === "Bearer" ? token : undefined;
  }
}
