import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceModuleGuard } from '../guards/commerce-module.guard';
import { StockReceiptsService } from './stock-receipts.service';
import { CreateReceiptDto } from './dtos/create-receipt.dto';
import { ReceiptStatus } from '@prisma/client';

@Controller('commerce/stock-receipts')
@UseGuards(JwtAuthGuard, CommerceModuleGuard)
export class StockReceiptsController {
  constructor(private readonly receiptsService: StockReceiptsService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentUser() user: any, @Body() dto: CreateReceiptDto) {
    return this.receiptsService.create(
      user.tenantId,
      user.id,
      `${user.firstName} ${user.lastName}`,
      dto,
    );
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: ReceiptStatus,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.receiptsService.findAll(user.tenantId, {
      supplierId,
      status,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('stats/overview')
  getStats(
    @CurrentUser() user: any,
    @Query('days') days?: string,
  ) {
    return this.receiptsService.getStats(
      user.tenantId,
      days ? parseInt(days, 10) : 30,
    );
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.receiptsService.findOne(user.tenantId, id);
  }

  @Patch(':id/verify')
  @HttpCode(200)
  verify(@CurrentUser() user: any, @Param('id') id: string) {
    return this.receiptsService.verify(user.tenantId, id, user.id);
  }

  @Patch(':id/cancel')
  @HttpCode(200)
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.receiptsService.cancel(user.tenantId, id);
  }
}
