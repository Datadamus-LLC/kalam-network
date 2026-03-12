import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  // TODO: implement conversation creation with HCS topic
  // TODO: implement message sending via HCS
  // TODO: implement message retrieval from Mirror Node
  // TODO: implement E2E encryption key exchange
}
