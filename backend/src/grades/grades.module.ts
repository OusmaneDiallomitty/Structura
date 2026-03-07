import { Module } from '@nestjs/common';
import { GradesController } from './grades.controller';
import { GradesService } from './grades.service';
import { PlanFeatureGuard } from '../common/guards/plan-feature.guard';

@Module({
    controllers: [GradesController],
    providers: [GradesService, PlanFeatureGuard],
    exports: [GradesService],
})
export class GradesModule { }
