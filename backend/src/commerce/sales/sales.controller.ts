import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CommerceModuleGuard } from '../guards/commerce-module.guard';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { EmailService } from '../../email/email.service';

@Controller('commerce/sales')
@UseGuards(JwtAuthGuard, CommerceModuleGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly emailService: EmailService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('date') date?: string,
    @Query('cashierId') cashierId?: string,
    @Query('customerId') customerId?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.salesService.findAll(user.tenantId, {
      date,
      cashierId,
      customerId,
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 30,
    });
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.salesService.findOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateSaleDto) {
    return this.salesService.create(user.tenantId, user.id, dto);
  }

  @Patch(':id/cancel')
  cancel(@CurrentUser() user: any, @Param('id') id: string) {
    return this.salesService.cancel(user.tenantId, id);
  }

  @Post(':id/send-receipt-email')
  @HttpCode(200)
  async sendReceiptEmail(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { email: string },
  ) {
    if (!body.email || !body.email.includes('@')) {
      throw new BadRequestException('Email invalide');
    }

    const sale = await this.salesService.findOne(user.tenantId, id);

    // Envoyer l'email via Brevo
    await this.emailService.sendSalesReceiptEmail(
      body.email,
      sale.receiptNumber,
      sale.totalAmount,
      sale.paidAmount,
      sale.remainingDebt,
      sale.items.length,
      user.schoolName || 'Commerce',
    );

    return { message: `Reçu envoyé à ${body.email}`, success: true };
  }
}
