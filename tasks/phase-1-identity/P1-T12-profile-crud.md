# P1-T12: Profile View & Update

| Field | Value |
|-------|-------|
| Task ID | P1-T12 |
| Priority | 🔴 P0 — Critical Path |
| Estimated Time | 3 hours |
| Depends On | P1-T11 (KYC & DID NFT) |
| Phase | 1 — Identity & Onboarding |
| Assignee | Backend Developer |
| Module | Identity & Onboarding (Spec Section 2.1, FR-ID-006/007) |
| Hedera Transactions | Profile update only: 1x TokenWipe, 1x TokenMint, 1x TokenFreeze (~$0.052) |

---

## Objective

Implement user profile endpoints: GET /api/v1/profile/:accountId (public view), PUT /api/v1/profile/me (authenticated update), and GET /api/v1/users/search?q= (user search). When a profile is updated, automatically mint a new DID NFT with updated metadata while wiping the old one.

---

## Background

**Profile Visibility:**
- Public endpoint: GET /api/v1/profile/:accountId — anyone can view any user's public profile
- Private endpoint: PUT /api/v1/profile/me — only authenticated user can update their own profile
- Updates include: display name, bio, avatar, location (individual), or company info (business)

**DID NFT Updates:**
- When profile changes, a new NFT must be minted with updated metadata
- Old NFT is wiped (destroyed) from user's account
- New NFT is frozen again (soulbound)
- This ensures the on-chain DID NFT always reflects current identity

**Search:**
- Simple endpoint for finding users by name
- Used for: adding people to group chats, following, mentioning
- Indexed in Postgres (simple LIKE search for hackathon, Meilisearch in production)

**Spec References:**
- FR-ID-006: Profile View (docs/SPECIFICATION.md Section 2.1)
- FR-ID-007: Profile Update (docs/SPECIFICATION.md Section 2.1)
- API endpoints Section 5.2.1

---

## Pre-requisites

Before you start, make sure:

1. **P1-T11 Complete** — Users can have active status with DID NFTs
2. **Dependencies** — @hashgraph/sdk, TypeORM already installed
3. **Database** — User table has all fields from P1-T10/T11
4. **Environment** — Hedera credentials configured

---

## Step-by-Step Instructions

### Step 1: Create Profile Service

Create file `packages/api/src/profile/services/profile.service.ts`:

