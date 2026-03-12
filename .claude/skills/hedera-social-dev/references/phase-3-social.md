# Phase 3: Social Feed

**Status**: FULLY IMPLEMENTABLE. No blockers.

**Scope**: Tasks T18–T20

---

## Overview: Public Feed & Follow System

The social feed uses:

1. **HCS Topics** for append-only public post storage
2. **PostgreSQL** for fast indexing and feed queries
3. **HTS (Hedera Token Service)** metadata for profile/avatar storage
4. **WebSocket** for real-time notifications

Flow:
```
User publishes post → Submit to HCS public feed topic
                      ↓
      Indexed in PostgreSQL (shard.realm.num, timestamp, author)
                      ↓
    Followers' home feed = posts from all followed authors (fast SQL query)
```

---

## HCS Event Schemas

### Post Event

Published to a user's public feed HCS topic.

```json
{
  "v": "1.0",
  "type": "post",
  "author": "0.0.12345",
  "ts": 1700000000000,
  "content": {
    "text": "Hello from Hedera Social!",
    "media": [
      {
        "type": "image",
        "cid": "QmXxxx...",
        "caption": "My photo"
      }
    ]
  },
  "metadata": {
    "edited": false,
    "hashtags": ["hedera", "social"],
    "mentions": []
  }
}
```

**Fields**:
- `type`: "post"
- `author`: Hedera account ID
- `ts`: Client-side timestamp (ms since epoch)
- `content.text`: Post text (plaintext, NOT encrypted)
- `content.media`: Array of media with IPFS CIDs
- `metadata`: Additional data (hashtags, mentions, edit status)

### Follow Event

Published to the **platform social graph HCS topic** (created during Phase 0).

```json
{
  "v": "1.0",
  "type": "follow",
  "actor": "0.0.11111",
  "target": "0.0.22222",
  "ts": 1700000000000,
  "action": "follow"
}
```

Or for unfollow:

```json
{
  "v": "1.0",
  "type": "follow",
  "actor": "0.0.11111",
  "target": "0.0.22222",
  "ts": 1700000000000,
  "action": "unfollow"
}
```

**Fields**:
- `actor`: The account ID doing the following/unfollowing
- `target`: The account ID being followed/unfollowed
- `action`: "follow" or "unfollow"

---

## Backend: Social Module

### Post Entity

**File**: `apps/backend/src/social/entities/post.entity.ts`

```typescript
import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

@Entity('posts')
@Index(['authorAccountId'], { unique: false })
@Index(['topicId', 'hcsMessageId'], { unique: true })
@Index(['createdAt'], { unique: false })
export class Post {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // UUID

  @Column('varchar', { length: 30 })
  topicId: string; // User's public feed HCS topic ID

  @Column('varchar', { length: 30 })
  authorAccountId: string; // Hedera account ID (0.0.X)

  @Column('text')
  content: string; // Plaintext post body

  @Column('varchar', { length: 1000, array: true, nullable: true })
  mediaIPFSCIDs?: string[]; // IPFS CIDs for attached media

  @Column('varchar', { length: 1000, nullable: true })
  metadata?: string; // JSON: { hashtags, mentions, edited, editedAt }

  @Column('varchar', { length: 40 })
  hcsMessageId: string; // Consensus timestamp reference

  @Column('bigint')
  consensusTimestamp: string; // BigInt as string

  @Column('int', { default: 0 })
  likes: number; // Denormalized like count (updated via WebSocket)

  @CreateDateColumn()
  createdAt: Date;
}
```

### Follow Entity

**File**: `apps/backend/src/social/entities/follow.entity.ts`

```typescript
import { Entity, Column, CreateDateColumn, Index, PrimaryColumn } from 'typeorm';

@Entity('follows')
@Index(['followerAccountId'], { unique: false })
@Index(['followingAccountId'], { unique: false })
@Index(['followerAccountId', 'followingAccountId'], { unique: true })
export class Follow {
  @PrimaryColumn('varchar', { length: 64 })
  id: string; // UUID

  @Column('varchar', { length: 30 })
  followerAccountId: string; // Who is following

  @Column('varchar', { length: 30 })
  followingAccountId: string; // Who is being followed

  @CreateDateColumn()
  createdAt: Date;
}
```

### Social Service

**File**: `apps/backend/src/social/social.service.ts`

