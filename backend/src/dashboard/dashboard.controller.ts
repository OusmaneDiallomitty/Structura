import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@Controller('dashboard')
@UseGuards(JwtAuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  /**
   * GET /api/dashboard/stats
   * Récupérer les statistiques générales du dashboard
   */
  @SkipThrottle()
  @Get('stats')
  async getStats(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.dashboardService.getDashboardStats(tenantId);
  }

  /**
   * GET /api/dashboard/stats/period?startDate=2024-01-01&endDate=2024-12-31
   * Récupérer les statistiques pour une période donnée
   */
  @SkipThrottle()
  @Get('stats/period')
  async getStatsForPeriod(
    @Request() req: any,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const tenantId = req.user.tenantId;
    return this.dashboardService.getStatsForPeriod(
      tenantId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  /**
   * GET /api/dashboard/activities?limit=10
   * Récupérer les activités récentes
   */
  @SkipThrottle()
  @Get('activities')
  async getRecentActivities(
    @Request() req: any,
    @Query('limit') limit?: string,
  ) {
    const tenantId = req.user.tenantId;
    const activityLimit = limit ? parseInt(limit, 10) : 10;
    return this.dashboardService.getRecentActivities(tenantId, activityLimit);
  }

  /**
   * GET /api/dashboard/charts/payments
   * Données pour le graphique des paiements (6 derniers mois)
   */
  @SkipThrottle()
  @Get('charts/payments')
  async getPaymentsChartData(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.dashboardService.getPaymentsChartData(tenantId);
  }

  /**
   * GET /api/dashboard/charts/attendance
   * Données pour le graphique des présences (6 derniers mois)
   */
  @SkipThrottle()
  @Get('charts/attendance')
  async getAttendanceChartData(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.dashboardService.getAttendanceChartData(tenantId);
  }

  /**
   * GET /api/dashboard/charts/students-distribution
   * Distribution des élèves par classe
   */
  @SkipThrottle()
  @Get('charts/students-distribution')
  async getStudentsDistribution(@Request() req: any) {
    const tenantId = req.user.tenantId;
    return this.dashboardService.getStudentsDistribution(tenantId);
  }
}
