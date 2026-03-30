import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateExpenseDto } from './dto/create-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private cacheKey(tenantId: string) {
    return `commerce:expenses:${tenantId}`;
  }

  private async invalidate(tenantId: string) {
    await Promise.all([
      this.cache.del(this.cacheKey(tenantId)),
      this.cache.del(`commerce:dashboard:${tenantId}`),
    ]);
  }

  async create(tenantId: string, dto: CreateExpenseDto) {
    const expense = await this.prisma.commerceExpense.create({
      data: {
        tenantId,
        amount: dto.amount,
        category: dto.category,
        description: dto.description,
        date: dto.date ? new Date(dto.date) : new Date(),
      },
    });
    this.invalidate(tenantId).catch(() => {});
    return expense;
  }

  async findAll(
    tenantId: string,
    filters: { month?: string; category?: string } = {},
  ) {
    const where: any = { tenantId };

    if (filters.month) {
      const [year, month] = filters.month.split('-').map(Number);
      where.date = {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0, 23, 59, 59),
      };
    }

    if (filters.category) where.category = filters.category;

    return this.prisma.commerceExpense.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.commerceExpense.deleteMany({ where: { id, tenantId } });
    this.invalidate(tenantId).catch(() => {});
  }
}
