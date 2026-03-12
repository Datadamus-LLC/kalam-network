import { Controller, Get, Put, Param, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('api/v1/notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
  ) {}

  @Get()
  async getNotifications(
    @Query('limit') limit?: string,
    @Query('unreadOnly') unreadOnly?: string,
  ): Promise<{ message: string }> {
    // TODO: implement notification listing
    return {
      message: `Get notifications endpoint — limit: ${limit ?? '50'}, unreadOnly: ${unreadOnly ?? 'false'}`,
    };
  }

  @Put(':notificationId/read')
  async markAsRead(
    @Param('notificationId') notificationId: string,
  ): Promise<{ message: string }> {
    // TODO: implement mark notification as read
    return {
      message: `Mark as read endpoint — id: ${notificationId}`,
    };
  }

  @Put('read-all')
  async markAllAsRead(): Promise<{ message: string }> {
    // TODO: implement mark all notifications as read
    return { message: 'Mark all as read endpoint' };
  }
}
