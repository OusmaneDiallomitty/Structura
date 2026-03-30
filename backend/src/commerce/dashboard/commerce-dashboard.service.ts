import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

const TTL = 60;

@Injectable()
export class CommerceDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private statsKey(tenantId: string) { return `commerce:dashboard:${tenantId}`; }

  async getStats(tenantId: string) {
    const cached = await this.cache.get<any>(this.statsKey(tenantId));
    if (cached) return cached;

    const today = new Date(); today.setHours(0,0,0,0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth   = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    const [salesToday, salesMonth, totalProducts, lowStockRaw, totalCustomers,
           topProducts, recentSales, expMonth, expToday, cogMonth, cogToday] = await Promise.all([
      this.prisma.sale.aggregate({ where: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: today, lt: tomorrow } }, _sum: { totalAmount: true, paidAmount: true, remainingDebt: true }, _count: true }),
      this.prisma.sale.aggregate({ where: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: startOfMonth, lte: endOfMonth } }, _sum: { totalAmount: true, paidAmount: true, remainingDebt: true }, _count: true }),
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
      this.prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM products WHERE "tenantId" = ${tenantId} AND "isActive" = true AND "stockQty" <= "stockAlert"`,
      this.prisma.commerceCustomer.count({ where: { tenantId, isActive: true } }),
      this.prisma.saleItem.groupBy({ by: ['productId'], where: { sale: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: startOfMonth, lte: endOfMonth } } }, _sum: { quantity: true, totalPrice: true, costPrice: true }, orderBy: { _sum: { totalPrice: 'desc' } }, take: 5 }),
      this.prisma.sale.findMany({ where: { tenantId, status: { not: 'CANCELLED' } }, orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, receiptNumber: true, totalAmount: true, paidAmount: true, paymentMethod: true, status: true, createdAt: true, customer: { select: { name: true } } } }),
      this.prisma.commerceExpense.aggregate({ where: { tenantId, date: { gte: startOfMonth, lte: endOfMonth } }, _sum: { amount: true } }),
      this.prisma.commerceExpense.aggregate({ where: { tenantId, date: { gte: today, lt: tomorrow } }, _sum: { amount: true } }),
      this.prisma.saleItem.aggregate({ where: { sale: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: startOfMonth, lte: endOfMonth } } }, _sum: { costPrice: true } }),
      this.prisma.saleItem.aggregate({ where: { sale: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: today, lt: tomorrow } } }, _sum: { costPrice: true } }),
    ]);

    const revMonth  = salesMonth._sum.totalAmount ?? 0;
    const revToday  = salesToday._sum.totalAmount ?? 0;
    const cmvMonth  = cogMonth._sum.costPrice ?? 0;
    const cmvToday  = cogToday._sum.costPrice ?? 0;
    const depMonth  = expMonth._sum.amount ?? 0;
    const depToday  = expToday._sum.amount ?? 0;

    const productIds  = topProducts.map((p) => p.productId);
    const productInfo = productIds.length > 0 ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, unit: true } }) : [];
    const nameMap     = new Map(productInfo.map((p) => [p.id, p]));

    const stats = {
      today: {
        revenue: revToday, collected: salesToday._sum.paidAmount ?? 0,
        debt: salesToday._sum.remainingDebt ?? 0, salesCount: salesToday._count,
        expenses: depToday, cog: cmvToday,
        grossProfit: revToday - cmvToday, netProfit: revToday - cmvToday - depToday,
      },
      month: {
        revenue: revMonth, collected: salesMonth._sum.paidAmount ?? 0,
        remainingDebt: salesMonth._sum.remainingDebt ?? 0, salesCount: salesMonth._count,
        expenses: depMonth, cog: cmvMonth,
        grossProfit: revMonth - cmvMonth, netProfit: revMonth - cmvMonth - depMonth,
      },
      inventory: { totalProducts, lowStockCount: Number((lowStockRaw as any)[0]?.count ?? 0) },
      totalCustomers,
      topProducts: topProducts.map((p) => {
        const rev  = p._sum.totalPrice ?? 0;
        const cost = p._sum.costPrice  ?? 0;
        return { productId: p.productId, name: nameMap.get(p.productId)?.name ?? '?', unit: nameMap.get(p.productId)?.unit ?? '', totalQty: p._sum.quantity ?? 0, totalRevenue: rev, totalCost: cost, grossProfit: rev - cost };
      }),
      recentSales,
    };

    await this.cache.set(this.statsKey(tenantId), stats, TTL);
    return stats;
  }

  async getRevenueChart(tenantId: string, days = 30) {
    const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0,0,0,0);
    const [sales, expenses] = await Promise.all([
      this.prisma.$queryRaw<any[]>`SELECT DATE("createdAt") as date, SUM("totalAmount") as revenue, SUM("paidAmount") as collected, COUNT(*) as sales_count FROM sales WHERE "tenantId" = ${tenantId} AND status != 'CANCELLED' AND "createdAt" >= ${since} GROUP BY DATE("createdAt") ORDER BY date ASC`,
      this.prisma.$queryRaw<any[]>`SELECT DATE(date) as date, SUM(amount) as total FROM commerce_expenses WHERE "tenantId" = ${tenantId} AND date >= ${since} GROUP BY DATE(date) ORDER BY date ASC`,
    ]);
    const expMap = new Map(expenses.map((e) => [String(e.date), Number(e.total)]));
    return sales.map((row) => ({ date: row.date, revenue: Number(row.revenue), collected: Number(row.collected), salesCount: Number(row.sales_count), expenses: expMap.get(String(row.date)) ?? 0 }));
  }

  async getDailySituation(tenantId: string, date?: string) {
    const target = date ? new Date(date) : new Date();
    target.setHours(0,0,0,0);
    const end = new Date(target); end.setHours(23,59,59,999);

    const [sales, expenses, cogAgg] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: target, lte: end } },
        include: { items: { include: { product: { select: { id: true, name: true, unit: true } } } }, customer: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.commerceExpense.findMany({ where: { tenantId, date: { gte: target, lte: end } }, orderBy: { date: 'asc' } }),
      this.prisma.saleItem.aggregate({ where: { sale: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: target, lte: end } } }, _sum: { totalPrice: true, costPrice: true } }),
    ]);

    const totalRevenue   = sales.reduce((s, v) => s + v.totalAmount, 0);
    const totalCollected = sales.reduce((s, v) => s + v.paidAmount,  0);
    const totalDebt      = sales.reduce((s, v) => s + v.remainingDebt, 0);
    const totalExpenses  = expenses.reduce((s, e) => s + e.amount, 0);
    const totalCog       = cogAgg._sum.costPrice ?? 0;
    const grossProfit    = totalRevenue - totalCog;
    const netProfit      = grossProfit - totalExpenses;

    const byMethod: Record<string, number> = {};
    for (const s of sales) { if (s.paidAmount > 0) byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + s.paidAmount; }

    return {
      date: target.toISOString().slice(0, 10),
      summary: { totalRevenue, totalCollected, totalDebt, totalExpenses, totalCog, grossProfit, netProfit, salesCount: sales.length },
      byMethod, sales, expenses,
    };
  }
}
