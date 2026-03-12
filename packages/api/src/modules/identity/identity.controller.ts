import { Controller, Get, Put, Param, Body } from '@nestjs/common';
import { IdentityService } from './identity.service';

@Controller('api/v1/profile')
export class IdentityController {
  constructor(private readonly identityService: IdentityService) {}

  @Get(':accountId')
  async getProfile(
    @Param('accountId') accountId: string,
  ): Promise<{ message: string }> {
    // TODO: implement profile lookup by account ID
    return { message: `Get profile endpoint — account: ${accountId}` };
  }

  @Put('me')
  async updateProfile(
    @Body()
    updateProfileDto: {
      displayName?: string;
      bio?: string;
      avatar?: string;
    },
  ): Promise<{ message: string }> {
    // TODO: implement profile update
    return {
      message: `Update profile endpoint — name: ${updateProfileDto.displayName ?? 'unchanged'}`,
    };
  }
}
