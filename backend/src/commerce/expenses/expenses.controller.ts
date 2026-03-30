import { Controller, Get, Post, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceModuleGuard } from '../guards/commerce-module.guard';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Controller('commerce/expenses')
@UseGuards(JwtAuthGuard, CommerceModuleGuard)
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateExpenseDto) {
    return this.expensesService.create(user.tenantId, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('month') month?: string,
    @Query('category') category?: string,
  ) {
    return this.expensesService.findAll(user.tenantId, { month, category });
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.expensesService.remove(user.tenantId, id);
  }
}
