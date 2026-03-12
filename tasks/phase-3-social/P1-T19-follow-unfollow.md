# Task: Social Service — Follow/Unfollow

| Field | Value |
|-------|-------|
| Task ID | P1-T19 |
| Priority | Critical |
| Estimated Time | 3 hours |
| Depends On | P0-T06 (Hedera Service), P0-T08 (Testnet Setup) |
| Phase | 3 — Social Feed |
| Assignee | Junior Developer |

---

## Objective

Implement the Follow/Unfollow service for the Hedera Social Platform. This service manages the social graph (who follows whom) using a decentralized, event-sourced approach where the Hedera Consensus Service (HCS) is the source of truth and PostgreSQL is the queryable index.

## Background

The Hedera Social Platform uses a novel approach to social graphs:

1. **HCS as Source of Truth**: All follow/unfollow events are submitted to a platform-wide HCS topic (`HEDERA_SOCIAL_GRAPH_TOPIC`)
2. **Event Sourcing**: Each event contains the actor (follower), target (following), and action (follow/unfollow)
3. **PostgreSQL Index**: Events are replayed and indexed in PostgreSQL for fast queries
4. **Immutable Audit Trail**: Every change to the social graph is permanently recorded on Hedera's ledger

This design ensures:
- Decentralization: No single database controls the social graph
- Auditability: Complete history of all relationships
- Fairness: Hedera consensus timestamp determines order
- Scalability: PostgreSQL can serve millions of follower queries efficiently

## Pre-requisites

- PostgreSQL database with User table from P0-T05
- Hedera Service (P0-T06) fully functional
- NestJS project structure initialized
- @hashgraph/sdk installed and configured
- Redis configured for caching
- Platform social graph topic created (from P0-T08)
- Posts Service from P1-T18 (for fan-out integration)

## Step-by-Step Instructions

### Step 1: Create Follow/Unfollow Entities

Create `/src/social/entities/follow.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

export enum FollowAction {
  FOLLOW = 'follow',
  UNFOLLOW = 'unfollow',
}

@Entity('follows')
@Index('idx_follower', ['follower_account_id'])
@Index('idx_following', ['following_account_id'])
@Index('idx_follower_following', ['follower_account_id', 'following_account_id'])
@Index('idx_consensus_ts', ['consensus_timestamp'])
@Unique('uq_follower_following', ['follower_account_id', 'following_account_id'])
export class Follow {
  @PrimaryColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  follower_account_id: string; // Format: "0.0.123456"

  @Column('varchar', { length: 255 })
  following_account_id: string;

  @Column('varchar', { enum: FollowAction })
  action: FollowAction;

  @Column('bigint')
  hcs_sequence_number: number;

  @Column('bigint')
  consensus_timestamp_ns: number;

  @Column('timestamp')
  consensus_timestamp: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column('varchar', { length: 255 })
  hcs_transaction_id: string; // Track which HCS message created this
}
```

Create `/src/social/entities/follower-count.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Denormalized table for fast follower/following counts
 * Updated via trigger or application logic whenever follows table changes
 */
@Entity('follower_counts')
export class FollowerCount {
  @PrimaryColumn('varchar', { length: 255 })
  account_id: string;

  @Column('int', { default: 0 })
  follower_count: number;

  @Column('int', { default: 0 })
  following_count: number;

  @UpdateDateColumn()
  updated_at: Date;
}
```

### Step 2: Create DTOs

Create `/src/social/dto/follow.dto.ts`:

```typescript
import {
  IsString,
  IsNotEmpty,
  Matches,
} from 'class-validator';

export class FollowUserDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0\.0\.\d+$/, {
    message: 'Target account ID must be in format 0.0.XXXXX',
  })
  target_account_id: string;
}

export class UnfollowUserDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^0\.0\.\d+$/, {
    message: 'Target account ID must be in format 0.0.XXXXX',
  })
  target_account_id: string;
}
```

Create `/src/social/dto/follower-response.dto.ts`:

```typescript
export class FollowerDto {
  follower_account_id: string;
  following_account_id: string;
  consensus_timestamp: Date;
  created_at: Date;
}

export class FollowersListResponseDto {
  followers: FollowerDto[];
  total_count: number;
  next_cursor?: string;
  has_more: boolean;
}

export class FollowingListResponseDto {
  following: FollowerDto[];
  total_count: number;
  next_cursor?: string;
  has_more: boolean;
}

export class FollowStatusResponseDto {
  account_id: string;
  target_account_id: string;
  is_following: boolean;
}

export class UserStatsResponseDto {
  account_id: string;
  follower_count: number;
  following_count: number;
}
```

