import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ScheduleModule } from "@nestjs/schedule";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { ConversationEntity } from "../../database/entities/conversation.entity";
import { ConversationMemberEntity } from "../../database/entities/conversation-member.entity";
import { MessageIndexEntity } from "../../database/entities/message-index.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { HederaModule } from "../hedera/hedera.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ConversationsController } from "./conversations.controller";
import { ConversationsService } from "./conversations.service";
import { MessagingService } from "./messaging.service";
import { MessageSyncService } from "./message-sync.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationEntity,
      ConversationMemberEntity,
      MessageIndexEntity,
      UserEntity,
    ]),
    HederaModule,
    NotificationsModule,
    EventEmitterModule.forRoot(),
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
  controllers: [ConversationsController],
  providers: [
    ConversationsService,
    MessagingService,
    MessageSyncService,
    JwtAuthGuard,
  ],
  exports: [ConversationsService, MessagingService, MessageSyncService],
})
export class MessagingModule {}