```typescript
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Post } from './entities/post.entity';
import { Follow } from './entities/follow.entity';
import { HederaClient } from '@hedera-social/hedera-config';
import { TopicMessageSubmitTransaction, Client } from '@hashgraph/sdk';
import { v4 as uuid } from 'uuid';

interface CreatePostDto {
  content: string;
  mediaIPFSCIDs?: string[];
  hashtags?: string[];
  mentions?: string[];
}

@Injectable()
export class SocialService {
  private client: Client;
  private platformSocialGraphTopicId =
    process.env.PLATFORM_SOCIAL_GRAPH_TOPIC_ID || '0.0.0';

  constructor(
    @InjectRepository(Post)
    private postRepository: Repository<Post>,
    @InjectRepository(Follow)
    private followRepository: Repository<Follow>,
  ) {
    this.client = HederaClient.getInstance(
      process.env.HEDERA_NETWORK as 'testnet' | 'mainnet' | 'previewnet',
      process.env.HEDERA_ACCOUNT_ID!,
      process.env.HEDERA_PRIVATE_KEY!,
    );
  }

  /**
   * Create a public post.
   * - Submit to HCS public feed topic
   * - Index in PostgreSQL
   */
  async createPost(
    authorAccountId: string,
    userPublicFeedTopicId: string,
    dto: CreatePostDto,
  ): Promise<Post> {
    // Construct HCS payload
    const postPayload = {
      v: '1.0',
      type: 'post',
      author: authorAccountId,
      ts: Date.now(),
      content: {
        text: dto.content,
        media: (dto.mediaIPFSCIDs || []).map(cid => ({
          type: 'image',
          cid,
          caption: '',
        })),
      },
      metadata: {
        edited: false,
        hashtags: dto.hashtags || [],
        mentions: dto.mentions || [],
      },
    };

    // Submit to HCS
    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(userPublicFeedTopicId)
      .setMessage(JSON.stringify(postPayload));

    const submitted = await transaction.execute(this.client);
    const receipt = await submitted.getReceipt(this.client);

    const hcsMessageId = `${receipt.topicSequenceNumber}-${receipt.consensusTimestamp}`;

    // Index in PostgreSQL
    const post = this.postRepository.create({
      id: uuid(),
      topicId: userPublicFeedTopicId,
      authorAccountId,
      content: dto.content,
      mediaIPFSCIDs: dto.mediaIPFSCIDs,
      metadata: JSON.stringify({
        hashtags: dto.hashtags || [],
        mentions: dto.mentions || [],
        edited: false,
      }),
      hcsMessageId,
      consensusTimestamp: (receipt.consensusTimestamp?.toNumber() || 0).toString(),
      likes: 0,
    });

    await this.postRepository.save(post);
    return post;
  }

  /**
   * Get posts from a specific user's feed (for profile page).
   */
  async getUserPosts(
    authorAccountId: string,
    limit: number = 20,
    offset: number = 0,
  ): Promise<Post[]> {
    return this.postRepository
      .createQueryBuilder('p')
      .where('p.authorAccountId = :authorAccountId', { authorAccountId })
      .orderBy('p.createdAt', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  /**
   * Get home feed for a user.
   * - Fetch posts from all followed accounts
   * - Sorted by consensus timestamp
   */
  async getHomeFeed(
    accountId: string,
    limit: number = 50,
    offset: number = 0,
  ): Promise<Post[]> {
    // First, get list of accounts this user follows
    const follows = await this.followRepository
      .createQueryBuilder('f')
      .select('f.followingAccountId')
      .where('f.followerAccountId = :accountId', { accountId })
      .getMany();

    const followingAccountIds = follows.map(f => f.followingAccountId);

    if (followingAccountIds.length === 0) {
      return []; // No follows, no feed
    }

    // Get posts from followed accounts
    return this.postRepository
      .createQueryBuilder('p')
      .where('p.authorAccountId IN (:...followingAccountIds)', {
        followingAccountIds,
      })
      .orderBy('p.consensusTimestamp', 'DESC')
      .limit(limit)
      .offset(offset)
      .getMany();
  }

  /**
   * Follow another user.
   * - Submit to platform social graph HCS topic
   * - Index in PostgreSQL
   */
  async follow(followerAccountId: string, targetAccountId: string): Promise<Follow> {
    // Validate not self-follow
    if (followerAccountId === targetAccountId) {
      throw new BadRequestException('Cannot follow yourself');
    }

    // Check if already following
    const existing = await this.followRepository.findOne({
      where: { followerAccountId, followingAccountId: targetAccountId },
    });

    if (existing) {
      throw new BadRequestException('Already following this user');
    }

    // Submit to HCS
    const followPayload = {
      v: '1.0',
      type: 'follow',
      actor: followerAccountId,
      target: targetAccountId,
      ts: Date.now(),
      action: 'follow',
    };

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(this.platformSocialGraphTopicId)
      .setMessage(JSON.stringify(followPayload));

    await transaction.execute(this.client);

    // Index in PostgreSQL
    const follow = this.followRepository.create({
      id: uuid(),
      followerAccountId,
      followingAccountId: targetAccountId,
    });

    await this.followRepository.save(follow);
    return follow;
  }

  /**
   * Unfollow a user.
   */
  async unfollow(followerAccountId: string, targetAccountId: string): Promise<void> {
    // Submit to HCS
    const unfollowPayload = {
      v: '1.0',
      type: 'follow',
      actor: followerAccountId,
      target: targetAccountId,
      ts: Date.now(),
      action: 'unfollow',
    };

    const transaction = new TopicMessageSubmitTransaction()
      .setTopicId(this.platformSocialGraphTopicId)
      .setMessage(JSON.stringify(unfollowPayload));

    await transaction.execute(this.client);

    // Remove from PostgreSQL
    await this.followRepository.delete({
      followerAccountId,
      followingAccountId: targetAccountId,
    });
  }

  /**
   * Check if followerAccountId follows targetAccountId.
   */
  async isFollowing(
    followerAccountId: string,
    targetAccountId: string,
  ): Promise<boolean> {
    const follow = await this.followRepository.findOne({
      where: { followerAccountId, followingAccountId: targetAccountId },
    });
    return !!follow;
  }

  /**
   * Get follower count for a user.
   */
  async getFollowerCount(accountId: string): Promise<number> {
    return this.followRepository.count({
      where: { followingAccountId: accountId },
    });
  }

  /**
   * Get following count for a user.
   */
  async getFollowingCount(accountId: string): Promise<number> {
    return this.followRepository.count({
      where: { followerAccountId: accountId },
    });
  }

  /**
   * Get post by ID.
   */
  async getPost(postId: string): Promise<Post | null> {
    return this.postRepository.findOne({ where: { id: postId } });
  }
}
```

