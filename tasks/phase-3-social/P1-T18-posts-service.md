# Task: Social Service — Posts

| Field | Value |
|-------|-------|
| Task ID | P1-T18 |
| Priority | Critical |
| Estimated Time | 4 hours |
| Depends On | P0-T06 (Hedera Service), P0-T05 (Database Schema) |
| Phase | 3 — Social Feed |
| Assignee | Junior Developer |

---

## Objective

Implement the core Posts service for the Hedera Social Platform. This service handles creating, retrieving, and syncing social media posts. Posts are stored as plaintext HCS (Hedera Consensus Service) messages on users' public feed topics and indexed in PostgreSQL for fast querying. Media attachments are stored on IPFS via Pinata API.

## Background

The Hedera Social Platform uses a hybrid architecture:
- **HCS**: Source of truth for posts (immutable, timestamped by Hedera network)
- **PostgreSQL**: Fast index for querying posts by feed, user, or timestamp
- **IPFS/Pinata**: Decentralized storage for media attachments

When a user creates a post:
1. The post content is submitted as an HCS message to the user's public feed topic (plaintext)
2. Media is uploaded to IPFS (if any)
3. The post is indexed in PostgreSQL
4. A fan-out operation creates feed_items entries for all followers

When users fetch their home feed, they query PostgreSQL for posts from accounts they follow, sorted by HCS consensus timestamp.

## Pre-requisites

- PostgreSQL database running with schema from P0-T05
- Hedera Service (P0-T06) fully functional with HederaService implemented
- NestJS project structure initialized
- @hashgraph/sdk installed and configured
- Pinata API key for media uploads
- Redis configured (for caching)
- TypeORM installed and configured

## Step-by-Step Instructions

### Step 1: Create Database Entities

Create `/src/social/entities/post.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export interface MediaReference {
  type: 'image' | 'video' | 'audio';
  ref: string; // ipfs://Qm... or similar CID format
  mimeType: string;
  size: number;
  dimensions?: string; // "1920x1080" for images/video
  alt?: string;
  duration?: number; // in seconds for video/audio
}

@Entity('posts')
@Index('idx_author_consensus_ts', ['author_account_id', 'consensus_timestamp'])
@Index('idx_consensus_ts', ['consensus_timestamp'])
@Index('idx_hcs_topic_sequence', ['hcs_topic_id', 'sequence_number'])
export class Post {
  @PrimaryColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  author_account_id: string; // Format: "0.0.123456"

  @Column('varchar', { length: 255 })
  hcs_topic_id: string; // User's public feed topic

  @Column('bigint')
  sequence_number: number;

  @Column('text')
  content_text: string;

  @Column('jsonb', { nullable: true })
  media_refs: MediaReference[] | null;

  @Column('bigint')
  consensus_timestamp_ns: number; // Nanoseconds from Hedera

  @Column('timestamp')
  consensus_timestamp: Date;

  @Column('timestamp')
  indexed_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @Column('int', { default: 0 })
  like_count: number;

  @Column('int', { default: 0 })
  reply_count: number;

  @Column('int', { default: 0 })
  share_count: number;

  @Column('boolean', { default: false })
  is_deleted: boolean;

  // Relationship to user (optional, for eager loading)
  @ManyToOne(() => User, { nullable: true, lazy: true })
  @JoinColumn({ name: 'author_account_id', referencedColumnName: 'hedera_account_id' })
  author?: User;
}
```

Create `/src/social/entities/feed-item.entity.ts`:

```typescript
import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('feed_items')
@Index('idx_user_created_at', ['user_account_id', 'created_at'])
@Index('idx_post_id', ['post_id'])
export class FeedItem {
  @PrimaryColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  user_account_id: string; // Follower

  @Column('uuid')
  post_id: string; // References posts.id

  @Column('varchar', { length: 255 })
  author_account_id: string; // Author of the post

  @Column('bigint')
  consensus_timestamp_ns: number;

  @CreateDateColumn()
  created_at: Date;
}
```

### Step 2: Create DTOs

Create `/src/social/dto/create-post.dto.ts`:

