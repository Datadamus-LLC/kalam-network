import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import type { JwtPayload } from "../guards/jwt-auth.guard";

/**
 * Parameter decorator that extracts the authenticated user from the request.
 *
 * Usage:
 *   @Get('profile')
 *   getProfile(@CurrentUser() user: JwtPayload) { ... }
 *
 *   @Get('account')
 *   getAccount(@CurrentUser('hederaAccountId') accountId: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    if (data) {
      return user[data];
    }

    return user;
  },
);
