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
    const cacheKey = `commerce:chart:${tenantId}:${days}`;
    const cached = await this.cache.get<any[]>(cacheKey);
    if (cached) return cached;

    const since = new Date(); since.setDate(since.getDate() - days); since.setHours(0,0,0,0);
    const [sales, expenses, cogs] = await Promise.all([
      this.prisma.$queryRaw<any[]>`SELECT DATE("createdAt") as date, SUM("totalAmount") as revenue, SUM("paidAmount") as collected, COUNT(*) as sales_count FROM sales WHERE "tenantId" = ${tenantId} AND status != 'CANCELLED' AND "createdAt" >= ${since} GROUP BY DATE("createdAt") ORDER BY date ASC`,
      this.prisma.$queryRaw<any[]>`SELECT DATE(date) as date, SUM(amount) as total FROM commerce_expenses WHERE "tenantId" = ${tenantId} AND date >= ${since} GROUP BY DATE(date) ORDER BY date ASC`,
      this.prisma.$queryRaw<any[]>`SELECT DATE(s."createdAt") as date, SUM(si."costPrice") as cog FROM sale_items si JOIN sales s ON si."saleId" = s.id WHERE s."tenantId" = ${tenantId} AND s.status != 'CANCELLED' AND s."createdAt" >= ${since} GROUP BY DATE(s."createdAt") ORDER BY date ASC`,
    ]);
    const expMap = new Map(expenses.map((e) => [String(e.date), Number(e.total)]));
    const cogMap = new Map(cogs.map((c) => [String(c.date), Number(c.cog)]));
    const result = sales.map((row) => {
      const rev = Number(row.revenue);
      const cog = cogMap.get(String(row.date)) ?? 0;
      const exp = expMap.get(String(row.date)) ?? 0;
      return { date: row.date, revenue: rev, collected: Number(row.collected), salesCount: Number(row.sales_count), expenses: exp, cog, grossProfit: rev - cog, netProfit: rev - cog - exp };
    });

    // Cache 5 min — graphique historique, change peu souvent
    await this.cache.set(cacheKey, result, 300);
    return result;
  }

  async getAnalytics(tenantId: string) {
    const now = new Date();
    const startOfThisWeek = new Date(now); startOfThisWeek.setDate(now.getDate() - now.getDay()); startOfThisWeek.setHours(0,0,0,0);
    const startOfLastWeek = new Date(startOfThisWeek); startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);
    const endOfLastWeek   = new Date(startOfThisWeek); endOfLastWeek.setMilliseconds(-1);

    const [thisWeek, lastWeek, thisWeekCog, lastWeekCog, lowMarginProducts] = await Promise.all([
      this.prisma.sale.aggregate({ where: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: startOfThisWeek } }, _sum: { totalAmount: true, paidAmount: true }, _count: true }),
      this.prisma.sale.aggregate({ where: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: startOfLastWeek, lte: endOfLastWeek } }, _sum: { totalAmount: true }, _count: true }),
      this.prisma.saleItem.aggregate({ where: { sale: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: startOfThisWeek } } }, _sum: { costPrice: true } }),
      this.prisma.saleItem.aggregate({ where: { sale: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: startOfLastWeek, lte: endOfLastWeek } } }, _sum: { costPrice: true } }),
      // Produits vendus ce mois avec marge < 10%
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: { sale: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } }, costPrice: { gt: 0 } },
        _sum: { totalPrice: true, costPrice: true },
        having: { costPrice: { _sum: { gt: 0 } } },
      }),
    ]);

    const thisRevenue  = thisWeek._sum.totalAmount ?? 0;
    const lastRevenue  = lastWeek._sum.totalAmount ?? 0;
    const thisProfit   = thisRevenue - (thisWeekCog._sum.costPrice ?? 0);
    const lastProfit   = lastRevenue - (lastWeekCog._sum.costPrice ?? 0);
    const revenueChange = lastRevenue > 0 ? ((thisRevenue - lastRevenue) / lastRevenue) * 100 : null;
    const profitChange  = lastProfit  > 0 ? ((thisProfit  - lastProfit)  / lastProfit)  * 100 : null;

    // Filtrer côté JS les produits < 10% marge
    const productIds = lowMarginProducts
      .filter((p) => {
        const rev  = p._sum.totalPrice ?? 0;
        const cost = p._sum.costPrice  ?? 0;
        return rev > 0 && (rev - cost) / rev < 0.10;
      })
      .map((p) => p.productId);

    const lowMarginInfo = productIds.length > 0
      ? await this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true, sellPrice: true, buyPrice: true } })
      : [];

    const lowMarginWithMargin = lowMarginInfo.map((p) => ({
      id: p.id, name: p.name, sellingPrice: p.sellPrice, costPrice: p.buyPrice,
      margin: p.buyPrice > 0 ? ((p.sellPrice - p.buyPrice) / p.sellPrice) * 100 : null,
    }));

    return {
      week: { thisRevenue, lastRevenue, thisProfit, lastProfit, thisCount: thisWeek._count, lastCount: lastWeek._count, revenueChange, profitChange },
      alerts: { lowMarginProducts: lowMarginWithMargin },
    };
  }

  async getMonthlyReport(tenantId: string, month?: string) {
    const now = new Date();
    let year: number, monthNum: number;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      [year, monthNum] = month.split('-').map(Number);
    } else {
      year = now.getFullYear(); monthNum = now.getMonth() + 1;
    }

    const start = new Date(year, monthNum - 1, 1);
    const end   = new Date(year, monthNum, 0, 23, 59, 59, 999);

    const [salesByDay, cogByDay, expenses, debtPaymentsAgg, supplierPayments, expByCategory] = await Promise.all([
      this.prisma.$queryRaw<any[]>`
        SELECT DATE("createdAt" AT TIME ZONE 'UTC') as day,
               SUM("totalAmount") as revenue,
               SUM("paidAmount") as collected,
               COUNT(*) as sales_count
        FROM sales
        WHERE "tenantId" = ${tenantId} AND status != 'CANCELLED'
          AND "createdAt" >= ${start} AND "createdAt" <= ${end}
        GROUP BY day ORDER BY day ASC`,
      this.prisma.$queryRaw<any[]>`
        SELECT DATE(s."createdAt" AT TIME ZONE 'UTC') as day, SUM(si."costPrice") as cog
        FROM sale_items si JOIN sales s ON si."saleId" = s.id
        WHERE s."tenantId" = ${tenantId} AND s.status != 'CANCELLED'
          AND s."createdAt" >= ${start} AND s."createdAt" <= ${end}
        GROUP BY day ORDER BY day ASC`,
      this.prisma.commerceExpense.findMany({ where: { tenantId, date: { gte: start, lte: end } }, orderBy: { date: 'asc' } }),
      this.prisma.salesPayment.aggregate({ where: { tenantId, createdAt: { gte: start, lte: end } }, _sum: { amount: true } }),
      this.prisma.supplierPayment.findMany({ where: { tenantId, createdAt: { gte: start, lte: end } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.commerceExpense.groupBy({ by: ['category'], where: { tenantId, date: { gte: start, lte: end } }, _sum: { amount: true }, _count: true, orderBy: { _sum: { amount: 'desc' } } }),
    ]);

    const toKey = (d: any) => String(d instanceof Date ? d.toISOString() : d).slice(0, 10);

    // Maps jour → valeurs
    const cogMap  = new Map(cogByDay.map(r => [toKey(r.day), Number(r.cog)]));
    const expMap  = new Map<string, number>();
    const suppMap = new Map<string, number>();
    for (const e of expenses) { const k = toKey(e.date); expMap.set(k, (expMap.get(k) ?? 0) + e.amount); }
    for (const p of supplierPayments) { const k = toKey(p.createdAt); suppMap.set(k, (suppMap.get(k) ?? 0) + p.amount); }

    // Construire les jours depuis les ventes
    const dayMap = new Map<string, any>();
    for (const row of salesByDay) {
      const day = toKey(row.day);
      const rev = Number(row.revenue); const cog = cogMap.get(day) ?? 0;
      const exp = expMap.get(day) ?? 0; const supp = suppMap.get(day) ?? 0;
      const collected = Number(row.collected);
      dayMap.set(day, { date: day, salesCount: Number(row.sales_count), revenue: rev, cog, grossProfit: rev - cog, expenses: exp, supplierPayments: supp, netProfit: rev - cog - exp, collected, cashNet: collected - exp - supp });
    }
    // Ajouter les jours sans ventes mais avec dépenses/paiements fournisseurs
    for (const [day, exp] of expMap) {
      if (!dayMap.has(day)) { const supp = suppMap.get(day) ?? 0; dayMap.set(day, { date: day, salesCount: 0, revenue: 0, cog: 0, grossProfit: 0, expenses: exp, supplierPayments: supp, netProfit: -exp, collected: 0, cashNet: -exp - supp }); }
    }
    for (const [day, supp] of suppMap) {
      if (!dayMap.has(day)) { const exp = expMap.get(day) ?? 0; dayMap.set(day, { date: day, salesCount: 0, revenue: 0, cog: 0, grossProfit: 0, expenses: exp, supplierPayments: supp, netProfit: -exp, collected: 0, cashNet: -exp - supp }); }
    }
    const byDay = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

    // Totaux
    const totalRevenue          = byDay.reduce((s, d) => s + d.revenue, 0);
    const totalCog              = byDay.reduce((s, d) => s + d.cog, 0);
    const totalGrossProfit      = totalRevenue - totalCog;
    const totalExpenses         = expenses.reduce((s, e) => s + e.amount, 0);
    const totalSupplierPayments = supplierPayments.reduce((s, p) => s + p.amount, 0);
    const totalNetProfit        = totalGrossProfit - totalExpenses;
    const totalCollected        = byDay.reduce((s, d) => s + d.collected, 0);
    const totalDebtRecovered    = debtPaymentsAgg._sum.amount ?? 0;
    const cashNet               = totalCollected + totalDebtRecovered - totalExpenses - totalSupplierPayments;
    const marginPct             = totalRevenue > 0 ? (totalGrossProfit / totalRevenue) * 100 : null;

    return {
      month: `${year}-${String(monthNum).padStart(2, '0')}`,
      summary: {
        revenue: totalRevenue, cog: totalCog, grossProfit: totalGrossProfit,
        expenses: totalExpenses, supplierPayments: totalSupplierPayments,
        netProfit: totalNetProfit, collected: totalCollected,
        debtRecovered: totalDebtRecovered, cashNet, marginPct,
        salesCount: byDay.reduce((s, d) => s + d.salesCount, 0),
      },
      byDay,
      expensesByCategory: expByCategory.map(e => ({ category: e.category, total: e._sum.amount ?? 0, count: e._count })),
      supplierPaymentsList: supplierPayments,
    };
  }

  async getDailySituation(tenantId: string, date?: string) {
    const target = date ? new Date(date) : new Date();
    target.setHours(0,0,0,0);
    const end = new Date(target); end.setHours(23,59,59,999);

    const [sales, expenses, cogAgg, debtPayments, supplierPayments] = await Promise.all([
      this.prisma.sale.findMany({
        where: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: target, lte: end } },
        select: {
          id: true, receiptNumber: true, totalAmount: true, paidAmount: true,
          remainingDebt: true, paymentMethod: true, status: true, createdAt: true, notes: true,
          customer: { select: { id: true, name: true } },
          items: { select: { id: true, quantity: true, unitPrice: true, totalPrice: true, costPrice: true, product: { select: { id: true, name: true, unit: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.commerceExpense.findMany({ where: { tenantId, date: { gte: target, lte: end } }, orderBy: { date: 'asc' } }),
      this.prisma.saleItem.aggregate({ where: { sale: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte: target, lte: end } } }, _sum: { totalPrice: true, costPrice: true } }),
      this.prisma.salesPayment.findMany({
        where: { tenantId, createdAt: { gte: target, lte: end } },
        include: { sale: { select: { receiptNumber: true, customer: { select: { name: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.supplierPayment.findMany({
        where: { tenantId, createdAt: { gte: target, lte: end } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const totalRevenue        = sales.reduce((s, v) => s + v.totalAmount, 0);
    const totalCollected      = sales.reduce((s, v) => s + v.paidAmount,  0);
    const totalDebt           = sales.reduce((s, v) => s + v.remainingDebt, 0);
    const totalExpenses       = expenses.reduce((s, e) => s + e.amount, 0);
    const totalCog            = cogAgg._sum.costPrice ?? 0;
    const grossProfit         = totalRevenue - totalCog;
    const netProfit           = grossProfit - totalExpenses;
    const totalDebtRecovered  = (debtPayments as any[]).reduce((s: number, p: any) => s + p.amount, 0);
    const totalSupplierPaid   = supplierPayments.reduce((s, p) => s + p.amount, 0);
    // Cash net = tout l'argent encaissé − tout l'argent sorti physiquement
    const cashNet             = totalCollected + totalDebtRecovered - totalExpenses - totalSupplierPaid;

    const byMethod: Record<string, number> = {};
    for (const s of sales) { if (s.paidAmount > 0) byMethod[s.paymentMethod] = (byMethod[s.paymentMethod] ?? 0) + s.paidAmount; }
    for (const p of debtPayments as any[]) {
      if (p.amount > 0) byMethod['DEBT_RECOVERY'] = (byMethod['DEBT_RECOVERY'] ?? 0) + p.amount;
    }

    return {
      date: target.toISOString().slice(0, 10),
      summary: {
        totalRevenue, totalCollected, totalDebt, totalExpenses, totalCog,
        grossProfit, netProfit, salesCount: sales.length,
        totalDebtRecovered, totalSupplierPaid, cashNet,
      },
      byMethod, sales, expenses, debtPayments, supplierPayments,
    };
  }
}
