import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { ConversationMemberEntity } from "../../database/entities/conversation-member.entity";
import { ChatGateway } from "./chat.gateway";
import { ChatController } from "./chat.controller";
import { ChatRedisService } from "./chat-redis.service";
import { WsJwtGuard } from "./guards/ws-jwt.guard";

/**
 * ChatModule provides real-time WebSocket communication for the messaging system.
 *
 * Components:
 *   - ChatGateway: Socket.io gateway with Redis adapter for horizontal scaling
 *   - ChatController: REST endpoint for fetching conversation real-time state
 *   - ChatRedisService: Redis-backed presence, typing, and read receipt tracking
 *   - WsJwtGuard: JWT authentication guard for WebSocket connections
 *
 * Dependencies:
 *   - TypeOrmModule: ConversationMemberEntity for membership validation
 *   - JwtModule: Token verification in WsJwtGuard
 *   - EventEmitterModule: Consumes 'messages.synced' events (registered globally in MessagingModule)
 *   - RedisModule: Global Redis service (ChatRedisService uses its own dedicated connection)
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ConversationMemberEntity]),
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
  controllers: [ChatController],
  providers: [ChatGateway, ChatRedisService, WsJwtGuard],
  exports: [ChatRedisService],
})
export class ChatModule {}
