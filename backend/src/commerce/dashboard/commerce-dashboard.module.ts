import { Module } from '@nestjs/common';
import { CommerceDashboardController } from './commerce-dashboard.controller';
import { CommerceDashboardService } from './commerce-dashboard.service';

@Module({
  controllers: [CommerceDashboardController],
  providers: [CommerceDashboardService],
})
export class CommerceDashboardModule {}
