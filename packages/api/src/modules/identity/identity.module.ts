import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserEntity } from "../../database/entities/user.entity";
import { FollowerCountEntity } from "../../database/entities/follower-count.entity";
import { PostIndexEntity } from "../../database/entities/post-index.entity";
import { HederaModule } from "../hedera/hedera.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { AuthModule } from "../auth/auth.module";
import { ProfileController } from "./controllers/profile.controller";
import { KycWebhookController } from "./controllers/kyc-webhook.controller";
import { UsersSearchController } from "./controllers/users-search.controller";
import { IdentitySearchController } from "./controllers/identity-search.controller";
import { WalletController } from "./controllers/wallet.controller";
import { KycController } from "./controllers/kyc.controller";
import { ProfileService } from "./services/profile.service";
import { KycService } from "./services/kyc.service";
import { DidNftService } from "./services/did-nft.service";
import { OnboardingService } from "./services/onboarding.service";
import { WalletService } from "./services/wallet.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserEntity,
      FollowerCountEntity,
      PostIndexEntity,
    ]),
    HederaModule,
    IntegrationsModule,
    AuthModule,
  ],
  controllers: [
    ProfileController,
    KycWebhookController,
    KycController,
    UsersSearchController,
    IdentitySearchController,
    WalletController,
  ],
  providers: [
    ProfileService,
    KycService,
    DidNftService,
    OnboardingService,
    WalletService,
  ],
  exports: [
    ProfileService,
    KycService,
    DidNftService,
    OnboardingService,
    WalletService,
  ],
})
export class IdentityModule {}
