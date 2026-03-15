import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PlanFeatureGuard } from '../common/guards/plan-feature.guard';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
    imports: [NotificationsModule],
    controllers: [PaymentsController],
    providers: [PaymentsService, PlanFeatureGuard],
    exports: [PaymentsService],
})
export class PaymentsModule { }