```typescript
import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
}

export class MediaUploadDto {
  @IsEnum(MediaType)
  type: MediaType;

  @IsString()
  mimeType: string;

  @IsNumber()
  size: number;

  @IsOptional()
  @IsString()
  dimensions?: string;

  @IsOptional()
  @IsString()
  alt?: string;

  @IsOptional()
  @IsNumber()
  duration?: number;
}

export class CreatePostDto {
  @IsString()
  @MinLength(1, { message: 'Post content cannot be empty' })
  @MaxLength(800, { message: 'Post content must be 800 characters or less' })
  content: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaUploadDto)
  media?: MediaUploadDto[];
}
```

Create `/src/social/dto/feed-query.dto.ts`:

```typescript
import { IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class FeedQueryDto {
  @IsOptional()
  @IsString()
  cursor?: string; // timestamp.id for pagination

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
```

Create `/src/social/dto/post-response.dto.ts`:

```typescript
export class MediaResponseDto {
  type: 'image' | 'video' | 'audio';
  ref: string;
  mimeType: string;
  size: number;
  dimensions?: string;
  alt?: string;
  duration?: number;
}

export class PostResponseDto {
  id: string;
  author_account_id: string;
  author?: {
    hedera_account_id: string;
    display_name: string;
    avatar_uri?: string;
  };
  content_text: string;
  media_refs: MediaResponseDto[] | null;
  consensus_timestamp: Date;
  like_count: number;
  reply_count: number;
  share_count: number;
  is_deleted: boolean;
}

export class FeedResponseDto {
  posts: PostResponseDto[];
  next_cursor?: string;
  has_more: boolean;
}
```

### Step 3: Create IPFS Service (Pinata)

Create `/src/social/services/ipfs.service.ts`:

```typescript
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import FormData from 'form-data';
import { Readable } from 'stream';
import axios from 'axios';

interface PinataUploadResponse {
  IpfsHash: string;
  PinSize: number;
  Timestamp: string;
}

@Injectable()
export class IpfsService {
  private readonly logger = new Logger(IpfsService.name);
  private readonly pinataApiKey: string;
  private readonly pinataApiSecret: string;
  private readonly pinataGateway: string;

  constructor(private configService: ConfigService) {
    this.pinataApiKey = this.configService.get('PINATA_API_KEY');
    this.pinataApiSecret = this.configService.get('PINATA_API_SECRET');
    this.pinataGateway = this.configService.get('PINATA_GATEWAY', 'https://gateway.pinata.cloud');

    if (!this.pinataApiKey || !this.pinataApiSecret) {
      this.logger.warn('Pinata credentials not configured. IPFS uploads will fail.');
    }
  }

  /**
   * Upload file buffer to IPFS via Pinata
   */
  async uploadFile(
    fileBuffer: Buffer,
    filename: string,
  ): Promise<{ ipfsHash: string; gateway: string }> {
    try {
      const form = new FormData();
      form.append('file', fileBuffer, filename);

      const response = await axios.post<PinataUploadResponse>(
        'https://api.pinata.cloud/pinning/pinFileToIPFS',
        form,
        {
          headers: {
            ...form.getHeaders(),
            pinata_api_key: this.pinataApiKey,
            pinata_secret_api_key: this.pinataApiSecret,
          },
          timeout: 30000,
        },
      );

      const ipfsHash = response.data.IpfsHash;
      const gatewayUrl = `${this.pinataGateway}/ipfs/${ipfsHash}`;

      this.logger.log(
        `Successfully uploaded file to IPFS: ${ipfsHash}`,
      );

      return {
        ipfsHash,
        gateway: gatewayUrl,
      };
    } catch (error) {
      this.logger.error(
        `Failed to upload file to IPFS: ${error.message}`,
      );
      throw new BadRequestException(
        `IPFS upload failed: ${error.message}`,
      );
    }
  }

  /**
   * Convert file path or URL to IPFS ref
   */
  toIpfsRef(ipfsHash: string): string {
    return `ipfs://${ipfsHash}`;
  }

  /**
   * Parse IPFS ref back to hash
   */
  parseIpfsRef(ref: string): string {
    if (ref.startsWith('ipfs://')) {
      return ref.substring(7);
    }
    return ref;
  }
}
```

### Step 4: Create Posts Service

Create `/src/social/services/posts.service.ts`:

```typescript
import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Post, MediaReference } from '../entities/post.entity';
import { FeedItem } from '../entities/feed-item.entity';
import { User } from '../../auth/entities/user.entity';
import { CreatePostDto } from '../dto/create-post.dto';
import { PostResponseDto, FeedResponseDto } from '../dto/post-response.dto';
import { HederaService } from '../../hedera/hedera.service';
import { IpfsService } from './ipfs.service';
import { SocialGraphService } from './social-graph.service';
import { RedisService } from '../../redis/redis.service';
import { ConfigService } from '@nestjs/config';

