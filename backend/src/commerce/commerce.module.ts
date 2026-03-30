import { Module } from '@nestjs/common';
import { CategoriesModule } from './categories/categories.module';
import { ProductsModule } from './products/products.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { SalesModule } from './sales/sales.module';
import { CommerceDashboardModule } from './dashboard/commerce-dashboard.module';
import { StockReceiptsModule } from './stock-receipts/stock-receipts.module';
import { ExpensesModule } from './expenses/expenses.module';
import { CommerceModuleGuard } from './guards/commerce-module.guard';

@Module({
  imports: [
    CategoriesModule,
    ProductsModule,
    CustomersModule,
    SuppliersModule,
    SalesModule,
    CommerceDashboardModule,
    StockReceiptsModule,
    ExpensesModule,
  ],
  providers: [CommerceModuleGuard],
  exports: [CommerceModuleGuard],
})
export class CommerceModule {}