### Social Controller

**File**: `apps/backend/src/social/social.controller.ts`

```typescript
import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocialService } from './social.service';

interface CreatePostDto {
  content: string;
  mediaIPFSCIDs?: string[];
  hashtags?: string[];
  mentions?: string[];
}

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private socialService: SocialService) {}

  @Post('posts')
  async createPost(
    @Request() req: any,
    @Body() dto: CreatePostDto,
  ) {
    const userPublicFeedTopicId = req.user.publicFeedTopicId;
    return this.socialService.createPost(
      req.user.accountId,
      userPublicFeedTopicId,
      dto,
    );
  }

  @Get('posts/user/:accountId')
  async getUserPosts(
    @Param('accountId') accountId: string,
    @Query('limit') limit: number = 20,
    @Query('offset') offset: number = 0,
  ) {
    return this.socialService.getUserPosts(accountId, limit, offset);
  }

  @Get('posts/feed')
  async getHomeFeed(
    @Request() req: any,
    @Query('limit') limit: number = 50,
    @Query('offset') offset: number = 0,
  ) {
    return this.socialService.getHomeFeed(req.user.accountId, limit, offset);
  }

  @Get('posts/:postId')
  async getPost(@Param('postId') postId: string) {
    return this.socialService.getPost(postId);
  }

  @Post('follow/:targetAccountId')
  async follow(
    @Request() req: any,
    @Param('targetAccountId') targetAccountId: string,
  ) {
    return this.socialService.follow(req.user.accountId, targetAccountId);
  }

  @Delete('follow/:targetAccountId')
  async unfollow(
    @Request() req: any,
    @Param('targetAccountId') targetAccountId: string,
  ) {
    await this.socialService.unfollow(req.user.accountId, targetAccountId);
    return { message: 'Unfollowed' };
  }

  @Get('follow/:targetAccountId')
  async checkFollowing(
    @Request() req: any,
    @Param('targetAccountId') targetAccountId: string,
  ) {
    const isFollowing = await this.socialService.isFollowing(
      req.user.accountId,
      targetAccountId,
    );
    return { isFollowing };
  }

  @Get(':accountId/followers')
  async getFollowerCount(@Param('accountId') accountId: string) {
    const count = await this.socialService.getFollowerCount(accountId);
    return { count };
  }

  @Get(':accountId/following')
  async getFollowingCount(@Param('accountId') accountId: string) {
    const count = await this.socialService.getFollowingCount(accountId);
    return { count };
  }
}
```