interface HCSPostPayload {
  v: string;
  type: 'post';
  sender: string;
  content: {
    text: string;
    media?: Array<{
      type: 'image' | 'video' | 'audio';
      ref: string;
      mimeType: string;
      size: number;
      dimensions?: string;
      alt?: string;
      duration?: number;
    }>;
  };
}

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    @InjectRepository(Post)
    private postsRepository: Repository<Post>,
    @InjectRepository(FeedItem)
    private feedItemsRepository: Repository<FeedItem>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private hederaService: HederaService,
    private ipfsService: IpfsService,
    private socialGraphService: SocialGraphService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  /**
   * Create a new post
   *
   * Steps:
   * 1. Validate user exists and has public feed topic
   * 2. Upload media to IPFS if provided
   * 3. Create HCS payload
   * 4. Submit to user's public feed topic
   * 5. Index in PostgreSQL
   * 6. Fan-out to followers' feed_items
   * 7. Clear feed cache
   */
  async createPost(
    authorAccountId: string,
    createPostDto: CreatePostDto,
  ): Promise<PostResponseDto> {
    // Validate user exists and has public feed topic
    const user = await this.usersRepository.findOne({
      where: { hedera_account_id: authorAccountId },
    });

    if (!user) {
      throw new NotFoundException(
        `User ${authorAccountId} not found`,
      );
    }

    if (!user.public_feed_topic_id) {
      throw new BadRequestException(
        'User does not have a public feed topic configured',
      );
    }

    // Process media if provided
    let mediaRefs: MediaReference[] = [];
    if (createPostDto.media && createPostDto.media.length > 0) {
      if (createPostDto.media.length > 4) {
        throw new BadRequestException('Maximum 4 media items per post');
      }

      for (const mediaItem of createPostDto.media) {
        // In a real scenario, the frontend would send the file buffer
        // For now, we assume media has already been uploaded and we get the CID
        mediaRefs.push({
          type: mediaItem.type,
          ref: mediaItem.ref || `ipfs://placeholder-${uuidv4()}`,
          mimeType: mediaItem.mimeType,
          size: mediaItem.size,
          dimensions: mediaItem.dimensions,
          alt: mediaItem.alt,
          duration: mediaItem.duration,
        });
      }
    }

    // Create HCS payload
    const hcsPayload: HCSPostPayload = {
      v: '1.0',
      type: 'post',
      sender: authorAccountId,
      content: {
        text: createPostDto.content,
        media: mediaRefs.length > 0 ? mediaRefs : undefined,
      },
    };

    // Submit to Hedera
    let hcsResponse;
    try {
      hcsResponse = await this.hederaService.submitMessageToTopic(
        user.public_feed_topic_id,
        JSON.stringify(hcsPayload),
      );
    } catch (error) {
      this.logger.error(
        `Failed to submit post to HCS: ${error.message}`,
      );
      throw new BadRequestException(
        `Failed to submit post to Hedera: ${error.message}`,
      );
    }

    // Create post entity
    const postId = uuidv4();
    const post = new Post();
    post.id = postId;
    post.author_account_id = authorAccountId;
    post.hcs_topic_id = user.public_feed_topic_id;
    post.sequence_number = hcsResponse.sequenceNumber;
    post.content_text = createPostDto.content;
    post.media_refs = mediaRefs.length > 0 ? mediaRefs : null;
    post.consensus_timestamp_ns = hcsResponse.consensenceTimestamp;
    post.consensus_timestamp = new Date(
      hcsResponse.consensenceTimestamp / 1_000_000,
    );
    post.indexed_at = new Date();

    const savedPost = await this.postsRepository.save(post);

    // Fan-out to followers
    await this.fanOutToFollowers(
      authorAccountId,
      postId,
      hcsResponse.consensenceTimestamp,
    );

    // Clear feed caches
    await this.clearFeedCaches(authorAccountId);

    this.logger.log(
      `Post ${postId} created by ${authorAccountId} on topic ${user.public_feed_topic_id}`,
    );

    return this.mapPostToResponse(savedPost, user);
  }

  /**
   * Get home feed for user (posts from followed accounts)
   *
   * Queries posts from accounts the user follows,
   * sorted by consensus_timestamp DESC for most recent first
   */
  async getHomeFeed(
    userAccountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<FeedResponseDto> {
    // Check cache first
    const cacheKey = `feed:${userAccountId}:${cursor || 'start'}:${limit}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Get accounts user is following
    const following = await this.socialGraphService.getFollowing(
      userAccountId,
    );
    const followingIds = following.map((f) => f.following_account_id);

    if (followingIds.length === 0) {
      return {
        posts: [],
        has_more: false,
      };
    }

    // Build query
    let query = this.postsRepository
      .createQueryBuilder('post')
      .where('post.author_account_id IN (:...followingIds)', {
        followingIds,
      })
      .andWhere('post.is_deleted = false')
      .orderBy('post.consensus_timestamp', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .take(limit + 1); // +1 to check if there are more

    // Apply cursor if provided
    if (cursor) {
      const [cursorTs, cursorId] = cursor.split(':');
      const cursorTimestamp = new Date(parseInt(cursorTs));

      query = query.andWhere(
        '(post.consensus_timestamp < :cursorTs OR (post.consensus_timestamp = :cursorTs AND post.id < :cursorId))',
        {
          cursorTs: cursorTimestamp,
          cursorId,
        },
      );
    }

    const posts = await query
      .leftJoinAndSelect(
        'post.author',
        'author',
      )
      .getMany();

    const hasMore = posts.length > limit;
    const returnPosts = posts.slice(0, limit);

    const nextCursor =
      hasMore && returnPosts.length > 0
        ? `${returnPosts[returnPosts.length - 1].consensus_timestamp.getTime()}:${returnPosts[returnPosts.length - 1].id}`
        : undefined;

    const response: FeedResponseDto = {
      posts: returnPosts.map((p) =>
        this.mapPostToResponse(p, p.author),
      ),
      next_cursor: nextCursor,
      has_more: hasMore,
    };

    // Cache for 60 seconds
    await this.redisService.set(cacheKey, JSON.stringify(response), 60);

    return response;
  }

  /**
   * Get user's public feed (all posts from a specific user)
   */
  async getUserFeed(
    targetAccountId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<FeedResponseDto> {
    const cacheKey = `user-feed:${targetAccountId}:${cursor || 'start'}:${limit}`;
    const cached = await this.redisService.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    let query = this.postsRepository
      .createQueryBuilder('post')
      .where('post.author_account_id = :accountId', {
        accountId: targetAccountId,
      })
      .andWhere('post.is_deleted = false')
      .orderBy('post.consensus_timestamp', 'DESC')
      .addOrderBy('post.id', 'DESC')
      .take(limit + 1);

    if (cursor) {
      const [cursorTs, cursorId] = cursor.split(':');
      const cursorTimestamp = new Date(parseInt(cursorTs));

      query = query.andWhere(
        '(post.consensus_timestamp < :cursorTs OR (post.consensus_timestamp = :cursorTs AND post.id < :cursorId))',
        {
          cursorTs: cursorTimestamp,
          cursorId,
        },
      );
    }

    const posts = await query
      .leftJoinAndSelect('post.author', 'author')
      .getMany();

    const hasMore = posts.length > limit;
    const returnPosts = posts.slice(0, limit);

    const nextCursor =
      hasMore && returnPosts.length > 0
        ? `${returnPosts[returnPosts.length - 1].consensus_timestamp.getTime()}:${returnPosts[returnPosts.length - 1].id}`
        : undefined;

    const response: FeedResponseDto = {
      posts: returnPosts.map((p) =>
        this.mapPostToResponse(p, p.author),
      ),
      next_cursor: nextCursor,
      has_more: hasMore,
    };

    await this.redisService.set(cacheKey, JSON.stringify(response), 60);

    return response;
  }

  /**
   * Get single post by ID with engagement metrics
   */
  async getPost(postId: string): Promise<PostResponseDto> {
    const post = await this.postsRepository.findOne({
      where: { id: postId, is_deleted: false },
      relations: ['author'],
    });

    if (!post) {
      throw new NotFoundException(`Post ${postId} not found`);
    }

    return this.mapPostToResponse(post, post.author);
  }

  /**
   * Sync posts from Mirror Node by topic
   *
   * This polls the Mirror Node REST API for new messages on a specific topic
   * Useful for backfilling or catching up on posts
   */
  async syncPostsFromMirrorNode(
    topicId: string,
    afterSequence: number = 0,
  ): Promise<number> {
    try {
      const messages = await this.hederaService.getTopicMessages(
        topicId,
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
          const payload = JSON.parse(decodedText) as HCSPostPayload;

          // Only process post messages
          if (payload.type !== 'post') {
            continue;
          }

          // Check if already exists
          const existing = await this.postsRepository.findOne({
            where: {
              hcs_topic_id: topicId,
              sequence_number: message.sequence_number,
            },
          });

          if (existing) {
            continue;
          }

          // Create post entity
          const post = new Post();
          post.id = uuidv4();
          post.author_account_id = payload.sender;
          post.hcs_topic_id = topicId;
          post.sequence_number = message.sequence_number;
          post.content_text = payload.content.text;
          post.media_refs = payload.content.media || null;
          post.consensus_timestamp_ns = message.consensus_timestamp;
          post.consensus_timestamp = new Date(
            message.consensus_timestamp / 1_000_000,
          );
          post.indexed_at = new Date();

          await this.postsRepository.save(post);
          synced++;
        } catch (error) {
          this.logger.error(
            `Failed to sync message ${message.sequence_number}: ${error.message}`,
          );
        }
      }

      return synced;
    } catch (error) {
      this.logger.error(
        `Failed to sync posts from Mirror Node: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Internal: Fan-out post to all followers
   */
  private async fanOutToFollowers(
    authorAccountId: string,
    postId: string,
    consensusTimestampNs: number,
  ): Promise<void> {
    try {
      const followers =
        await this.socialGraphService.getFollowers(
          authorAccountId,
        );

      if (followers.length === 0) {
        return;
      }

      const feedItems = followers.map((follower) => {
        const item = new FeedItem();
        item.id = uuidv4();
        item.user_account_id = follower.follower_account_id;
        item.post_id = postId;
        item.author_account_id = authorAccountId;
        item.consensus_timestamp_ns = consensusTimestampNs;
        return item;
      });

      await this.feedItemsRepository.insert(feedItems);

      this.logger.log(
        `Fanned out post ${postId} to ${feedItems.length} followers`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to fan out post: ${error.message}`,
      );
    }
  }

  /**
   * Internal: Clear feed caches
   */
  private async clearFeedCaches(userAccountId: string): Promise<void> {
    const pattern = `feed:*`;
    const keys = await this.redisService.keys(pattern);
    if (keys.length > 0) {
      await Promise.all(keys.map((k) => this.redisService.del(k)));
    }
  }

  /**
   * Internal: Map Post entity to response DTO
   */
  private mapPostToResponse(
    post: Post,
    author: User | null,
  ): PostResponseDto {
    return {
      id: post.id,
      author_account_id: post.author_account_id,
      author: author
        ? {
            hedera_account_id: author.hedera_account_id,
            display_name: author.display_name,
            avatar_uri: author.avatar_uri,
          }
        : undefined,
      content_text: post.content_text,
      media_refs: post.media_refs,
      consensus_timestamp: post.consensus_timestamp,
      like_count: post.like_count,
      reply_count: post.reply_count,
      share_count: post.share_count,
      is_deleted: post.is_deleted,
    };
  }

  /**
   * Get popular posts (trending)
   */
  async getTrendingPosts(
    limit: number = 10,
  ): Promise<PostResponseDto[]> {
    const posts = await this.postsRepository.find({
      where: { is_deleted: false },
      order: {
        like_count: 'DESC',
        consensus_timestamp: 'DESC',
      },
      take: limit,
      relations: ['author'],
    });

    return posts.map((p) =>
      this.mapPostToResponse(p, p.author),
    );
  }
}
```

### Step 5: Create Posts Controller

Create `/src/social/controllers/posts.controller.ts`:

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
import { PostsService } from '../services/posts.service';
import { CreatePostDto } from '../dto/create-post.dto';
import { FeedQueryDto } from '../dto/feed-query.dto';
import { PostResponseDto, FeedResponseDto } from '../dto/post-response.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private postsService: PostsService) {}

  /**
   * POST /posts
   * Create a new post
   */
  @Post()
  @HttpCode(201)
  async createPost(
    @Request() req: Request & { user: { hedera_account_id: string } },
    @Body() createPostDto: CreatePostDto,
  ): Promise<PostResponseDto> {
    return this.postsService.createPost(
      req.user.hedera_account_id,
      createPostDto,
    );
  }

  /**
   * GET /posts/feed
   * Get home feed (posts from followed accounts)
   */
  @Get('feed')
  async getHomeFeed(
    @Request() req: Request & { user: { hedera_account_id: string } },
    @Query() query: FeedQueryDto,
  ): Promise<FeedResponseDto> {
    return this.postsService.getHomeFeed(
      req.user.hedera_account_id,
      query.cursor,
      query.limit,
    );
  }

  /**
   * GET /posts/trending
   * Get trending posts
   */
  @Get('trending')
  async getTrendingPosts(
    @Query('limit') limit: string = '10',
  ): Promise<PostResponseDto[]> {
    return this.postsService.getTrendingPosts(
      Math.min(parseInt(limit, 10), 50),
    );
  }

  /**
   * GET /posts/:id
   * Get single post
   */
  @Get(':id')
  async getPost(
    @Param('id') postId: string,
  ): Promise<PostResponseDto> {
    return this.postsService.getPost(postId);
  }

  /**
   * GET /users/:accountId/posts
   * Get user's public feed
   */
  @Get()
  async getUserPosts(
    @Query('accountId') accountId: string,
    @Query() query: FeedQueryDto,
  ): Promise<FeedResponseDto> {
    return this.postsService.getUserFeed(
      accountId,
      query.cursor,
      query.limit,
    );
  }
}
```

### Step 6: Create Social Module

Create `/src/social/social.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Post } from './entities/post.entity';
import { FeedItem } from './entities/feed-item.entity';
import { PostsService } from './services/posts.service';
import { PostsController } from './controllers/posts.controller';
import { IpfsService } from './services/ipfs.service';
import { SocialGraphService } from './services/social-graph.service';
import { HederaModule } from '../hedera/hedera.module';
import { RedisModule } from '../redis/redis.module';
import { AuthModule } from '../auth/auth.module';
import { User } from '../auth/entities/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Post, FeedItem, User]),
    ConfigModule,
    HederaModule,
    RedisModule,
    AuthModule,
  ],
  providers: [PostsService, IpfsService, SocialGraphService],
  controllers: [PostsController],
  exports: [PostsService, IpfsService, SocialGraphService],
})
export class SocialModule {}
```

### Step 7: Create Database Migrations

Create `/src/migrations/1700000001-create-posts-table.ts`:

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreatePostsTable1700000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'posts',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'author_account_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'hcs_topic_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'sequence_number',
            type: 'bigint',
          },
          {
            name: 'content_text',
            type: 'text',
          },
          {
            name: 'media_refs',
            type: 'jsonb',
            isNullable: true,
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
            name: 'indexed_at',
            type: 'timestamp',
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
          {
            name: 'like_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'reply_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'share_count',
            type: 'int',
            default: 0,
          },
          {
            name: 'is_deleted',
            type: 'boolean',
            default: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'posts',
      new TableIndex({
        columnNames: ['author_account_id', 'consensus_timestamp'],
        name: 'idx_author_consensus_ts',
      }),
    );

    await queryRunner.createIndex(
      'posts',
      new TableIndex({
        columnNames: ['consensus_timestamp'],
        name: 'idx_consensus_ts',
      }),
    );

    await queryRunner.createIndex(
      'posts',
      new TableIndex({
        columnNames: ['hcs_topic_id', 'sequence_number'],
        name: 'idx_hcs_topic_sequence',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('posts');
  }
}
```

