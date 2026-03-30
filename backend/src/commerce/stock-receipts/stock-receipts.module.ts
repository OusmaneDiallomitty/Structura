import { Module } from '@nestjs/common';
import { StockReceiptsService } from './stock-receipts.service';
import { StockReceiptsController } from './stock-receipts.controller';
import { PrismaModule } from '../../prisma/prisma.module';
import { CacheModule } from '../../cache/cache.module';

@Module({
  imports: [PrismaModule, CacheModule],
  providers: [StockReceiptsService],
  controllers: [StockReceiptsController],
})
export class StockReceiptsModule {}
