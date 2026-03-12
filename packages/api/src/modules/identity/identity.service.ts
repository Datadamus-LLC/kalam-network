import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class IdentityService {
  private readonly logger = new Logger(IdentityService.name);

  // TODO: implement DID NFT minting for user identity
  // TODO: implement profile CRUD operations
  // TODO: implement soulbound NFT freeze after mint
}
