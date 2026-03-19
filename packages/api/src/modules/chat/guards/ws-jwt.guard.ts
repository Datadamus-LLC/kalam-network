import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { Socket } from "socket.io";
import type { JwtPayload } from "../../../common/guards/jwt-auth.guard";

/**
 * Extended Socket type with user payload attached after authentication.
 */
export interface AuthenticatedSocket extends Socket {
  user: JwtPayload;
}

/**
 * WebSocket JWT guard for Socket.io connections.
 *
 * Authenticates clients by verifying a JWT token provided in either:
 *   - `handshake.auth.token` (Socket.io auth mechanism)
 *   - `handshake.headers.authorization` (Bearer token header)
 *
 * On successful verification, the decoded JWT payload is attached to `client.user`.
 * On failure, the client is disconnected and the guard returns false.
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const client = context.switchToWs().getClient<Socket>();
    const handshake = client.handshake;

    // Extract token from auth object or Authorization header
    let token: string | undefined;

    if (handshake.auth && typeof handshake.auth.token === "string") {
      token = handshake.auth.token;
    }

    if (!token && handshake.headers.authorization) {
      const authHeader = handshake.headers.authorization;
      const [type, headerToken] = authHeader.split(" ");
      if (type === "Bearer" && headerToken) {
        token = headerToken;
      }
    }

    if (!token) {
      this.logger.warn(
        `WS connection rejected: no token provided (socket: ${client.id})`,
      );
      client.emit("ws_error", {
        code: "WS_TOKEN_MISSING",
        message: "Authentication token is required",
      });
      client.disconnect();
      return false;
    }

    try {
      const secret = this.configService.get<string>("jwt.secret");
      const payload = this.jwtService.verify<JwtPayload>(token, { secret });

      // Attach decoded user to the socket for downstream handlers
      (client as AuthenticatedSocket).user = payload;

      return true;
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `WS JWT verification failed (socket: ${client.id}): ${reason}`,
      );
      client.emit("ws_error", {
        code: "WS_AUTHENTICATION_FAILED",
        message: "Invalid or expired token",
      });
      client.disconnect();
      return false;
    }
  }
}
