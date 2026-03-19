import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ThrottlerModule } from "@nestjs/throttler";
import configuration from "./config/configuration";
import { AuthModule } from "./modules/auth/auth.module";
import { IdentityModule } from "./modules/identity/identity.module";
import { MessagingModule } from "./modules/messaging/messaging.module";
import { SocialModule } from "./modules/social/social.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { HederaModule } from "./modules/hedera/hedera.module";
import { IntegrationsModule } from "./modules/integrations/integrations.module";
import { OrganizationModule } from "./modules/organization/organization.module";
import { ChatModule } from "./modules/chat/chat.module";
import { RedisModule } from "./modules/redis/redis.module";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: "../../.env",
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: "postgres" as const,
        host: configService.get<string>("database.host"),
        port: configService.get<number>("database.port"),
        username: configService.get<string>("database.username"),
        password: configService.get<string>("database.password"),
        database: configService.get<string>("database.database"),
        entities: [],
        migrations:
          process.env.NODE_ENV === "production"
            ? ["dist/database/migrations/**/*.js"]
            : ["src/database/migrations/**/*.ts"],
        synchronize: false,
        logging: configService.get<boolean>("database.logging"),
        autoLoadEntities: true,
      }),
    }),
    // Global rate limit: 300 requests per minute per IP (5 req/sec baseline)
    // Individual endpoints override this with tighter limits where appropriate:
    //   - Auth (register/login/OTP): 10/min  — prevent brute-force
    //   - Post creation: 20/min              — prevent spam
    //   - Comment creation: 30/min           — prevent spam
    //   - Message send: 60/min               — real-time chat needs headroom
    //   - Conversation creation: 5/min       — HCS topic creation is costly
    //   - Read endpoints (GET): inherit 300  — browsing should never be blocked
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 300 }]),
    // Feature modules
    AuthModule,
    IdentityModule,
    MessagingModule,
    SocialModule,
    PaymentsModule,
    NotificationsModule,
    OrganizationModule,
    ChatModule,
    // System modules
    RedisModule,
    HederaModule,
    IntegrationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
