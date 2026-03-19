import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  IsEnum,
  IsArray,
  IsUUID,
  ArrayMinSize,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";

/**
 * Notification categories for filtering and grouping.
 */
export enum NotificationCategory {
  MESSAGE = "message",
  PAYMENT = "payment",
  SOCIAL = "social",
  SYSTEM = "system",
}

/**
 * Specific notification event types within each category.
 */
export enum NotificationEvent {
  // Message events
  NEW_MESSAGE = "new_message",
  MESSAGE_EDITED = "message_edited",

  // Payment events
  PAYMENT_RECEIVED = "payment_received",
  PAYMENT_REQUEST = "payment_request",
  PAYMENT_SPLIT_CREATED = "payment_split_created",
  PAYMENT_CONFIRMED = "payment_confirmed",

  // Social events
  NEW_FOLLOWER = "new_follower",
  POST_LIKED = "post_liked",

  // System events
  KYC_APPROVED = "kyc_approved",
  ACCOUNT_VERIFIED = "account_verified",
  ANNOUNCEMENT = "announcement",
}

/**
 * Query DTO for listing notifications with optional category filter and pagination.
 */
export class GetNotificationsQueryDto {
  @IsOptional()
  @IsEnum(NotificationCategory, {
    message: "category must be one of: message, payment, social, system",
  })
  category?: NotificationCategory;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

/**
 * DTO for marking one or more notifications as read.
 */
export class MarkNotificationsReadDto {
  @IsArray()
  @ArrayMinSize(1, { message: "At least one notification ID is required" })
  @IsUUID("4", { each: true })
  @IsNotEmpty({ each: true })
  notificationIds!: string[];
}

/**
 * Internal DTO for creating a notification (not exposed via REST).
 */
export interface CreateNotificationParams {
  recipientAccountId: string;
  category: NotificationCategory;
  event: NotificationEvent;
  fromAccountId?: string;
  topicId?: string;
  preview?: string;
  data?: Record<string, unknown>;
}

/**
 * Response shape for a single notification (used in API responses).
 */
export interface NotificationResponseDto {
  id: string;
  recipientAccountId: string;
  category: string;
  event: string;
  fromAccountId: string | null;
  fromDisplayName: string | null;
  topicId: string | null;
  preview: string | null;
  data: Record<string, unknown> | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

/**
 * Response shape for paginated notification list.
 */
export interface NotificationListResponseDto {
  notifications: NotificationResponseDto[];
  totalCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

/**
 * Response shape for unread count endpoint.
 */
export interface UnreadCountResponseDto {
  unreadCount: number;
}

/**
 * Response shape for mark-as-read endpoint.
 */
export interface MarkReadResponseDto {
  updated: number;
}
