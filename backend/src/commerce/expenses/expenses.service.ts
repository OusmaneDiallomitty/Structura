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

  private cacheKey(tenantId: string, month?: string, category?: string) {
    // Clé spécifique par filtre — évite de retourner le mauvais cache
    const suffix = [month, category].filter(Boolean).join(':') || 'all';
    return `commerce:expenses:${tenantId}:${suffix}`;
  }

  private async invalidate(tenantId: string) {
    // Pattern-delete : invalide toutes les clés expenses de ce tenant
    await Promise.all([
      this.cache.del(`commerce:expenses:${tenantId}:all`),
      this.cache.del(`commerce:dashboard:${tenantId}`),
    ]);
    // Invalider les clés par mois des 3 derniers mois (cas courant)
    const now = new Date();
    for (let i = 0; i < 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      await this.cache.del(`commerce:expenses:${tenantId}:${monthStr}`).catch(() => {});
    }
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
    const key = this.cacheKey(tenantId, filters.month, filters.category);
    const cached = await this.cache.get<any[]>(key);
    if (cached) return cached;

    const where: any = { tenantId };

    if (filters.month) {
      const [year, month] = filters.month.split('-').map(Number);
      where.date = {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0, 23, 59, 59),
      };
    }

    if (filters.category) where.category = filters.category;

    const result = await this.prisma.commerceExpense.findMany({
      where,
      orderBy: { date: 'desc' },
    });

    await this.cache.set(key, result, 120);
    return result;
  }

  async remove(tenantId: string, id: string) {
    await this.prisma.commerceExpense.deleteMany({ where: { id, tenantId } });
    this.invalidate(tenantId).catch(() => {});
  }
}
