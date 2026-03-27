import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PayrollService } from './payroll.service';
import { PaySalaryDto } from './dto/pay-salary.dto';
import { UpdateSalaryConfigDto } from './dto/update-salary-config.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('payroll')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('DIRECTOR')
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  /**
   * GET /payroll/summary?month=2026-03
   * Résumé du mois : tout le personnel + config salaire + statut paiement.
   */
  @SkipThrottle()
  @Get('summary')
  getSummary(@Request() req: any, @Query('month') month?: string) {
    const currentMonth = month ?? new Date().toISOString().slice(0, 7);
    return this.payrollService.getSummary(req.user.tenantId, currentMonth);
  }

  /**
   * GET /payroll/history?staffId=xxx&limit=50&offset=0
   * Historique paginé des salaires payés.
   */
  @SkipThrottle()
  @Get('history')
  getHistory(
    @Request() req: any,
    @Query('staffId') staffId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.payrollService.getHistory(req.user.tenantId, {
      staffId,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });
  }

  /**
   * POST /payroll/pay
   * Enregistre le paiement du salaire d'un membre (crée une dépense SALARY).
   */
  @Post('pay')
  pay(@Request() req: any, @Body() dto: PaySalaryDto) {
    const fullName = `${req.user.firstName} ${req.user.lastName}`;
    return this.payrollService.paySalary(req.user.tenantId, dto, fullName);
  }

  /**
   * PATCH /payroll/config/:memberId
   * Configure le salaire mensuel d'un membre.
   */
  @Patch('config/:memberId')
  updateConfig(
    @Request() req: any,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateSalaryConfigDto,
  ) {
    return this.payrollService.updateSalaryConfig(
      req.user.tenantId,
      memberId,
      dto,
    );
  }

  /**
   * DELETE /payroll/payment/:expenseId
   * Annule un paiement de salaire (supprime la dépense SALARY).
   */
  @Delete('payment/:expenseId')
  @HttpCode(200)
  deletePayment(@Request() req: any, @Param('expenseId') expenseId: string) {
    return this.payrollService.deletePayment(req.user.tenantId, expenseId);
  }
}
