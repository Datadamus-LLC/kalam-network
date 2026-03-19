import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Request } from "express";

/**
 * JWT payload structure after verification.
 * Must match what AuthService signs in the token.
 */
export interface JwtPayload {
  sub: string;
  identifier: string;
  email?: string;
  phone?: string;
  hederaAccountId?: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT authentication guard.
 * Validates the Bearer token from the Authorization header.
 * Attaches the decoded payload to request.user.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException({
        success: false,
        data: null,
        error: {
          code: "MISSING_TOKEN",
          message: "Authorization header with Bearer token is required",
        },
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      // Attach decoded user to request for downstream use via @CurrentUser()
      (request as Request & { user: JwtPayload }).user = payload;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Token verification failed";
      this.logger.warn(`JWT verification failed: ${message}`);
      throw new UnauthorizedException({
        success: false,
        data: null,
        error: {
          code: "INVALID_TOKEN",
          message: "Invalid or expired authentication token",
        },
        timestamp: new Date().toISOString(),
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
