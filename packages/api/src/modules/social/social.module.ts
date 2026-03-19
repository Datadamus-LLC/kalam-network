import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { PostIndexEntity } from "../../database/entities/post-index.entity";
import { PostLikeEntity } from "../../database/entities/post-like.entity";
import { PostCommentEntity } from "../../database/entities/post-comment.entity";
import { FeedItemEntity } from "../../database/entities/feed-item.entity";
import { SocialFollowEntity } from "../../database/entities/social-follow.entity";
import { FollowerCountEntity } from "../../database/entities/follower-count.entity";
import { UserEntity } from "../../database/entities/user.entity";
import { BroadcastMessageEntity } from "../../database/entities/broadcast-message.entity";
import { BroadcastSubscriptionEntity } from "../../database/entities/broadcast-subscription.entity";
import { OrganizationEntity } from "../../database/entities/organization.entity";
import { OrganizationMemberEntity } from "../../database/entities/organization-member.entity";
import { HederaModule } from "../hedera/hedera.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PostsController } from "./controllers/posts.controller";
import { SocialGraphController } from "./controllers/social-graph.controller";
import { BroadcastController } from "./controllers/broadcast.controller";
import { PostsService } from "./services/posts.service";
import { SocialGraphService } from "./services/social-graph.service";
import { BroadcastService } from "./services/broadcast.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PostIndexEntity,
      PostLikeEntity,
      PostCommentEntity,
      FeedItemEntity,
      SocialFollowEntity,
      FollowerCountEntity,
      UserEntity,
      BroadcastMessageEntity,
      BroadcastSubscriptionEntity,
      OrganizationEntity,
      OrganizationMemberEntity,
    ]),
    HederaModule,
    NotificationsModule,
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
  controllers: [PostsController, SocialGraphController, BroadcastController],
  providers: [PostsService, SocialGraphService, BroadcastService, JwtAuthGuard],
  exports: [PostsService, SocialGraphService, BroadcastService],
})
export class SocialModule {}
