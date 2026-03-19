import { Module } from "@nestjs/common";
import { HederaService } from "./hedera.service";
import { MirrorNodeService } from "./mirror-node.service";

@Module({
  providers: [HederaService, MirrorNodeService],
  exports: [HederaService, MirrorNodeService],
})
export class HederaModule {}