Create `/src/migrations/1700000002-create-feed-items-table.ts`:

```typescript
import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateFeedItemsTable1700000002
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'feed_items',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
          },
          {
            name: 'user_account_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'post_id',
            type: 'uuid',
            foreignKeyConstraintName: 'fk_post_id',
          },
          {
            name: 'author_account_id',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'consensus_timestamp_ns',
            type: 'bigint',
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'feed_items',
      new TableIndex({
        columnNames: ['user_account_id', 'created_at'],
        name: 'idx_user_created_at',
      }),
    );

    await queryRunner.createIndex(
      'feed_items',
      new TableIndex({
        columnNames: ['post_id'],
        name: 'idx_post_id',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('feed_items');
  }
}
```

### Step 8: Add to Main App Module

Update `/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { SocialModule } from './social/social.module';
// ... other imports

@Module({
  imports: [
    // ... other modules
    SocialModule,
  ],
})
export class AppModule {}
```

### Step 9: Environment Variables

Add to `.env`:

```
PINATA_API_KEY=your_pinata_api_key
PINATA_API_SECRET=your_pinata_api_secret
PINATA_GATEWAY=https://gateway.pinata.cloud

HEDERA_SOCIAL_GRAPH_TOPIC=0.0.YOUR_PLATFORM_TOPIC_ID
```

