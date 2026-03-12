import { Module } from '@nestjs/common';
import { MirsadAiService } from './mirsad-ai/mirsad-ai.service';
import { TamamCustodyService } from './tamam-custody/tamam-custody.service';
import { TamamRailsService } from './tamam-rails/tamam-rails.service';
import { IpfsService } from './ipfs/ipfs.service';

@Module({
  providers: [
    MirsadAiService,
    TamamCustodyService,
    TamamRailsService,
    IpfsService,
  ],
  exports: [
    MirsadAiService,
    TamamCustodyService,
    TamamRailsService,
    IpfsService,
  ],
})
export class IntegrationsModule {}