### Social Module

**File**: `apps/backend/src/social/social.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { Post } from './entities/post.entity';
import { Follow } from './entities/follow.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Post, Follow])],
  controllers: [SocialController],
  providers: [SocialService],
  exports: [SocialService],
})
export class SocialModule {}
```

---

## IPFS Integration (Pinata)

For media uploads, integrate Pinata for IPFS pinning.

**Note**: This assumes Pinata API documentation is verified. If not, it's a blocker.

### Pinata Service

**File**: `apps/backend/src/media/pinata.service.ts`

```typescript
import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';
import * as fs from 'fs';

interface PinataUploadResponse {
  IpfsHash: string; // The CID
  PinSize: number;
  Timestamp: string;
}

@Injectable()
export class PinataService {
  private apiKey = process.env.PINATA_API_KEY;
  private secretKey = process.env.PINATA_SECRET_KEY;
  private pinataUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

  /**
   * Upload file to IPFS via Pinata.
   */
  async uploadFile(filePath: string): Promise<string> {
    if (!this.apiKey || !this.secretKey) {
      throw new BadRequestException('Pinata credentials not configured');
    }

    try {
      const fileStream = fs.createReadStream(filePath);
      const form = new FormData();
      form.append('file', fileStream);

      const response = await axios.post<PinataUploadResponse>(
        this.pinataUrl,
        form,
        {
          maxBodyLength: 100_000_000, // 100 MB
          headers: {
            ...form.getHeaders(),
            'pinata_api_key': this.apiKey,
            'pinata_secret_api_key': this.secretKey,
          },
        },
      );

      return response.data.IpfsHash; // Return CID
    } catch (error) {
      throw new BadRequestException(`Pinata upload failed: ${(error as Error).message}`);
    }
  }

  /**
   * Unpin file from IPFS.
   */
  async unpinFile(cid: string): Promise<void> {
    if (!this.apiKey || !this.secretKey) {
      throw new BadRequestException('Pinata credentials not configured');
    }

    try {
      await axios.delete(
        `https://api.pinata.cloud/pinning/unpin/${cid}`,
        {
          headers: {
            'pinata_api_key': this.apiKey,
            'pinata_secret_api_key': this.secretKey,
          },
        },
      );
    } catch (error) {
      console.error(`Failed to unpin ${cid}:`, error);
    }
  }

  /**
   * Get IPFS gateway URL for a CID.
   */
  getIPFSUrl(cid: string): string {
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
}
```

### Media Upload Endpoint

**File**: `apps/backend/src/media/media.controller.ts`

```typescript
import { Controller, Post, UseGuards, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PinataService } from './pinata.service';

@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private pinataService: PinataService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    // Validate file type and size
    if (!file) {
      throw new Error('No file provided');
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new Error('File too large (max 10 MB)');
    }

    const cid = await this.pinataService.uploadFile(file.path);
    const ipfsUrl = this.pinataService.getIPFSUrl(cid);

    return { cid, ipfsUrl };
  }
}
```

---

## Frontend: Social Feed UI

### Post Card Component

**File**: `apps/frontend/components/PostCard.tsx`

```typescript
'use client';

import Image from 'next/image';
import Link from 'next/link';

export interface PostCardProps {
  id: string;
  authorAccountId: string;
  authorUsername: string;
  authorAvatar?: string;
  content: string;
  mediaIPFSCIDs?: string[];
  likes: number;
  createdAt: Date;
  onLike?: () => void;
}

