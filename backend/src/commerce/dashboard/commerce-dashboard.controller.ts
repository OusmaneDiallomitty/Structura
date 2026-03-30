import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceModuleGuard } from '../guards/commerce-module.guard';
import { CommerceDashboardService } from './commerce-dashboard.service';

@Controller('commerce/dashboard')
@UseGuards(JwtAuthGuard, CommerceModuleGuard)
export class CommerceDashboardController {
  constructor(private readonly dashboardService: CommerceDashboardService) {}

  @Get()
  getStats(@CurrentUser() user: any) {
    return this.dashboardService.getStats(user.tenantId);
  }

  @Get('chart')
  getRevenueChart(
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    return this.dashboardService.getRevenueChart(
      user.tenantId,
      days ? parseInt(days, 10) : 30,
    );
  }
}
