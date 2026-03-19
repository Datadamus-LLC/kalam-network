import {
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { UsersService } from "../services/users.service";
import { UserEntity } from "../../../database/entities/user.entity";

/** Shape of the JWT payload we create and verify */
export interface JwtPayload {
  sub: string; // user UUID
  identifier: string; // email or phone used for auth
  hederaAccountId: string; // e.g. "0.0.12345" (empty string if wallet not yet linked)
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
  ) {
    const secret = configService.get<string>("jwt.secret");
    if (!secret) {
      throw new InternalServerErrorException(
        "JWT_SECRET environment variable is not configured",
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  /**
   * Called by Passport after JWT signature verification.
   * Looks up the user in the database and returns it for injection
   * into the request object (request.user).
   */
  async validate(payload: JwtPayload): Promise<UserEntity> {
    const user = await this.usersService.findById(payload.sub);

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    return user;
  }
}