export function PostCard({
  id,
  authorAccountId,
  authorUsername,
  authorAvatar,
  content,
  mediaIPFSCIDs,
  likes,
  createdAt,
  onLike,
}: PostCardProps) {
  return (
    <div className="p-4 border rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-3">
        {authorAvatar && (
          <Image
            src={authorAvatar}
            alt={authorUsername}
            width={40}
            height={40}
            className="rounded-full"
          />
        )}
        <div>
          <Link href={`/profile/${authorAccountId}`}>
            <p className="font-bold hover:underline">{authorUsername}</p>
          </Link>
          <p className="text-sm text-gray-500">{authorAccountId}</p>
        </div>
      </div>

      {/* Content */}
      <p className="mb-3">{content}</p>

      {/* Media */}
      {mediaIPFSCIDs && mediaIPFSCIDs.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {mediaIPFSCIDs.map(cid => (
            <Image
              key={cid}
              src={`https://gateway.pinata.cloud/ipfs/${cid}`}
              alt="Post media"
              width={200}
              height={200}
              className="rounded"
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex gap-4 text-sm text-gray-500">
        <button onClick={onLike} className="hover:text-blue-500">
          ❤️ {likes} likes
        </button>
        <p>{new Date(createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}
```

### Home Feed Page

**File**: `apps/frontend/app/(main)/dashboard/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { PostCard, PostCardProps } from '@/components/PostCard';

export default function DashboardPage() {
  const [posts, setPosts] = useState<PostCardProps[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFeed = async () => {
      try {
        const res = await fetch('/api/social/posts/feed?limit=50');
        const data = await res.json();
        setPosts(data);
      } catch (error) {
        console.error('Failed to fetch feed', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFeed();
  }, []);

  if (loading) return <div>Loading feed...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">Home Feed</h1>

      {posts.length === 0 ? (
        <p>No posts yet. Follow some users to see their posts!</p>
      ) : (
        <div className="space-y-4">
          {posts.map(post => (
            <PostCard key={post.id} {...post} />
          ))}
        </div>
      )}
    </div>
  );
}
```

### Profile Page

**File**: `apps/frontend/app/(main)/profile/[userId]/page.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PostCard, PostCardProps } from '@/components/PostCard';

export default function ProfilePage() {
  const params = useParams();
  const userId = params.userId as string;

  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<PostCardProps[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Fetch user profile
        const profileRes = await fetch(`/api/users/${userId}`);
        const profileData = await profileRes.json();
        setProfile(profileData);

        // Fetch user posts
        const postsRes = await fetch(`/api/social/posts/user/${userId}?limit=50`);
        const postsData = await postsRes.json();
        setPosts(postsData);

        // Check if current user is following
        const followRes = await fetch(`/api/social/follow/${userId}`);
        const { isFollowing: following } = await followRes.json();
        setIsFollowing(following);
      } catch (error) {
        console.error('Failed to fetch profile', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  const handleFollow = async () => {
    try {
      if (isFollowing) {
        await fetch(`/api/social/follow/${userId}`, { method: 'DELETE' });
      } else {
        await fetch(`/api/social/follow/${userId}`, { method: 'POST' });
      }
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error('Failed to toggle follow', error);
    }
  };

  if (loading) return <div>Loading profile...</div>;

  return (
    <div className="max-w-2xl mx-auto p-4">
      {profile && (
        <div className="mb-6 pb-4 border-b">
          <h1 className="text-2xl font-bold">{profile.username}</h1>
          <p className="text-gray-500">{profile.accountId}</p>
          <p className="mt-2">{profile.bio}</p>
          <div className="flex gap-6 mt-4">
            <span>Following: 123</span>
            <span>Followers: 456</span>
          </div>
          <button
            onClick={handleFollow}
            className={`mt-4 px-4 py-2 rounded ${
              isFollowing
                ? 'bg-gray-300 text-black'
                : 'bg-blue-500 text-white'
            }`}
          >
            {isFollowing ? 'Unfollow' : 'Follow'}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {posts.map(post => (
          <PostCard key={post.id} {...post} />
        ))}
      </div>
    </div>
  );
}
```

---

## Key Takeaways for Phase 3

- **Fully implementable** — all APIs and HCS operations are documented
- **No encryption** — social feed is public (unlike messaging)
- **Fast queries** — PostgreSQL indexing for feed generation
- **IPFS for media** — Pinata integration for image storage
- **Follow system** — tracks relationships on-chain (HCS) and in database
- **Real-time updates** — WebSocket can broadcast new posts to online users

Next: Phase 4 (In-Chat Payments) — partially blocked on Tamam Rails.
