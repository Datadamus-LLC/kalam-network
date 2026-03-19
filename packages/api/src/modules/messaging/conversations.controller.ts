import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ConversationsService } from "./conversations.service";
import { MessagingService } from "./messaging.service";
import { CreateConversationDto } from "./dto/create-conversation.dto";
import { AddParticipantDto } from "./dto/add-participant.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { GetConversationsQueryDto } from "./dto/get-conversations-query.dto";
import { GetMessagesQueryDto } from "./dto/get-messages-query.dto";
import type {
  ConversationResponse,
  PaginatedConversationsResponse,
} from "./dto/conversation-response.dto";
import type {
  MessageResponse,
  PaginatedMessagesResponse,
} from "./dto/message-response.dto";
import {
  JwtAuthGuard,
  type JwtPayload,
} from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";

@Controller("api/v1/conversations")
@UseGuards(JwtAuthGuard, ThrottlerGuard)
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagingService: MessagingService,
  ) {}

  /**
   * POST /api/v1/conversations
   *
   * Create a new conversation (direct 1:1 or group).
   * The authenticated user is automatically added as a participant and admin.
   * Rate limited: 5 new conversations per minute.
   */
  @Post()
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async createConversation(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateConversationDto,
  ): Promise<{
    success: true;
    data: ConversationResponse;
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `POST /conversations — user: ${user.hederaAccountId}, type: ${dto.type}`,
    );

    const conversation = await this.conversationsService.createConversation(
      user.hederaAccountId,
      dto,
    );

    return {
      success: true,
      data: conversation,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/conversations
   *
   * List all conversations for the authenticated user.
   * Supports cursor-based pagination.
   * Higher rate limit since this is a frequent read-only operation.
   */
  @Get()
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async getUserConversations(
    @CurrentUser() user: JwtPayload,
    @Query() query: GetConversationsQueryDto,
  ): Promise<{
    success: true;
    data: PaginatedConversationsResponse;
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `GET /conversations — user: ${user.hederaAccountId}, cursor: ${query.cursor ?? "none"}`,
    );

    const result = await this.conversationsService.getUserConversations(
      user.hederaAccountId,
      query.cursor,
      query.limit,
    );

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/conversations/:id
   *
   * Get a single conversation by ID.
   * The authenticated user must be a member.
   */
  @Get(":id")
  @Throttle({ default: { ttl: 60000, limit: 300 } })
  async getConversation(
    @CurrentUser() user: JwtPayload,
    @Param("id", new ParseUUIDPipe({ version: "4" })) conversationId: string,
  ): Promise<{
    success: true;
    data: ConversationResponse;
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `GET /conversations/${conversationId} — user: ${user.hederaAccountId}`,
    );

    const conversation = await this.conversationsService.getConversation(
      conversationId,
      user.hederaAccountId,
    );

    return {
      success: true,
      data: conversation,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/conversations/:id/participants
   *
   * Add a participant to a group conversation.
   * Only admins can add participants.
   */
  @Post(":id/participants")
  async addParticipant(
    @CurrentUser() user: JwtPayload,
    @Param("id", new ParseUUIDPipe({ version: "4" })) conversationId: string,
    @Body() dto: AddParticipantDto,
  ): Promise<{
    success: true;
    data: ConversationResponse;
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `POST /conversations/${conversationId}/participants — user: ${user.hederaAccountId}, adding: ${dto.accountId}`,
    );

    const conversation = await this.conversationsService.addParticipant(
      conversationId,
      dto.accountId,
      user.hederaAccountId,
    );

    return {
      success: true,
      data: conversation,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Remove Participant / Leave Group (GAP-008)
  // ---------------------------------------------------------------------------

  /**
   * DELETE /api/v1/conversations/:id/participants/:accountId
   *
   * Remove a participant from a group conversation.
   * Only admins can remove participants.
   */
  @Delete(":id/participants/:accountId")
  @HttpCode(HttpStatus.OK)
  async removeParticipant(
    @CurrentUser() user: JwtPayload,
    @Param("id", new ParseUUIDPipe({ version: "4" })) conversationId: string,
    @Param("accountId") accountId: string,
  ): Promise<{
    success: true;
    data: ConversationResponse;
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `DELETE /conversations/${conversationId}/participants/${accountId} — user: ${user.hederaAccountId}`,
    );

    const conversation = await this.conversationsService.removeParticipant(
      conversationId,
      accountId,
      user.hederaAccountId,
    );

    return {
      success: true,
      data: conversation,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /api/v1/conversations/:id/leave
   *
   * Leave a group conversation voluntarily.
   * Any member can leave.
   */
  @Post(":id/leave")
  @HttpCode(HttpStatus.OK)
  async leaveConversation(
    @CurrentUser() user: JwtPayload,
    @Param("id") conversationId: string,
  ): Promise<{
    success: true;
    data: { left: true };
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `POST /conversations/${conversationId}/leave — user: ${user.hederaAccountId}`,
    );

    const result = await this.conversationsService.leaveConversation(
      conversationId,
      user.hederaAccountId,
    );

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  // ---------------------------------------------------------------------------
  // Message REST Endpoints (GAP-003)
  // ---------------------------------------------------------------------------

  /**
   * POST /api/v1/conversations/:topicId/messages
   *
   * Send a message to a conversation (REST fallback for non-WebSocket clients).
   * The topicId is the HCS topic ID of the conversation.
   * Rate limited: 60 messages per minute per user.
   */
  @Post(":topicId/messages")
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async sendMessage(
    @CurrentUser() user: JwtPayload,
    @Param("topicId") topicId: string,
    @Body() dto: SendMessageDto,
  ): Promise<{
    success: true;
    data: MessageResponse;
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `POST /conversations/${topicId}/messages — user: ${user.hederaAccountId}`,
    );

    const message = await this.messagingService.sendMessage(
      user.hederaAccountId,
      topicId,
      dto.text,
      dto.replyToSequence,
      dto.encryptedContent,
    );

    return {
      success: true,
      data: message,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * GET /api/v1/conversations/:topicId/messages
   *
   * Get paginated message history for a conversation.
   * The topicId is the HCS topic ID of the conversation.
   */
  @Get(":topicId/messages")
  @Throttle({ default: { ttl: 60000, limit: 300 } })
  async getMessages(
    @CurrentUser() user: JwtPayload,
    @Param("topicId") topicId: string,
    @Query() query: GetMessagesQueryDto,
  ): Promise<{
    success: true;
    data: PaginatedMessagesResponse;
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `GET /conversations/${topicId}/messages — user: ${user.hederaAccountId}`,
    );

    const limit = query.limit ? parseInt(query.limit, 10) : undefined;
    const result = await this.messagingService.getMessages(
      topicId,
      limit,
      query.cursor,
    );

    // Mark conversation as read when messages are fetched (clears unread badge)
    void this.conversationsService.markAsRead(topicId, user.hederaAccountId);

    return {
      success: true,
      data: result,
      error: null,
      timestamp: new Date().toISOString(),
    };
  }
}
