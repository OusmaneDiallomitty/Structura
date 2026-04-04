import { Module } from '@nestjs/common';
import { SupplierDebtsController } from './supplier-debts.controller';
import { SupplierDebtsService } from './supplier-debts.service';

@Module({
  controllers: [SupplierDebtsController],
  providers: [SupplierDebtsService],
  exports: [SupplierDebtsService],
})
export class SupplierDebtsModule {}
