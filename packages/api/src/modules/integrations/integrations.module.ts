import { Module } from "@nestjs/common";
import { MirsadAiService } from "./mirsad-ai/mirsad-ai.service";
import { TamamCustodyService } from "./tamam-custody/tamam-custody.service";
import { IpfsService } from "./ipfs/ipfs.service";

@Module({
  providers: [MirsadAiService, TamamCustodyService, IpfsService],
  exports: [MirsadAiService, TamamCustodyService, IpfsService],
})
export class IntegrationsModule {}
