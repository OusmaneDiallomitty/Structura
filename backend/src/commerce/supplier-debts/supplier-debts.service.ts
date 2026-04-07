import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { PaySupplierDebtDto } from './dto/pay-supplier-debt.dto';
import { SupplierPaymentStatus } from '@prisma/client';

const TTL = 60; // 1 minute

@Injectable()
export class SupplierDebtsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private listKey(tenantId: string) {
    return `commerce:supplier-debts:${tenantId}`;
  }

  private historyKey(tenantId: string) {
    return `commerce:supplier-payments:${tenantId}`;
  }

  private async invalidate(tenantId: string) {
    await Promise.all([
      this.cache.del(this.listKey(tenantId)),
      this.cache.del(this.historyKey(tenantId)),
    ]);
  }

  /**
   * Lister les bons de réception avec montant dû (UNPAID ou PARTIAL)
   * Groupés par fournisseur côté service
   */
  async findDebts(tenantId: string, supplierId?: string) {
    const cached = supplierId
      ? undefined
      : await this.cache.get<any>(this.listKey(tenantId));
    if (cached) return cached;

    const where: any = {
      tenantId,
      amountDue: { gt: 0 },
      paymentStatus: { in: ['UNPAID', 'PARTIAL'] as SupplierPaymentStatus[] },
      status: { not: 'CANCELLED' },
    };
    if (supplierId) where.supplierId = supplierId;

    const receipts = await this.prisma.stockReceipt.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true, phone: true } },
        supplierPayments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { receivedAt: 'desc' },
    });

    // Statistiques globales
    const totalOwed = receipts.reduce(
      (sum, r) => sum + ((r.amountDue ?? 0) - r.amountPaid),
      0,
    );

    // Grouper par fournisseur
    const bySupplier = receipts.reduce<
      Record<string, { supplierName: string; supplierId: string | null; phone: string | null; totalOwed: number; receipts: typeof receipts }>
    >((acc, r) => {
      const key = r.supplierId ?? r.supplierName;
      if (!acc[key]) {
        acc[key] = {
          supplierName: r.supplierName,
          supplierId: r.supplierId,
          phone: r.supplier?.phone ?? null,
          totalOwed: 0,
          receipts: [],
        };
      }
      acc[key].totalOwed += (r.amountDue ?? 0) - r.amountPaid;
      acc[key].receipts.push(r);
      return acc;
    }, {});

    const result = {
      totalOwed,
      receiptCount: receipts.length,
      suppliers: Object.values(bySupplier).sort((a, b) => b.totalOwed - a.totalOwed),
    };

    if (!supplierId) {
      await this.cache.set(this.listKey(tenantId), result, TTL);
    }
    return result;
  }

  /**
   * Enregistrer un paiement sur un bon de réception
   */
  async payDebt(
    tenantId: string,
    receiptId: string,
    dto: PaySupplierDebtDto,
    userId: string,
    userName: string,
  ) {
    // Charger le bon
    const receipt = await this.prisma.stockReceipt.findFirst({
      where: { id: receiptId, tenantId },
    });
    if (!receipt) throw new NotFoundException('Bon de réception introuvable');

    if (!receipt.amountDue || receipt.amountDue <= 0) {
      throw new BadRequestException('Ce bon n\'a pas de montant dû enregistré');
    }

    const remaining = receipt.amountDue - receipt.amountPaid;
    if (remaining <= 0) {
      throw new BadRequestException('Ce bon est déjà soldé');
    }

    // Payer au maximum le reste dû
    const payment = Math.min(dto.amount, remaining);
    const newAmountPaid = receipt.amountPaid + payment;
    const newRemaining = receipt.amountDue - newAmountPaid;

    const newStatus: SupplierPaymentStatus =
      newRemaining <= 0 ? 'PAID' : 'PARTIAL';

    // Transaction : créer paiement + mettre à jour bon
    const [supplierPayment] = await this.prisma.$transaction([
      this.prisma.supplierPayment.create({
        data: {
          tenantId,
          receiptId,
          supplierId: receipt.supplierId,
          supplierName: receipt.supplierName,
          amount: payment,
          paymentMethod: dto.paymentMethod ?? 'CASH',
          notes: dto.notes,
          paidByUserId: userId,
          paidByName: userName,
        },
      }),
      this.prisma.stockReceipt.update({
        where: { id: receiptId },
        data: {
          amountPaid: newAmountPaid,
          paymentStatus: newStatus,
        },
      }),
    ]);

    this.invalidate(tenantId).catch(() => {});

    return {
      paymentId: supplierPayment.id,
      receiptId,
      receiptNumber: receipt.receiptNumber,
      supplierName: receipt.supplierName,
      supplierId: receipt.supplierId,
      amountPaid: payment,
      totalAmountPaid: newAmountPaid,
      amountDue: receipt.amountDue,
      remainingDebt: newRemaining,
      paymentStatus: newStatus,
      paymentMethod: dto.paymentMethod ?? 'CASH',
      paidAt: supplierPayment.createdAt,
    };
  }

  /**
   * Historique des paiements fournisseur (filtrable par mois / fournisseur)
   */
  async getHistory(
    tenantId: string,
    filters: { supplierId?: string; month?: string } = {},
  ) {
    const where: any = { tenantId };
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.month) {
      const [year, month] = filters.month.split('-').map(Number);
      where.createdAt = {
        gte: new Date(year, month - 1, 1),
        lt: new Date(year, month, 1),
      };
    }

    const payments = await this.prisma.supplierPayment.findMany({
      where,
      include: {
        receipt: {
          select: {
            id: true,
            receiptNumber: true,
            amountDue: true,
            amountPaid: true,
            paymentStatus: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
    return { payments, totalPaid };
  }

  /**
   * Stats pour dashboard
   */
  async getStats(tenantId: string) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalOwedAgg, paidThisMonthAgg, unpaidCount, partialCount] =
      await Promise.all([
        this.prisma.stockReceipt.aggregate({
          where: {
            tenantId,
            amountDue: { gt: 0 },
            paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
          },
          _sum: { amountDue: true, amountPaid: true },
        }),
        this.prisma.supplierPayment.aggregate({
          where: { tenantId, createdAt: { gte: startOfMonth } },
          _sum: { amount: true },
        }),
        this.prisma.stockReceipt.count({
          where: { tenantId, paymentStatus: 'UNPAID', amountDue: { gt: 0 } },
        }),
        this.prisma.stockReceipt.count({
          where: { tenantId, paymentStatus: 'PARTIAL', amountDue: { gt: 0 } },
        }),
      ]);

    const totalDue = totalOwedAgg._sum.amountDue ?? 0;
    const totalAlreadyPaid = totalOwedAgg._sum.amountPaid ?? 0;

    return {
      totalOwed: totalDue - totalAlreadyPaid,
      paidThisMonth: paidThisMonthAgg._sum.amount ?? 0,
      unpaidCount,
      partialCount,
    };
  }
}
