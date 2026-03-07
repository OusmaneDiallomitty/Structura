import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PlanFeatureGuard } from '../common/guards/plan-feature.guard';

@Module({
    controllers: [PaymentsController],
    providers: [PaymentsService, PlanFeatureGuard],
    exports: [PaymentsService],
})
export class PaymentsModule { }
