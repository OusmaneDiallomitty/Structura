import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceModuleGuard } from '../guards/commerce-module.guard';
import { SupplierDebtsService } from './supplier-debts.service';
import { PaySupplierDebtDto } from './dto/pay-supplier-debt.dto';

@Controller('commerce/supplier-debts')
@UseGuards(JwtAuthGuard, CommerceModuleGuard)
export class SupplierDebtsController {
  constructor(private readonly service: SupplierDebtsService) {}

  /** Liste des bons de réception impayés / partiellement payés */
  @Get()
  findDebts(
    @CurrentUser() user: any,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.service.findDebts(user.tenantId, supplierId);
  }

  /** Statistiques pour le widget dashboard */
  @Get('stats')
  getStats(@CurrentUser() user: any) {
    return this.service.getStats(user.tenantId);
  }

  /** Historique des paiements effectués */
  @Get('history')
  getHistory(
    @CurrentUser() user: any,
    @Query('supplierId') supplierId?: string,
    @Query('month') month?: string,
  ) {
    return this.service.getHistory(user.tenantId, { supplierId, month });
  }

  /** Enregistrer un paiement sur un bon de réception */
  @Post(':receiptId/pay')
  @HttpCode(200)
  pay(
    @CurrentUser() user: any,
    @Param('receiptId') receiptId: string,
    @Body() dto: PaySupplierDebtDto,
  ) {
    const userName = `${user.firstName} ${user.lastName}`;
    return this.service.payDebt(user.tenantId, receiptId, dto, user.id, userName);
  }
}
