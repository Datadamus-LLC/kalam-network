import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class SocialService {
  private readonly logger = new Logger(SocialService.name);

  // TODO: implement follow/unfollow via HCS social graph topic
  // TODO: implement followers/following listing
  // TODO: implement announcements via HCS
  // TODO: implement feed aggregation from social graph
}
