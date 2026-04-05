import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceModuleGuard } from '../guards/commerce-module.guard';
import { CaisseService } from './caisse.service';
import { UpsertSessionDto } from './dto/upsert-session.dto';

@Controller('commerce/caisse')
@UseGuards(JwtAuthGuard, CommerceModuleGuard)
export class CaisseController {
  constructor(private readonly caisseService: CaisseService) {}

  /** Données d'une journée — mouvements + soldes */
  @Get('day')
  getDay(@CurrentUser() user: any, @Query('date') date?: string) {
    return this.caisseService.getDay(user.tenantId, date);
  }

  /** Définir / modifier le solde d'ouverture d'une journée */
  @Post('session')
  upsertSession(@CurrentUser() user: any, @Body() dto: UpsertSessionDto) {
    return this.caisseService.upsertSession(user.tenantId, dto);
  }

  /** Historique des soldes de clôture sur N jours */
  @Get('history')
  getHistory(@CurrentUser() user: any, @Query('days') days?: string) {
    return this.caisseService.getHistory(user.tenantId, days ? parseInt(days, 10) : 30);
  }
}
