import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { EmailModule } from '../email/email.module';
import { PlanFeatureGuard } from '../common/guards/plan-feature.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [EmailModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UsersService, PlanFeatureGuard],
  exports: [UsersService],
})
export class UsersModule {}
