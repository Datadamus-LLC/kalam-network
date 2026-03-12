import { Controller, Post, Get, Param, Body, Query } from '@nestjs/common';
import { MessagingService } from './messaging.service';

@Controller('api/v1/conversations')
export class MessagingController {
  constructor(private readonly messagingService: MessagingService) {}

  @Post()
  async createConversation(
    @Body()
    createDto: {
      participants: string[];
      isGroup: boolean;
      name?: string;
    },
  ): Promise<{ message: string }> {
    // TODO: implement conversation creation with HCS topic
    return {
      message: `Create conversation endpoint — participants: ${createDto.participants.length}`,
    };
  }

  @Get()
  async listConversations(): Promise<{ message: string }> {
    // TODO: implement conversation listing
    return { message: 'List conversations endpoint' };
  }

  @Get(':conversationId/messages')
  async getMessages(
    @Param('conversationId') conversationId: string,
    @Query('limit') limit?: string,
    @Query('before') before?: string,
  ): Promise<{ message: string }> {
    // TODO: implement message retrieval from HCS via Mirror Node
    return {
      message: `Get messages endpoint — conversation: ${conversationId}, limit: ${limit ?? '50'}, before: ${before ?? 'latest'}`,
    };
  }

  @Post(':conversationId/messages')
  async sendMessage(
    @Param('conversationId') conversationId: string,
    @Body() messageDto: { content: string; replyTo?: string },
  ): Promise<{ message: string }> {
    // TODO: implement message sending via HCS
    return {
      message: `Send message endpoint — conversation: ${conversationId}`,
    };
  }
}
