import { Controller, Post, Delete, Get, Param, Body, Query } from '@nestjs/common';
import { SocialService } from './social.service';

@Controller('api/v1/social')
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  @Post('follow')
  async follow(
    @Body() followDto: { targetAccountId: string },
  ): Promise<{ message: string }> {
    // TODO: implement follow via HCS social graph topic
    return {
      message: `Follow endpoint — target: ${followDto.targetAccountId}`,
    };
  }

  @Delete('follow/:targetAccountId')
  async unfollow(
    @Param('targetAccountId') targetAccountId: string,
  ): Promise<{ message: string }> {
    // TODO: implement unfollow via HCS social graph topic
    return { message: `Unfollow endpoint — target: ${targetAccountId}` };
  }

  @Get('followers/:accountId')
  async getFollowers(
    @Param('accountId') accountId: string,
    @Query('limit') limit?: string,
  ): Promise<{ message: string }> {
    // TODO: implement followers listing
    return {
      message: `Get followers endpoint — account: ${accountId}, limit: ${limit ?? '50'}`,
    };
  }

  @Get('following/:accountId')
  async getFollowing(
    @Param('accountId') accountId: string,
    @Query('limit') limit?: string,
  ): Promise<{ message: string }> {
    // TODO: implement following listing
    return {
      message: `Get following endpoint — account: ${accountId}, limit: ${limit ?? '50'}`,
    };
  }

  @Post('announcements')
  async createAnnouncement(
    @Body() announcementDto: { content: string; mediaUrls?: string[] },
  ): Promise<{ message: string }> {
    // TODO: implement announcement via HCS announcements topic
    return { message: 'Create announcement endpoint' };
  }

  @Get('feed')
  async getFeed(
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<{ message: string }> {
    // TODO: implement feed aggregation
    return {
      message: `Get feed endpoint — limit: ${limit ?? '50'}, before: ${before ?? 'latest'}`,
    };
  }
}
