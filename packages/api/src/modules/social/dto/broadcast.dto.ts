import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ValidateNested,
  IsIn,
  MaxLength,
  IsNumber,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * DTO for a single media attachment in a broadcast.
 */
export class BroadcastMediaDto {
  @IsString()
  @IsIn(["image", "video"])
  type!: "image" | "video";

  @IsString()
  @IsNotEmpty()
  ipfsCid!: string;

  @IsString()
  @IsNotEmpty()
  mimeType!: string;

  @IsNumber()
  @Min(0)
  size!: number;
}

/**
 * DTO for creating a broadcast message.
 *
 * POST /api/v1/broadcasts
 */
export class CreateBroadcastDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BroadcastMediaDto)
  media?: BroadcastMediaDto[];
}

/**
 * Response for a single broadcast message.
 */
export interface BroadcastMessageResponse {
  id: string;
  organizationId: string;
  author: {
    accountId: string;
    organizationName: string | null;
    badgeTier: string | null;
  };
  text: string;
  media: Array<{
    type: "image" | "video";
    ref: string;
    mimeType: string;
    size: number;
  }>;
  hcsTopicId: string;
  sequenceNumber: number;
  consensusTimestamp: string;
  createdAt: string;
}

/**
 * Paginated broadcast feed response.
 */
export interface BroadcastFeedResponse {
  broadcasts: BroadcastMessageResponse[];
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Subscription status response.
 */
export interface BroadcastSubscriptionResponse {
  subscriberAccountId: string;
  organizationId: string;
  broadcastTopicId: string | null;
  subscribedAt: string;
}
