import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

const TTL = 60; // 1 minute

@Injectable()
export class CommerceDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private statsKey(tenantId: string) {
    return `commerce:dashboard:${tenantId}`;
  }

  async getStats(tenantId: string) {
    const cached = await this.cache.get<any>(this.statsKey(tenantId));
    if (cached) return cached;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

    const [
      salesToday,
      salesMonth,
      totalProducts,
      lowStockCount,
      totalCustomers,
      topProducts,
      recentSales,
    ] = await Promise.all([
      // Ventes du jour
      this.prisma.sale.aggregate({
        where: {
          tenantId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: today, lt: tomorrow },
        },
        _sum: { totalAmount: true, paidAmount: true },
        _count: true,
      }),
      // Ventes du mois
      this.prisma.sale.aggregate({
        where: {
          tenantId,
          status: { not: 'CANCELLED' },
          createdAt: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { totalAmount: true, paidAmount: true, remainingDebt: true },
        _count: true,
      }),
      // Total produits actifs
      this.prisma.product.count({
        where: { tenantId, isActive: true },
      }),
      // Produits en rupture de stock
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) as count FROM products
        WHERE "tenantId" = ${tenantId}
          AND "isActive" = true
          AND "stockQty" <= "stockAlert"
      `,
      // Total clients
      this.prisma.commerceCustomer.count({
        where: { tenantId, isActive: true },
      }),
      // Top 5 produits du mois
      this.prisma.saleItem.groupBy({
        by: ['productId'],
        where: {
          sale: {
            tenantId,
            status: { not: 'CANCELLED' },
            createdAt: { gte: startOfMonth, lte: endOfMonth },
          },
        },
        _sum: { quantity: true, totalPrice: true },
        orderBy: { _sum: { totalPrice: 'desc' } },
        take: 5,
      }),
      // 5 dernières ventes
      this.prisma.sale.findMany({
        where: { tenantId, status: { not: 'CANCELLED' } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          receiptNumber: true,
          totalAmount: true,
          paymentMethod: true,
          status: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
    ]);

    // Enrichir les top produits avec les noms
    const productIds = topProducts.map((p) => p.productId);
    const productNames =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, name: true, unit: true },
          })
        : [];
    const nameMap = new Map(productNames.map((p) => [p.id, p]));

    const stats = {
      today: {
        revenue: salesToday._sum.totalAmount ?? 0,
        collected: salesToday._sum.paidAmount ?? 0,
        salesCount: salesToday._count,
      },
      month: {
        revenue: salesMonth._sum.totalAmount ?? 0,
        collected: salesMonth._sum.paidAmount ?? 0,
        remainingDebt: salesMonth._sum.remainingDebt ?? 0,
        salesCount: salesMonth._count,
      },
      inventory: {
        totalProducts,
        lowStockCount: Number((lowStockCount as any)[0]?.count ?? 0),
      },
      totalCustomers,
      topProducts: topProducts.map((p) => ({
        productId: p.productId,
        name: nameMap.get(p.productId)?.name ?? 'Produit supprimé',
        unit: nameMap.get(p.productId)?.unit ?? '',
        totalQty: p._sum.quantity ?? 0,
        totalRevenue: p._sum.totalPrice ?? 0,
      })),
      recentSales,
    };

    await this.cache.set(this.statsKey(tenantId), stats, TTL);
    return stats;
  }

  async getRevenueChart(tenantId: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const sales = await this.prisma.$queryRaw<any[]>`
      SELECT
        DATE("createdAt") as date,
        SUM("totalAmount") as revenue,
        SUM("paidAmount") as collected,
        COUNT(*) as sales_count
      FROM sales
      WHERE "tenantId" = ${tenantId}
        AND status != 'CANCELLED'
        AND "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    return sales.map((row) => ({
      date: row.date,
      revenue: Number(row.revenue),
      collected: Number(row.collected),
      salesCount: Number(row.sales_count),
    }));
  }
}
