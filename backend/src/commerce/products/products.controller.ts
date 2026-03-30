import {
  Body,
  Controller,
  Delete,
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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { SetupCatalogDto } from './dto/setup-catalog.dto';
import { ConfigureConversionDto } from './dtos/configure-conversion.dto';
import { ReceiveStockDto } from './dtos/receive-stock.dto';

@Controller('commerce/products')
@UseGuards(JwtAuthGuard, CommerceModuleGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('lowStock') lowStock?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.findAll(user.tenantId, {
      search,
      categoryId,
      lowStock: lowStock === 'true',
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Get('alerts/low-stock')
  getLowStockAlerts(@CurrentUser() user: any) {
    return this.productsService.getLowStockAlerts(user.tenantId);
  }

  @Post('catalog/setup')
  setupCatalog(@CurrentUser() user: any, @Body() dto: SetupCatalogDto) {
    return this.productsService.setupCatalog(user.tenantId, dto.items);
  }

  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productsService.findOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: any, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.tenantId, id, dto);
  }

  @Post(':id/stock')
  adjustStock(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: AdjustStockDto,
  ) {
    return this.productsService.adjustStock(user.tenantId, id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.productsService.remove(user.tenantId, id);
  }

  // ── Gestion conversions d'unités ────────────────────────────────────────────
  @Patch(':id/conversion')
  configureConversion(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ConfigureConversionDto,
  ) {
    return this.productsService.configureConversion(user.tenantId, id, dto);
  }

  @Post(':id/receive')
  @HttpCode(200)
  receiveStock(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: ReceiveStockDto,
  ) {
    return this.productsService.receiveStock(user.tenantId, id, user.id, dto);
  }

  @Get(':id/inbounds')
  getStockInbounds(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.getStockInbounds(
      user.tenantId,
      id,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get(':id/movements')
  getStockMovements(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.productsService.getStockMovements(
      user.tenantId,
      id,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}