```typescript
import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { UsersService } from '../../users/services/users.service';
import { IpfsService } from '../../ipfs/services/ipfs.service';
import { HederaService } from '../../hedera/services/hedera.service';
import { User } from '@hedera-social/shared';

/**
 * Profile Service — Read and update user profiles
 *
 * Features:
 * - Get public profile by Hedera Account ID
 * - Update authenticated user's profile
 * - Search users by name
 * - Auto-update DID NFT on profile changes
 */
@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private usersService: UsersService,
    private ipfsService: IpfsService,
    private hederaService: HederaService,
  ) {}

  /**
   * Get public profile by Hedera Account ID
   * Returns profile info visible to everyone
   *
   * @param hederaAccountId - Hedera Account ID (0.0.XXXXX)
   * @returns PublicProfile object
   */
  async getPublicProfile(hederaAccountId: string): Promise<Record<string, unknown>> {
    try {
      this.logger.log(`Fetching public profile for ${hederaAccountId}`);

      // Find user by Hedera Account ID
      const user = await this.usersService.findByHederaAccountId(hederaAccountId);

      if (!user) {
        throw new NotFoundException(
          `User with Hedera account ${hederaAccountId} not found`,
        );
      }

      // Build public profile response
      return this.buildPublicProfile(user);
    } catch (error) {
      this.logger.error(`Failed to get public profile: ${error.message}`);
      throw error;
    }
  }

  /**
   * Build public profile DTO from user entity
   * Includes: name, avatar, bio, stats (followers/following/posts), DID NFT info
   *
   * @param user - User entity from database
   * @returns PublicProfile DTO
   */
  private buildPublicProfile(user: User): Record<string, unknown> {
    return {
      // Identity
      hederaAccountId: user.hederaAccountId,
      displayName: user.displayName || 'Anonymous',
      bio: user.bio || '',
      avatarCid: user.avatarIpfsCid,
      avatarUrl: user.avatarIpfsCid
        ? this.ipfsService.getGatewayUrl(user.avatarIpfsCid)
        : null,

      // Account info
      accountType: user.accountType,
      status: user.status,
      kycLevel: user.kycLevel,
      createdAt: user.createdAt,

      // DID NFT info (soulbound identity proof)
      didNft: {
        serial: user.didNftSerial,
        metadataCid: user.didNftMetadataCid,
        metadataUrl: user.didNftMetadataCid
          ? this.ipfsService.getGatewayUrl(user.didNftMetadataCid)
          : null,
      },

      // Business info (if business account)
      ...(user.accountType === 'business' && user.businessProfile && {
        business: {
          companyName: user.businessProfile.companyName,
          category: user.businessProfile.businessCategory,
          website: user.businessProfile.website,
          businessHours: user.businessProfile.businessHours,
        },
      }),

      // Topics (for reference, not directly useful but informative)
      topics: {
        publicFeed: user.publicFeedTopic,
        notifications: user.notificationTopic,
        broadcast: user.broadcastTopic || null,
      },

      // Stats (stub for now — will be populated from indexing in later tasks)
      stats: {
        followers: 0, // TODO: Index from HCS social graph
        following: 0, // TODO: Index from HCS social graph
        posts: 0, // TODO: Index from HCS messages
      },
    };
  }

  /**
   * Update user's profile (authenticated endpoint)
   *
   * Allows updating:
   * - displayName, bio, avatar (all accounts)
   * - location (individual accounts)
   * - company info (business accounts)
   *
   * When avatar changes:
   * - Upload new image to IPFS
   * - Build new DID NFT metadata
   * - Wipe old NFT, mint new NFT
   * - Update user record
   *
   * @param userId - Authenticated user's ID
   * @param updateData - Partial user data to update
   * @returns Updated profile
   */
  async updateProfile(userId: string, updateData: { displayName?: string; bio?: string; avatarFile?: { buffer: Buffer; mimetype: string } }): Promise<Record<string, unknown>> {
    try {
      this.logger.log(`Updating profile for user ${userId}`);

      // Fetch user
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new NotFoundException(`User ${userId} not found`);
      }

      // Only active users can update profile
      if (user.status !== 'active') {
        throw new BadRequestException(
          `Cannot update profile when status is ${user.status}. ` +
          `Complete onboarding first.`,
        );
      }

      // If avatar changed, upload new one to IPFS
      let newAvatarCid: string | undefined;
      if (updateData.avatarFile) {
        this.logger.log(`Uploading new avatar for user ${userId}`);
        newAvatarCid = await this.ipfsService.uploadFile(
          updateData.avatarFile.buffer,
          `avatar-${userId}.jpg`,
          updateData.avatarFile.mimetype,
        );
      }

      // Prepare user updates
      const userUpdates: Partial<User> = {};
      if (updateData.displayName) userUpdates.displayName = updateData.displayName;
      if (updateData.bio) userUpdates.bio = updateData.bio;
      if (newAvatarCid) userUpdates.avatarIpfsCid = newAvatarCid;

      // If profile changed significantly, update DID NFT
      const profileChanged = newAvatarCid || updateData.displayName || updateData.bio;
      if (profileChanged && user.status === 'active') {
        this.logger.log(`Profile changed, updating DID NFT for user ${userId}`);

        // Build updated metadata
        const updatedUser = { ...user, ...userUpdates };
        const newMetadata = this.ipfsService.constructDidNftMetadata(
          updatedUser,
          newAvatarCid,
        );

        // Upload metadata to IPFS
        const newMetadataCid = await this.ipfsService.uploadJson(
          newMetadata,
          `did-nft-${userId}-updated.json`,
        );

        // Wipe old NFT
        if (user.didNftSerial) {
          this.logger.log(`Wiping old DID NFT (serial ${user.didNftSerial})`);
          await this.hederaService.wipeToken(user.hederaAccountId);
        }

        // Mint new NFT with updated metadata
        const mintResult = await this.hederaService.mintDidNft(
          user.hederaAccountId,
          newMetadataCid,
        );

        // Freeze new NFT
        await this.hederaService.freezeToken(user.hederaAccountId);

        // Update user with new NFT info
        userUpdates.didNftSerial = mintResult.serial;
        userUpdates.didNftMetadataCid = newMetadataCid;

        this.logger.log(
          `DID NFT updated: serial #${mintResult.serial}, CID: ${newMetadataCid}`,
        );
      }

      // Update user record
      const updatedUser = await this.usersService.update(userId, userUpdates);

      // Return updated profile
      return this.buildPublicProfile(updatedUser);
    } catch (error: unknown) {
      this.logger.error(`Failed to update profile: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Search users by name
   * Simple LIKE query on displayName field
   * For hackathon — in production would use Meilisearch or Elasticsearch
   *
   * @param query - Search query (name fragment)
   * @param limit - Max results (default 20)
   * @returns Array of public profiles
   */
  async searchUsers(query: string, limit: number = 20): Promise<Record<string, unknown>[]> {
    try {
      if (!query || query.trim().length < 2) {
        throw new BadRequestException(
          'Search query must be at least 2 characters',
        );
      }

      this.logger.log(`Searching users for: "${query}"`);

      // TODO: Call usersService.search() method
      // For now, return empty array
      // In P2, implement Meilisearch integration
      return [];
    } catch (error: unknown) {
      this.logger.error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Get user's own profile (authenticated)
   * Returns full profile including private fields
   *
   * @param userId - Authenticated user's ID
   * @returns User's own profile with full details
   */
  async getMyProfile(userId: string): Promise<Record<string, unknown>> {
    try {
      const user = await this.usersService.findById(userId);
      if (!user) {
        throw new NotFoundException(`User ${userId} not found`);
      }

      const publicProfile = this.buildPublicProfile(user);

      // Add private fields visible only to owner
      return {
        ...publicProfile,
        email: user.email,
        phone: user.phone,
        isOwner: true,
      };
    } catch (error: unknown) {
      this.logger.error(`Failed to get own profile: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
```

### Step 2: Create Profile Controller

Create file `packages/api/src/profile/controllers/profile.controller.ts`:

```typescript
import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseGuards,
  UseInterceptors,
  FileInterceptor,
  UploadedFile,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ProfileService } from '../services/profile.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('api/v1/profile')
export class ProfileController {
  private readonly logger = new Logger(ProfileController.name);

  constructor(private profileService: ProfileService) {}

  /**
   * GET /api/v1/profile/:accountId
   *
   * Get public profile by Hedera Account ID
   * Public endpoint — no authentication required
   * Returns: name, avatar, bio, DID NFT info, stats
   *
   * Example: GET /api/v1/profile/0.0.123456
   *
   * Response (200 OK):
   * ```json
   * {
   *   "hederaAccountId": "0.0.123456",
   *   "displayName": "John Doe",
   *   "bio": "Web3 enthusiast",
   *   "avatarCid": "QmX1234...",
   *   "avatarUrl": "https://gateway.pinata.cloud/ipfs/QmX1234...",
   *   "accountType": "individual",
   *   "status": "active",
   *   "kycLevel": "basic",
   *   "didNft": {
   *     "serial": 1,
   *     "metadataCid": "QmY5678...",
   *     "metadataUrl": "https://gateway.pinata.cloud/ipfs/QmY5678..."
   *   },
   *   "topics": {
   *     "publicFeed": "0.0.999999",
   *     "notifications": "0.0.888888",
   *     "broadcast": null
   *   },
   *   "stats": {
   *     "followers": 42,
   *     "following": 15,
   *     "posts": 7
   *   },
   *   "createdAt": "2026-03-11T10:00:00Z"
   * }
   * ```
   *
   * Errors:
   * - 404: Account not found
   */
  @Get(':accountId')
  @HttpCode(HttpStatus.OK)
  async getProfile(@Param('accountId') accountId: string) {
    this.logger.log(`Getting public profile for ${accountId}`);

    try {
      return await this.profileService.getPublicProfile(accountId);
    } catch (error: unknown) {
      this.logger.error(`Failed to get profile: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * GET /api/v1/profile/me
   *
   * Get authenticated user's own profile
   * Returns full profile including private fields (email, phone)
   *
   * REQUIRES: Valid JWT token
   *
   * Response (200 OK): Same as GET /:accountId, plus email and phone
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getMyProfile(@CurrentUser() user: { id: string; hederaAccountId: string; email?: string }) {
    this.logger.log(`Getting own profile for user ${user.id}`);

    try {
      return await this.profileService.getMyProfile(user.id);
    } catch (error: unknown) {
      this.logger.error(`Failed to get own profile: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * PUT /api/v1/profile/me
   *
   * Update authenticated user's profile
   * Multipart form with: displayName, bio, avatarFile (optional), location (individual), companyName (business)
   *
   * REQUIRES: Valid JWT token
   *
   * Request:
   * ```
   * Content-Type: multipart/form-data
   *
   * displayName: "New Name"
   * bio: "New bio text"
   * avatarFile: <binary image file>
   * location: "San Francisco, CA"  (individual accounts only)
   * ```
   *
   * Response (200 OK):
   * Updated profile (same as GET /:accountId)
   *
   * Special behavior:
   * - If avatar changes: uploads to IPFS, automatically mints new DID NFT
   * - If name/bio changes: updates DID NFT metadata
   * - Old DID NFT is wiped, new one is frozen (soulbound)
   *
   * Errors:
   * - 400: Cannot update while pending_kyc (not fully onboarded)
   * - 400: Invalid file format
   */
  @Put('me')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatarFile'))
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @CurrentUser() user: { id: string; hederaAccountId: string; email?: string },
    @Body() body: { displayName?: string; bio?: string; location?: string; companyName?: string },
    @UploadedFile() avatarFile?: Express.Multer.File,
  ) {
    this.logger.log(
      `Updating profile for user ${user.id}${avatarFile ? ' (with avatar)' : ''}`,
    );

    try {
      return await this.profileService.updateProfile(user.id, {
        displayName: body.displayName,
        bio: body.bio,
        location: body.location,
        companyName: body.companyName,
        avatarFile,
      });
    } catch (error: unknown) {
      this.logger.error(`Failed to update profile: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * GET /api/v1/users/search
   *
   * Search users by name
   * Public endpoint — no authentication required
   * Used for: finding people to add to groups, follow, mention
   *
   * Query parameters:
   * - q: Search query (minimum 2 characters)
   * - limit: Max results (default 20, max 100)
   *
   * Example: GET /api/v1/users/search?q=john&limit=10
   *
   * Response (200 OK):
   * ```json
   * [
   *   {
   *     "hederaAccountId": "0.0.123456",
   *     "displayName": "John Doe",
   *     "avatarCid": "QmX1234...",
   *     "accountType": "individual",
   *     "stats": {
   *       "followers": 42,
   *       "following": 15,
   *       "posts": 7
   *     }
   *   },
   *   ...
   * ]
   * ```
   *
   * Errors:
   * - 400: Query too short (< 2 chars)
   * - 400: Limit exceeds 100
   */
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async searchUsers(
    @Query('q') query: string,
    @Query('limit') limit: string = '20',
  ) {
    this.logger.log(`Searching users for: "${query}"`);

    const limitNum = Math.min(parseInt(limit) || 20, 100);

    try {
      return await this.profileService.searchUsers(query, limitNum);
    } catch (error: unknown) {
      this.logger.error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
```

Wait, I notice the search endpoint was added to /users/search but it's in the ProfileController. Let me create a separate UsersController:

```typescript
import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ProfileService } from '../services/profile.service';

@Controller('api/v1/users')
export class UsersController {
  private readonly logger = new Logger(UsersController.name);

  constructor(private profileService: ProfileService) {}

  /**
   * GET /api/v1/users/search?q=...
   *
   * Search users by name
   * Public endpoint — no authentication required
   */
  @Get('search')
  @HttpCode(HttpStatus.OK)
  async searchUsers(
    @Query('q') query: string,
    @Query('limit') limit: string = '20',
  ) {
    this.logger.log(`Searching users for: "${query}"`);

    const limitNum = Math.min(parseInt(limit) || 20, 100);

    try {
      return await this.profileService.searchUsers(query, limitNum);
    } catch (error: unknown) {
      this.logger.error(`Search failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
```

### Step 3: Create Profile Module

Create file `packages/api/src/profile/profile.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ProfileService } from './services/profile.service';
import { ProfileController } from './controllers/profile.controller';
import { UsersController } from './controllers/users.controller';
import { UsersModule } from '../users/users.module';
import { IpfsModule } from '../ipfs/ipfs.module';
import { HederaModule } from '../hedera/hedera.module';

@Module({
  imports: [UsersModule, IpfsModule, HederaModule],
  providers: [ProfileService],
  controllers: [ProfileController, UsersController],
  exports: [ProfileService],
})
export class ProfileModule {}
```

### Step 4: Update HederaService with wipeToken

Add this method to `packages/api/src/hedera/services/hedera.service.ts`:

```typescript
/**
 * Wipe (burn) a token from user's account
 * Used when updating DID NFT — old NFT is wiped before minting new one
 *
 * @param hederaAccountId - Account to wipe from
 */
async wipeToken(hederaAccountId: string): Promise<void> {
  try {
    const didTokenId = this.configService.get('HEDERA_DID_TOKEN_ID');

    this.logger.log(`Wiping DID token from ${hederaAccountId}`);

    const transaction = new TokenWipeTransaction()
      .setTokenId(didTokenId)
      .setAccount(hederaAccountId)
      .freezeWith(this.client);

    const transactionResponse = await transaction.execute(this.client);
    await transactionResponse.getReceipt(this.client);

    this.logger.log(`Token wiped from ${hederaAccountId}`);
  } catch (error) {
    this.logger.error(`Failed to wipe token: ${error.message}`);
    throw error;
  }
}
```

Also import TokenWipeTransaction at the top of hedera.service.ts:

```typescript
import { TokenWipeTransaction } from '@hashgraph/sdk';
```

### Step 5: Update AppModule

Edit `packages/api/src/app.module.ts` to add ProfileModule:

```typescript
import { ProfileModule } from './profile/profile.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    TypeOrmModule.forRoot({...}),
    AuthModule,
    UsersModule,
    RedisModule,
    HederaModule,
    KycModule,
    IpfsModule,
    ProfileModule, // Add this
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {...}
```

---

## Verification Steps

| # | Command | Expected Output |
|---|---------|-----------------|
| 1 | `pnpm --filter @hedera-social/api start:dev` | Server starts successfully |
| 2 | **Complete auth + wallet + KYC flow** (from P1-T09/T10/T11) | User has active status with Hedera account and DID NFT |
| 3 | **CURL TEST 1 - Get Public Profile:** `curl http://localhost:3001/api/v1/profile/0.0.123456` | Returns 200 with displayName, bio, avatarUrl, didNft, stats |
| 4 | **CURL TEST 2 - Get Own Profile:** `curl http://localhost:3001/api/v1/profile/me -H "Authorization: Bearer {token}"` | Returns 200 with email and phone included |
| 5 | **CURL TEST 3 - Update Profile:** `curl -X PUT http://localhost:3001/api/v1/profile/me -H "Authorization: Bearer {token}" -F "displayName=John Updated" -F "bio=New bio"` | Returns 200 with updated profile |
| 6 | **Check logs** for profile update | Shows message: `Profile changed, updating DID NFT` |
| 7 | **Check logs** for DID NFT update | Shows: `Wiping old DID NFT`, `DID NFT updated: serial #2` |
| 8 | **CURL TEST 4 - Search Users:** `curl "http://localhost:3001/api/v1/users/search?q=john&limit=10"` | Returns 200 with array of matching profiles |
| 9 | **DATABASE CHECK:** Verify DID NFT serial changed | `SELECT did_nft_serial FROM users WHERE id='...'` should show incremented serial |

---

## Definition of Done

- [ ] ProfileService created with:
  - [ ] getPublicProfile() — fetch and format public profile
  - [ ] updateProfile() — update authenticated user's profile
  - [ ] searchUsers() — search users by name
  - [ ] getMyProfile() — fetch own profile with private fields
- [ ] ProfileController endpoints working:
  - [ ] GET /api/v1/profile/:accountId (public)
  - [ ] GET /api/v1/profile/me (authenticated)
  - [ ] PUT /api/v1/profile/me (authenticated, multipart form)
- [ ] UsersController created:
  - [ ] GET /api/v1/users/search?q=...&limit=... (public)
- [ ] Profile update flow:
  - [ ] Avatar upload to IPFS works
  - [ ] Old DID NFT is wiped when profile changes
  - [ ] New DID NFT is minted with updated metadata
  - [ ] New NFT is frozen (soulbound)
  - [ ] User record is updated
- [ ] All tests pass:
  - [ ] Can fetch public profile by Hedera Account ID
  - [ ] Can fetch own profile (returns email/phone)
  - [ ] Can update profile (name, bio, avatar)
  - [ ] Profile update triggers DID NFT refresh
  - [ ] Search returns matching users
- [ ] HederaService updated:
  - [ ] wipeToken() method added
  - [ ] TokenWipeTransaction imported
- [ ] Git commit: `"feat(P1-T12): implement profile view, update, and search endpoints"`

---

## Troubleshooting

**Problem:** Cannot update profile — "status is pending_kyc"
**Fix:** Make sure user completed full onboarding (P1-T11). User must have status='active' to update profile.

**Problem:** Avatar upload fails with multipart error
**Fix:** Make sure Content-Type header is `multipart/form-data` (not `application/json`):
```bash
curl -X PUT http://localhost:3001/api/v1/profile/me \
  -H "Authorization: Bearer {token}" \
  -F "displayName=New Name" \
  -F "avatarFile=@/path/to/image.jpg"
```

**Problem:** DID NFT serial doesn't update after profile change
**Fix:** Check if old NFT wipe transaction succeeded. Look in logs for "Token wiped" message.

**Problem:** Search returns empty results even though users exist
**Fix:** Search implementation is stubbed for hackathon. In production, integrate with Meilisearch or Elasticsearch.

---

## Files Created in This Task

```
packages/api/src/
├── profile/
│   ├── services/
│   │   └── profile.service.ts
│   ├── controllers/
│   │   ├── profile.controller.ts
│   │   └── users.controller.ts
│   └── profile.module.ts
├── hedera/services/hedera.service.ts (UPDATED - added wipeToken)
└── app.module.ts (UPDATED)
```

---

## What Happens Next

After this task is complete:
- **P1-T13** — Frontend Onboarding UI (can call profile endpoints)
- **P2-T14** — Payments (can send to users by account)
- **P2-T15** — Messaging (can mention users, add to groups)
- **P2-T16** — Social Feed (can follow users, see stats)