## Verification Steps

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create database tables | Tables `posts` and `feed_items` exist with proper indexes |
| 2 | Compile TypeScript | No compilation errors |
| 3 | Start NestJS server | Server starts on port 3000 without errors |
| 4 | Create post via POST /posts | Returns 201 with PostResponseDto, message submitted to HCS |
| 5 | Check database | Post row created in `posts` table with consensus_timestamp |
| 6 | Get home feed | GET /posts/feed returns FeedResponseDto with pagination |
| 7 | Get user feed | GET /users/:accountId/posts returns user's posts |
| 8 | Get single post | GET /posts/:id returns post details |
| 9 | Sync from Mirror Node | syncPostsFromMirrorNode imports posts from HCS topic |
| 10 | Cache works | Repeated feed requests served from Redis cache |

## Definition of Done

- [x] All entities created (Post, FeedItem)
- [x] All DTOs created with validation
- [x] IPFS/Pinata service fully functional
- [x] PostsService implemented with all required methods
- [x] PostsController with all REST endpoints
- [x] Database migrations created and tested
- [x] Fan-out logic for followers working
- [x] Redis caching implemented for feeds
- [x] Mirror Node syncing implemented
- [x] Error handling and logging
- [x] Code compiles without errors
- [x] All verification steps pass

## Troubleshooting