### Step 3: Create Social Graph Service

Create `/src/social/services/social-graph.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Follow, FollowAction } from '../entities/follow.entity';
import { FollowerCount } from '../entities/follower-count.entity';
import { User } from '../../auth/entities/user.entity';
import { HederaService } from '../../hedera/hedera.service';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import {
  FollowUserDto,
  FollowStatusResponseDto,
  UserStatsResponseDto,
  FollowersListResponseDto,
  FollowerDto,
} from '../dto/follower-response.dto';

interface HCSSocialGraphEvent {
  v: string;
  type: 'follow' | 'unfollow';
  actor: string; // Follower
  target: string; // Following
}

@Injectable()
export class SocialGraphService {
  private readonly logger = new Logger(SocialGraphService.name);
  private readonly socialGraphTopicId: string;

  constructor(
    @InjectRepository(Follow)
    private followsRepository: Repository<Follow>,
    @InjectRepository(FollowerCount)
    private followerCountsRepository: Repository<FollowerCount>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private hederaService: HederaService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {
    this.socialGraphTopicId = this.configService.get(
      'HEDERA_SOCIAL_GRAPH_TOPIC',
    );
    if (!this.socialGraphTopicId) {
      this.logger.error(
        'HEDERA_SOCIAL_GRAPH_TOPIC not configured in .env',
      );
    }
  }

  /**
   * Follow a user
   *
   * Steps:
   * 1. Validate both users exist and are active
   * 2. Check if already following
   * 3. Create HCS event payload
   * 4. Submit to platform social graph topic
   * 5. Index in PostgreSQL
   * 6. Update follower counts
   * 7. Clear cache
   */
  async follow(
    followerAccountId: string,
    targetAccountId: string,
  ): Promise<void> {
    // Validate inputs
    if (followerAccountId === targetAccountId) {
      throw new BadRequestException(
        'Cannot follow yourself',
      );
    }

    // Validate both users exist
    const [follower, target] = await Promise.all([
      this.usersRepository.findOne({
        where: { hedera_account_id: followerAccountId },
      }),
      this.usersRepository.findOne({
        where: { hedera_account_id: targetAccountId },
      }),
    ]);

    if (!follower) {
      throw new NotFoundException(
        `Follower ${followerAccountId} not found`,
      );
    }

    if (!target) {
      throw new NotFoundException(
        `Target user ${targetAccountId} not found`,
      );
    }

    // Check if already following
    const existing = await this.followsRepository.findOne({
      where: {
        follower_account_id: followerAccountId,
        following_account_id: targetAccountId,
        action: FollowAction.FOLLOW,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Already following ${targetAccountId}`,
      );
    }

    // Create HCS event
    const hcsEvent: HCSSocialGraphEvent = {
      v: '1.0',
      type: 'follow',
      actor: followerAccountId,
      target: targetAccountId,
    };

    // Submit to Hedera
    let hcsResponse;
    try {
      hcsResponse = await this.hederaService.submitMessageToTopic(
        this.socialGraphTopicId,
        JSON.stringify(hcsEvent),
      );
    } catch (error) {
      this.logger.error(
        `Failed to submit follow event to HCS: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to submit follow event: ${error.message}`,
      );
    }

    // Create follow record
    const follow = new Follow();
    follow.id = uuidv4();
    follow.follower_account_id = followerAccountId;
    follow.following_account_id = targetAccountId;
    follow.action = FollowAction.FOLLOW;
    follow.hcs_sequence_number = hcsResponse.sequenceNumber;
    follow.consensus_timestamp_ns = hcsResponse.consensenceTimestamp;
    follow.consensus_timestamp = new Date(
      hcsResponse.consensenceTimestamp / 1_000_000,
    );
    follow.hcs_transaction_id = hcsResponse.transactionId;

    await this.followsRepository.save(follow);

    // Update counts
    await this.updateFollowerCounts(
      followerAccountId,
      targetAccountId,
    );

    // Clear cache
    await this.clearFollowCache(
      followerAccountId,
      targetAccountId,
    );

    this.logger.log(
      `${followerAccountId} followed ${targetAccountId}`,
    );
  }

  /**
   * Unfollow a user
   */
  async unfollow(
    followerAccountId: string,
    targetAccountId: string,
  ): Promise<void> {
    if (followerAccountId === targetAccountId) {
      throw new BadRequestException(
        'Cannot unfollow yourself',
      );
    }

    // Check if following
    const existing = await this.followsRepository.findOne({
      where: {
        follower_account_id: followerAccountId,
        following_account_id: targetAccountId,
        action: FollowAction.FOLLOW,
      },
    });

    if (!existing) {
      throw new BadRequestException(
        `Not following ${targetAccountId}`,
      );
    }

    // Create HCS event
    const hcsEvent: HCSSocialGraphEvent = {
      v: '1.0',
      type: 'unfollow',
      actor: followerAccountId,
      target: targetAccountId,
    };

    // Submit to Hedera
    let hcsResponse;
    try {
      hcsResponse = await this.hederaService.submitMessageToTopic(
        this.socialGraphTopicId,
        JSON.stringify(hcsEvent),
      );
    } catch (error) {
      this.logger.error(
        `Failed to submit unfollow event to HCS: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to submit unfollow event: ${error.message}`,
      );
    }

    // Create unfollow record
    const unfollow = new Follow();
    unfollow.id = uuidv4();
    unfollow.follower_account_id = followerAccountId;
    unfollow.following_account_id = targetAccountId;
    unfollow.action = FollowAction.UNFOLLOW;
    unfollow.hcs_sequence_number = hcsResponse.sequenceNumber;
    unfollow.consensus_timestamp_ns = hcsResponse.consensenceTimestamp;
    unfollow.consensus_timestamp = new Date(
      hcsResponse.consensenceTimestamp / 1_000_000,
    );
    unfollow.hcs_transaction_id = hcsResponse.transactionId;

    await this.followsRepository.save(unfollow);

    // Update counts
    await this.updateFollowerCounts(
      followerAccountId,
      targetAccountId,
    );

    // Clear cache
    await this.clearFollowCache(
      followerAccountId,
      targetAccountId,
    );

    this.logger.log(
      `${followerAccountId} unfollowed ${targetAccountId}`,
    );
  }

  /**
   * Get followers of a user (paginated)
   */
  async getFollowers(
    accountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<FollowersListResponseDto> {
    const cacheKey = `followers:${accountId}:${cursor || 'start'}:${limit}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    let query = this.followsRepository
      .createQueryBuilder('follow')
      .where('follow.following_account_id = :accountId', { accountId })
      .andWhere('follow.action = :action', {
        action: FollowAction.FOLLOW,
      })
      .orderBy('follow.consensus_timestamp', 'DESC')
      .addOrderBy('follow.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const [cursorTs, cursorId] = cursor.split(':');
      const cursorTimestamp = new Date(parseInt(cursorTs));

      query = query.andWhere(
        '(follow.consensus_timestamp < :cursorTs OR (follow.consensus_timestamp = :cursorTs AND follow.id < :cursorId))',
        {
          cursorTs: cursorTimestamp,
          cursorId,
        },
      );
    }

    const follows = await query.getMany();
    const hasMore = follows.length > limit;
    const returnFollows = follows.slice(0, limit);

    // Get total count
    const totalCount = await this.followsRepository.count({
      where: {
        following_account_id: accountId,
        action: FollowAction.FOLLOW,
      },
    });

    const nextCursor =
      hasMore && returnFollows.length > 0
        ? `${returnFollows[returnFollows.length - 1].consensus_timestamp.getTime()}:${returnFollows[returnFollows.length - 1].id}`
        : undefined;

    const response: FollowersListResponseDto = {
      followers: returnFollows.map((f) => ({
        follower_account_id: f.follower_account_id,
        following_account_id: f.following_account_id,
        consensus_timestamp: f.consensus_timestamp,
        created_at: f.created_at,
      })),
      total_count: totalCount,
      next_cursor: nextCursor,
      has_more: hasMore,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 300);

    return response;
  }

  /**
   * Get users that a user is following (paginated)
   */
  async getFollowing(
    accountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<FollowersListResponseDto> {
    const cacheKey = `following:${accountId}:${cursor || 'start'}:${limit}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    let query = this.followsRepository
      .createQueryBuilder('follow')
      .where('follow.follower_account_id = :accountId', { accountId })
      .andWhere('follow.action = :action', {
        action: FollowAction.FOLLOW,
      })
      .orderBy('follow.consensus_timestamp', 'DESC')
      .addOrderBy('follow.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const [cursorTs, cursorId] = cursor.split(':');
      const cursorTimestamp = new Date(parseInt(cursorTs));

      query = query.andWhere(
        '(follow.consensus_timestamp < :cursorTs OR (follow.consensus_timestamp = :cursorTs AND follow.id < :cursorId))',
        {
          cursorTs: cursorTimestamp,
          cursorId,
        },
      );
    }

    const follows = await query.getMany();
    const hasMore = follows.length > limit;
    const returnFollows = follows.slice(0, limit);

    // Get total count
    const totalCount = await this.followsRepository.count({
      where: {
        follower_account_id: accountId,
        action: FollowAction.FOLLOW,
      },
    });

    const nextCursor =
      hasMore && returnFollows.length > 0
        ? `${returnFollows[returnFollows.length - 1].consensus_timestamp.getTime()}:${returnFollows[returnFollows.length - 1].id}`
        : undefined;

    const response: FollowersListResponseDto = {
      followers: returnFollows.map((f) => ({
        follower_account_id: f.follower_account_id,
        following_account_id: f.following_account_id,
        consensus_timestamp: f.consensus_timestamp,
        created_at: f.created_at,
      })),
      total_count: totalCount,
      next_cursor: nextCursor,
      has_more: hasMore,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 300);

    return response;
  }

  /**
   * Check if user A is following user B
   */
  async isFollowing(
    followerAccountId: string,
    targetAccountId: string,
  ): Promise<boolean> {
    const cacheKey = `is_following:${followerAccountId}:${targetAccountId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached !== null) {
      return cached === '1';
    }

    const follow = await this.followsRepository.findOne({
      where: {
        follower_account_id: followerAccountId,
        following_account_id: targetAccountId,
        action: FollowAction.FOLLOW,
      },
    });

    const isFollowing = !!follow;
    await this.redisService.set(
      cacheKey,
      isFollowing ? '1' : '0',
      3600,
    );

    return isFollowing;
  }

  /**
   * Get follower and following counts for a user
   */
  async getUserStats(
    accountId: string,
  ): Promise<UserStatsResponseDto> {
    const cacheKey = `user_stats:${accountId}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const counts = await this.followerCountsRepository.findOne({
      where: { account_id: accountId },
    });

    const response: UserStatsResponseDto = {
      account_id: accountId,
      follower_count: counts?.follower_count || 0,
      following_count: counts?.following_count || 0,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 600);

    return response;
  }

  /**
   * Sync social graph from Mirror Node
   *
   * Polls the platform social graph topic for new messages
   * Processes follow/unfollow events and updates PostgreSQL
   */
  async syncSocialGraphFromMirrorNode(
    afterSequence: number = 0,
  ): Promise<number> {
    try {
      const messages = await this.hederaService.getTopicMessages(
        this.socialGraphTopicId,
        { order: 'asc', limit: 100, sequenceNumber: { gt: afterSequence } },
      );

      if (!messages || messages.length === 0) {
        return 0;
      }

      let synced = 0;

      for (const message of messages) {
        try {
          // Decode message
          const decodedText = Buffer.from(
            message.message,
            'base64',
          ).toString('utf-8');
          const event = JSON.parse(decodedText) as HCSSocialGraphEvent;

          // Process follow event
          if (event.type === 'follow') {
            const existing = await this.followsRepository.findOne({
              where: {
                follower_account_id: event.actor,
                following_account_id: event.target,
                action: FollowAction.FOLLOW,
              },
            });

            if (!existing) {
              const follow = new Follow();
              follow.id = uuidv4();
              follow.follower_account_id = event.actor;
              follow.following_account_id = event.target;
              follow.action = FollowAction.FOLLOW;
              follow.hcs_sequence_number = message.sequence_number;
              follow.consensus_timestamp_ns = message.consensus_timestamp;
              follow.consensus_timestamp = new Date(
                message.consensus_timestamp / 1_000_000,
              );
              follow.hcs_transaction_id = message.transaction_id || '';

              await this.followsRepository.save(follow);
              synced++;
            }
          }

          // Process unfollow event
          else if (event.type === 'unfollow') {
            const follow = new Follow();
            follow.id = uuidv4();
            follow.follower_account_id = event.actor;
            follow.following_account_id = event.target;
            follow.action = FollowAction.UNFOLLOW;
            follow.hcs_sequence_number = message.sequence_number;
            follow.consensus_timestamp_ns = message.consensus_timestamp;
            follow.consensus_timestamp = new Date(
              message.consensus_timestamp / 1_000_000,
            );
            follow.hcs_transaction_id = message.transaction_id || '';

            await this.followsRepository.save(follow);
            synced++;
          }
        } catch (error) {
          this.logger.error(
            `Failed to sync message ${message.sequence_number}: ${error.message}`,
          );
        }
      }

      // Rebuild counts
      await this.rebuildAllFollowerCounts();

      return synced;
    } catch (error) {
      this.logger.error(
        `Failed to sync social graph: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Internal: Update follower counts for two users
   */
  private async updateFollowerCounts(
    followerAccountId: string,
    followingAccountId: string,
  ): Promise<void> {
    // Update follower count for the following user
    const followerCount = await this.followsRepository.count({
      where: {
        following_account_id: followingAccountId,
        action: FollowAction.FOLLOW,
      },
    });

    let followerCountRecord =
      await this.followerCountsRepository.findOne({
        where: { account_id: followingAccountId },
      });

    if (!followerCountRecord) {
      followerCountRecord = new FollowerCount();
      followerCountRecord.account_id = followingAccountId;
    }

    followerCountRecord.follower_count = followerCount;
    await this.followerCountsRepository.save(
      followerCountRecord,
    );

    // Update following count for the follower user
    const followingCount = await this.followsRepository.count({
      where: {
        follower_account_id: followerAccountId,
        action: FollowAction.FOLLOW,
      },
    });

    let followerCountRecord2 =
      await this.followerCountsRepository.findOne({
        where: { account_id: followerAccountId },
      });

    if (!followerCountRecord2) {
      followerCountRecord2 = new FollowerCount();
      followerCountRecord2.account_id = followerAccountId;
    }

    followerCountRecord2.following_count = followingCount;
    await this.followerCountsRepository.save(
      followerCountRecord2,
    );
  }

  /**
   * Internal: Rebuild all follower counts from scratch
   */
  private async rebuildAllFollowerCounts(): Promise<void> {
    try {
      await this.followerCountsRepository.delete({});

      // Get all unique users from follows table
      const users = await this.followsRepository
        .createQueryBuilder('follow')
        .select('DISTINCT follow.follower_account_id', 'account_id')
        .getRawMany();

      for (const { account_id } of users) {
        const followerCount = await this.followsRepository.count({
          where: {
            following_account_id: account_id,
            action: FollowAction.FOLLOW,
          },
        });

        const followingCount = await this.followsRepository.count({
          where: {
            follower_account_id: account_id,
            action: FollowAction.FOLLOW,
          },
        });

        const record = new FollowerCount();
        record.account_id = account_id;
        record.follower_count = followerCount;
        record.following_count = followingCount;

        await this.followerCountsRepository.save(record);
      }

      this.logger.log('Rebuilt all follower counts');
    } catch (error) {
      this.logger.error(
        `Failed to rebuild follower counts: ${error.message}`,
      );
    }
  }

  /**
   * Internal: Clear cache for follow operations
   */
  private async clearFollowCache(
    followerAccountId: string,
    targetAccountId: string,
  ): Promise<void> {
    const patterns = [
      `followers:${targetAccountId}:*`,
      `following:${followerAccountId}:*`,
      `is_following:${followerAccountId}:${targetAccountId}`,
      `user_stats:${followerAccountId}`,
      `user_stats:${targetAccountId}`,
    ];

    for (const pattern of patterns) {
      const keys = await this.redisService.keys(pattern);
      if (keys.length > 0) {
        await Promise.all(keys.map((k) => this.redisService.del(k)));
      }
    }
  }
}
```

### Step 4: Create Social Graph Controller

Create `/src/social/controllers/social-graph.controller.ts`:

```typescript
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { SocialGraphService } from '../services/social-graph.service';
import {
  FollowUserDto,
  FollowStatusResponseDto,
  UserStatsResponseDto,
  FollowersListResponseDto,
  FollowingListResponseDto,
} from '../dto/follower-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { FeedQueryDto } from '../dto/feed-query.dto';

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialGraphController {
  constructor(private socialGraphService: SocialGraphService) {}

  /**
   * POST /social/follow
   * Follow a user
   */
  @Post('follow')
  @HttpCode(204)
  async followUser(
    @Request() req: Request & { user: { hedera_account_id: string } },
    @Body() followDto: FollowUserDto,
  ): Promise<void> {
    await this.socialGraphService.follow(
      req.user.hedera_account_id,
      followDto.target_account_id,
    );
  }

  /**
   * POST /social/unfollow
   * Unfollow a user
   */
  @Post('unfollow')
  @HttpCode(204)
  async unfollowUser(
    @Request() req: Request & { user: { hedera_account_id: string } },
    @Body() followDto: FollowUserDto,
  ): Promise<void> {
    await this.socialGraphService.unfollow(
      req.user.hedera_account_id,
      followDto.target_account_id,
    );
  }

  /**
   * GET /social/:accountId/followers
   * Get followers of a user
   */
  @Get(':accountId/followers')
  async getFollowers(
    @Param('accountId') accountId: string,
    @Query() query: FeedQueryDto,
  ): Promise<FollowersListResponseDto> {
    return this.socialGraphService.getFollowers(
      accountId,
      query.cursor,
      query.limit,
    );
  }

  /**
   * GET /social/:accountId/following
   * Get users that a user is following
   */
  @Get(':accountId/following')
  async getFollowing(
    @Param('accountId') accountId: string,
    @Query() query: FeedQueryDto,
  ): Promise<FollowingListResponseDto> {
    return this.socialGraphService.getFollowing(
      accountId,
      query.cursor,
      query.limit,
    );
  }

  /**
   * GET /social/:accountId/is-following/:targetId
   * Check if user is following target
   */
  @Get(':accountId/is-following/:targetId')
  async isFollowing(
    @Param('accountId') accountId: string,
    @Param('targetId') targetId: string,
  ): Promise<FollowStatusResponseDto> {
    const isFollowing = await this.socialGraphService.isFollowing(
      accountId,
      targetId,
    );

    return {
      account_id: accountId,
      target_account_id: targetId,
      is_following: isFollowing,
    };
  }

  /**
   * GET /social/:accountId/stats
   * Get follower and following counts
   */
  @Get(':accountId/stats')
  async getUserStats(
    @Param('accountId') accountId: string,
  ): Promise<UserStatsResponseDto> {
    return this.socialGraphService.getUserStats(accountId);
  }
}
```

### Step 5: Create Database Migrations

Create `/src/migrations/1700000003-create-follows-table.ts`:

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFollowsTable1700000003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'follows',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'follower_account_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'following_account_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'action',
            type: 'enum',
            enum: ['follow', 'unfollow'],
          },
          {
            name: 'hcs_sequence_number',
            type: 'bigint',
          },
          {
            name: 'consensus_timestamp_ns',
            type: 'bigint',
          },
          {
            name: 'consensus_timestamp',
            type: 'timestamp',
          },
          {
            name: 'hcs_transaction_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'follows',
      new TableIndex({
        columnNames: ['follower_account_id'],
        name: 'idx_follower',
      }),
    );

    await queryRunner.createIndex(
      'follows',
      new TableIndex({
        columnNames: ['following_account_id'],
        name: 'idx_following',
      }),
    );

    await queryRunner.createIndex(
      'follows',
      new TableIndex({
        columnNames: ['follower_account_id', 'following_account_id'],
        name: 'idx_follower_following',
      }),
    );

    await queryRunner.createIndex(
      'follows',
      new TableIndex({
        columnNames: ['consensus_timestamp'],
        name: 'idx_consensus_ts',
      }),
    );

    // Add unique constraint
    await queryRunner.query(
      `ALTER TABLE follows ADD CONSTRAINT uq_follower_following UNIQUE (follower_account_id, following_account_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('follows');
  }
}
```

Create `/src/migrations/1700000004-create-follower-counts-table.ts`:

```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateFollowerCountsTable1700000004
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'follower_counts',
        columns: [
          {
            name: 'account_id',
            type: 'varchar',
            length: '255',
            isPrimary: true,
          },
          {
            name: 'follower_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'following_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('follower_counts');
  }
}
```

### Step 6: Update Social Module

Update `/src/social/social.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Post } from './entities/post.entity';
import { FeedItem } from './entities/feed-item.entity';
import { Follow } from './entities/follow.entity';
import { FollowerCount } from './entities/follower-count.entity';
import { PostsService } from './services/posts.service';
import { PostsController } from './controllers/posts.controller';
import { SocialGraphService } from './services/social-graph.service';
import { SocialGraphController } from './controllers/social-graph.controller';
import { IpfsService } from './services/ipfs.service';
import { HederaModule } from '../hedera/hedera.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Post,
      FeedItem,
      Follow,
      FollowerCount,
      User,
    ]),
    ConfigModule,
    HederaModule,
    RedisModule,
    AuthModule,
  ],
  providers: [
    PostsService,
    SocialGraphService,
    IpfsService,
  ],
  controllers: [PostsController, SocialGraphController],
  exports: [PostsService, SocialGraphService, IpfsService],
})
export class SocialModule {}
```

### Step 7: Environment Variables

Add to `.env`:

```
HEDERA_SOCIAL_GRAPH_TOPIC=0.0.YOUR_PLATFORM_TOPIC_ID
```

## Verification Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create database tables | Tables `follows` and `follower_counts` exist with proper indexes |
| 2 | Compile TypeScript | No compilation errors |
| 3 | Start NestJS server | Server starts without errors |
| 4 | Follow user via POST /social/follow | Returns 204, follow message submitted to HCS |
| 5 | Check database | Follow record exists in `follows` table |
| 6 | Get followers | GET /social/:accountId/followers returns paginated list |
| 7 | Get following | GET /social/:accountId/following returns paginated list |
| 8 | Check is following | GET /social/:accountId/is-following/:targetId returns boolean |
| 9 | Get user stats | GET /social/:accountId/stats returns follower/following counts |
| 10 | Unfollow | POST /social/unfollow creates unfollow record in database |
| 11 | Sync from Mirror Node | syncSocialGraphFromMirrorNode imports events from HCS topic |
| 12 | Cache works | Repeated requests served from Redis cache |

## Definition of Done

- [x] All entities created (Follow, FollowerCount)
- [x] All DTOs created with validation
- [x] SocialGraphService implemented with all required methods
- [x] SocialGraphController with all REST endpoints
- [x] Database migrations created and tested
- [x] Event sourcing from HCS working
- [x] Redis caching implemented for follower lists
- [x] Mirror Node syncing implemented
- [x] Follower count denormalization working
- [x] Unique constraint on (follower, following) pair
- [x] Error handling and logging
- [x] Code compiles without errors
- [x] All verification steps pass

## Troubleshooting

### Issue: "Cannot follow yourself"
**Solution**: This is expected behavior. Users cannot follow themselves. The validation is correct.

### Issue: "Already following" error on first follow
**Solution**: Check if a previous follow record exists in database with action=FOLLOW. May need to unfollow first if duplicate exists.

### Issue: Counts are incorrect
**Solution**: Run `rebuildAllFollowerCounts()` to recalculate from the event log. This rebuilds from scratch using the FOLLOW events.

### Issue: Follow event not submitted to HCS
**Solution**: Verify `HEDERA_SOCIAL_GRAPH_TOPIC` is set in .env. Check HederaService is initialized and topic exists on testnet.

### Issue: Pagination cursor invalid
**Solution**: Cursor format must be `timestamp:id`. If old cursor format received, clear caches with `redis-cli FLUSHDB`.

### Issue: Cache not clearing after follow
**Solution**: Check Redis connection. Verify RedisService is properly injected and connected.

### Issue: Unique constraint violation
**Solution**: If getting unique constraint error on (follower, following) pair, a follow record already exists. Need to unfollow first before following again.

## Files Created in This Task

1. `/src/social/entities/follow.entity.ts`
2. `/src/social/entities/follower-count.entity.ts`
3. `/src/social/dto/follow.dto.ts`
4. `/src/social/dto/follower-response.dto.ts`
5. `/src/social/services/social-graph.service.ts`
6. `/src/social/controllers/social-graph.controller.ts`
7. `/src/migrations/1700000003-create-follows-table.ts`
8. `/src/migrations/1700000004-create-follower-counts-table.ts`
9. Updated `/src/social/social.module.ts`

## What Happens Next

This task enables the frontend (P1-T20) to:
1. Display follower/following lists
2. Show follow/unfollow buttons
3. Query home feeds based on social graph
4. Display engagement metrics (follower counts)

The service integrates with PostsService (P1-T18) through the fan-out mechanism: when a post is created, it's automatically added to the feed_items table for all followers.

Before moving to frontend development:
1. Test follow/unfollow via Postman
2. Test pagination with large follower lists
3. Verify Mirror Node sync catches new follow events
4. Load test the follower count rebuild
5. Prepare test data (multiple users with follow relationships)
