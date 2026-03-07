import { Controller, Post, Body, UseGuards, HttpCode } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

class SaveSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  subscriptionId: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Sauvegarde le pushSubscriptionId OneSignal de l'utilisateur connecté.
   * Appelé automatiquement par le frontend après acceptation des notifications.
   */
  @Post('subscribe')
  @HttpCode(200)
  async subscribe(
    @CurrentUser() user: any,
    @Body() dto: SaveSubscriptionDto,
  ) {
    await this.notificationsService.saveSubscription(user.id, user.tenantId, dto.subscriptionId);
    return { success: true };
  }
}
