import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

/**
 * Expenses Controller — Gestion des dépenses de l'école
 *
 * Accès lecture (view) : DIRECTOR, ACCOUNTANT, SECRETARY
 * Accès écriture (create/edit/delete) : DIRECTOR, ACCOUNTANT
 */
@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
@SkipThrottle()
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @Roles('DIRECTOR', 'ACCOUNTANT')
  @RequirePermission('expenses', 'create')
  create(@Request() req: any, @Body() dto: CreateExpenseDto) {
    const fullName = `${req.user.firstName} ${req.user.lastName}`;
    return this.expensesService.create(req.user.tenantId, dto, fullName);
  }

  @Get()
  @Roles('DIRECTOR', 'ACCOUNTANT', 'SECRETARY')
  @RequirePermission('expenses', 'view')
  findAll(
    @Request() req: any,
    @Query('academicYear') academicYear?: string,
    @Query('category')    category?:     string,
    @Query('from')        from?:         string,
    @Query('to')          to?:           string,
  ) {
    return this.expensesService.findAll(req.user.tenantId, {
      academicYear,
      category,
      from,
      to,
    });
  }

  @Get('stats')
  @Roles('DIRECTOR', 'ACCOUNTANT', 'SECRETARY')
  @RequirePermission('expenses', 'view')
  getStats(
    @Request() req: any,
    @Query('academicYear') academicYear?: string,
  ) {
    return this.expensesService.getStats(req.user.tenantId, academicYear);
  }

  @Get(':id')
  @Roles('DIRECTOR', 'ACCOUNTANT', 'SECRETARY')
  @RequirePermission('expenses', 'view')
  findOne(@Request() req: any, @Param('id') id: string) {
    return this.expensesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @Roles('DIRECTOR', 'ACCOUNTANT')
  @RequirePermission('expenses', 'edit')
  update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expensesService.update(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  @Roles('DIRECTOR', 'ACCOUNTANT')
  @RequirePermission('expenses', 'delete')
  remove(@Request() req: any, @Param('id') id: string) {
    return this.expensesService.remove(req.user.tenantId, id);
  }
}