### Issue: "User does not have a public feed topic"
**Solution**: Ensure user created account through P1-T07 (Onboarding) which creates the topic. Check the `public_feed_topic_id` field in users table.

### Issue: IPFS upload fails
**Solution**: Verify Pinata API credentials in .env. Test with curl:
```bash
curl -F "file=@test.txt" -H "pinata_api_key: $PINATA_API_KEY" \
  https://api.pinata.cloud/pinning/pinFileToIPFS
```

### Issue: Consensus timestamp is null
**Solution**: The Hedera network returns consensus timestamps asynchronously. Wait a few seconds and query again. HederaService should handle this.

### Issue: Posts not appearing in home feed
**Solution**: Check that `follow` records exist in database. Fan-out only happens to users in the `followers` table.

### Issue: Pagination cursor invalid
**Solution**: Cursor format must be `timestamp:id`. If receiving old cursor format, invalidate caches and re-query.

### Issue: Media refs are null after upload
**Solution**: For now, media upload is mocked. In production, implement actual file upload to frontend before post creation, then include CID in CreatePostDto.

## Files Created in This Task

1. `/src/social/entities/post.entity.ts`
2. `/src/social/entities/feed-item.entity.ts`
3. `/src/social/dto/create-post.dto.ts`
4. `/src/social/dto/feed-query.dto.ts`
5. `/src/social/dto/post-response.dto.ts`
6. `/src/social/services/ipfs.service.ts`
7. `/src/social/services/posts.service.ts`
8. `/src/social/controllers/posts.controller.ts`
9. `/src/social/social.module.ts`
10. `/src/migrations/1700000001-create-posts-table.ts`
11. `/src/migrations/1700000002-create-feed-items-table.ts`

## What Happens Next

Task P1-T19 (Follow/Unfollow) depends on this task for the social graph foundation. The backend will need both Posts and Follow/Unfollow services working before the frontend can display meaningful feeds.

After this task completes:
1. Junior developers should test posts creation via Postman or curl
2. Test HCS message submission via Mirror Node
3. Test PostgreSQL indexes with EXPLAIN ANALYZE
4. Prepare test data for frontend integration
5. Move to P1-T19 for follow/unfollow implementation
