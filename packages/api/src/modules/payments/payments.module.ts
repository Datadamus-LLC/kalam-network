import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { PaymentIndexEntity } from "../../database/entities/payment-index.entity";
import { PaymentRequestEntity } from "../../database/entities/payment-request.entity";
import { TransactionEntity } from "../../database/entities/transaction.entity";
import { ConversationEntity } from "../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../database/entities/conversation-member.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { HederaModule } from "../hedera/hedera.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentIndexEntity,
      PaymentRequestEntity,
      TransactionEntity,
      ConversationEntity,
      ConversationMemberEntity,
      UserEntity,
    ]),
    HederaModule,
    IntegrationsModule,
    ScheduleModule.forRoot(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("jwt.secret"),
        signOptions: {
          expiresIn: configService.get<string>("jwt.expiresIn"),
        },
      }),
    }),
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, JwtAuthGuard],
  exports: [PaymentsService],
})
export class PaymentsModule {}
