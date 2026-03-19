import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { ConfigService } from "@nestjs/config";
import { NotificationEntity } from "../../database/entities/notification.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { HederaModule } from "../hedera/hedera.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

/**
 * NotificationsModule provides notification creation, persistence, querying,
 * and real-time delivery via EventEmitter integration with the ChatGateway.
 *
 * Components:
 *   - NotificationsService: Core notification logic (CRUD, HCS audit, event emission)
 *   - NotificationsController: REST endpoints for listing, read tracking, unread count
 *
 * Dependencies:
 *   - TypeOrmModule: NotificationEntity for PostgreSQL persistence
 *   - HederaModule: HederaService for optional HCS audit trail
 *   - JwtModule: Token verification in JwtAuthGuard
 *   - EventEmitterModule: Global (registered in AppModule), used for WebSocket delivery
 *
 * Integration pattern:
 *   The service emits 'notification.created' events via EventEmitter2.
 *   The ChatGateway (or a dedicated listener) subscribes to these events
 *   with @OnEvent('notification.created') to push real-time WebSocket
 *   notifications to connected users.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationEntity, UserEntity]),
    HederaModule,
    EventEmitterModule.forRoot(),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("jwt.secret"),
        signOptions: {
          expiresIn: configService.get<string>("jwt.expiresIn", "24h"),
        },
      }),
    }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, JwtAuthGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
