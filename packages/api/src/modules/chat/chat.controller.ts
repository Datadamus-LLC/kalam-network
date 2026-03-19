import { Controller, Get, Param, UseGuards, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatGateway } from "./chat.gateway";
import { ConversationMemberEntity } from "../../database/entities/conversation-member.entity";
import {
  JwtAuthGuard,
  type JwtPayload,
} from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { ConversationStateResponse } from "./dto/ws-events.dto";
import {
  WsNotConversationMemberException,
  WsConversationStateException,
} from "./exceptions/chat.exceptions";

/**
 * REST controller for chat-related endpoints.
 *
 * Provides initial state for the WebSocket connection:
 *   - Online users in a conversation
 *   - Read receipts
 *   - Typing indicators
 *
 * All endpoints are protected by JWT authentication.
 */
@Controller("api/v1/chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chatGateway: ChatGateway,
    @InjectRepository(ConversationMemberEntity)
    private readonly memberRepository: Repository<ConversationMemberEntity>,
  ) {}

  /**
   * GET /api/v1/chat/conversations/:topicId/state
   *
   * Returns the current real-time state of a conversation:
   *   - onlineUsers: accounts currently in the room
   *   - readReceipts: last-read sequence per account
   *   - typingUsers: accounts currently typing
   *
   * Called by the frontend when joining a conversation to hydrate initial state.
   */
  @Get("conversations/:topicId/state")
  async getConversationState(
    @Param("topicId") topicId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<{
    success: true;
    data: ConversationStateResponse;
    error: null;
    timestamp: string;
  }> {
    this.logger.log(
      `GET /chat/conversations/${topicId}/state — user: ${user.hederaAccountId}`,
    );

    // Verify user is a participant
    const isMember = await this.isConversationMember(
      topicId,
      user.hederaAccountId,
    );

    if (!isMember) {
      throw new WsNotConversationMemberException(user.hederaAccountId, topicId);
    }

    try {
      const state = await this.chatGateway.getConversationState(topicId);

      return {
        success: true,
        data: state,
        error: null,
        timestamp: new Date().toISOString(),
      };
    } catch (error: unknown) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get conversation state for ${topicId}: ${reason}`,
      );
      throw new WsConversationStateException(topicId, reason);
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Check if a user is an active member of a conversation by its HCS topic ID.
   */
  private async isConversationMember(
    topicId: string,
    accountId: string,
  ): Promise<boolean> {
    const member = await this.memberRepository
      .createQueryBuilder("member")
      .innerJoin("conversations", "conv", "conv.id = member.conversationId")
      .where("conv.hcsTopicId = :topicId", { topicId })
      .andWhere("member.hederaAccountId = :accountId", { accountId })
      .andWhere("member.leftAt IS NULL")
      .getOne();

    return member !== null;
  }
}
