import {
  Controller, Post, Get, Patch, Delete,
  Body, Param, UseGuards, HttpCode, Headers, Query,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

class SubscribeDto {
  @IsString() @IsNotEmpty() endpoint: string;
  @IsString() @IsNotEmpty() p256dh: string;
  @IsString() @IsNotEmpty() auth: string;
  @IsString() @IsOptional() userAgent?: string;
}

class UnsubscribeDto {
  @IsString() @IsNotEmpty() endpoint: string;
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Clé publique VAPID — publique, pas besoin d'authentification */
  @Get('vapid-public-key')
  getVapidPublicKey() {
    return { publicKey: this.notificationsService.getVapidPublicKey() };
  }

  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  @HttpCode(200)
  async subscribe(
    @CurrentUser() user: any,
    @Body() dto: SubscribeDto,
    @Headers('user-agent') userAgent?: string,
  ) {
    await this.notificationsService.saveSubscription(
      user.id, user.tenantId,
      dto.endpoint, dto.p256dh, dto.auth,
      dto.userAgent ?? userAgent,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('unsubscribe')
  @HttpCode(200)
  async unsubscribe(@CurrentUser() user: any, @Body() dto: UnsubscribeDto) {
    await this.notificationsService.removeSubscription(user.id, dto.endpoint);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async getAll(@CurrentUser() user: any, @Query('limit') limit?: string) {
    return this.notificationsService.getNotifications(user.id, limit ? parseInt(limit) : 30);
  }

  @UseGuards(JwtAuthGuard)
  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: any) {
    const count = await this.notificationsService.getUnreadCount(user.id);
    return { count };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: any, @Param('id') id: string) {
    await this.notificationsService.markAsRead(user.id, id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Patch('mark-all-read')
  async markAllAsRead(@CurrentUser() user: any) {
    await this.notificationsService.markAllAsRead(user.id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async deleteOne(@CurrentUser() user: any, @Param('id') id: string) {
    await this.notificationsService.deleteNotification(user.id, id);
    return { success: true };
  }
}
