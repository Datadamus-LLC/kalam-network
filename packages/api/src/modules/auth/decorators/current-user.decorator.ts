import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Request } from "express";
import { JwtPayload } from "../guards/jwt-auth.guard";

/**
 * Parameter decorator that extracts the authenticated user from the request.
 * Must be used with @UseGuards(JwtAuthGuard) on the endpoint or controller.
 *
 * Usage:
 *   @Post('create')
 *   @UseGuards(JwtAuthGuard)
 *   async createWallet(@CurrentUser() user: JwtPayload) { ... }
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx
      .switchToHttp()
      .getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
