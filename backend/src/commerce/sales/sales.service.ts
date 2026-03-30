import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateSaleDto } from './dto/create-sale.dto';

const TTL = 60; // 1 minute — données financières fraîches

@Injectable()
export class SalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private listKey(tenantId: string, date?: string) {
    return `commerce:sales:${tenantId}:${date ?? 'all'}`;
  }

  private statsKey(tenantId: string) {
    return `commerce:dashboard:${tenantId}`;
  }

  private async invalidate(tenantId: string) {
    await Promise.all([
      this.cache.del(this.listKey(tenantId)),
      this.cache.del(this.statsKey(tenantId)),
    ]);
  }

  private generateReceiptNumber(): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `REC-${date}-${rand}`;
  }

  async findAll(
    tenantId: string,
    filters: {
      date?: string;
      cashierId?: string;
      customerId?: string;
      status?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { date, cashierId, customerId, status, page = 1, limit = 30 } = filters;

    const where: any = { tenantId };
    if (date) {
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }
    if (cashierId) where.cashierId = cashierId;
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const skip = (page - 1) * limit;
    const [sales, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          items: {
            include: { product: { select: { id: true, name: true, unit: true } } },
          },
          customer: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return {
      data: sales,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  async findOne(tenantId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: { product: { select: { id: true, name: true, unit: true } } },
        },
        customer: { select: { id: true, name: true, phone: true } },
      },
    });
    if (!sale) throw new NotFoundException('Vente introuvable');
    return sale;
  }

  async create(tenantId: string, cashierId: string, dto: CreateSaleDto) {
    // 1. Vérifier tous les produits + stock en une seule requête
    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, tenantId, isActive: true },
    });

    if (products.length !== productIds.length) {
      throw new NotFoundException('Un ou plusieurs produits introuvables');
    }

    // Map pour accès rapide
    const productMap = new Map(products.map((p) => [p.id, p]));

    // 2. Vérifier le stock pour chaque article
    for (const item of dto.items) {
      const product = productMap.get(item.productId)!;
      if (product.stockQty < item.quantity) {
        throw new BadRequestException(
          `Stock insuffisant pour "${product.name}" (disponible : ${product.stockQty} ${product.unit})`,
        );
      }
    }

    // 3. Calculer les totaux
    const totalAmount = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPrice,
      0,
    );
    const paidAmount = Math.min(dto.paidAmount, totalAmount);
    const changeAmount = Math.max(dto.paidAmount - totalAmount, 0);
    const remainingDebt = totalAmount - paidAmount;

    const status =
      remainingDebt > 0
        ? 'PARTIAL'
        : 'COMPLETED';

    // 4. Générer un numéro de reçu unique
    let receiptNumber: string;
    let attempts = 0;
    do {
      receiptNumber = this.generateReceiptNumber();
      const exists = await this.prisma.sale.findUnique({
        where: { tenantId_receiptNumber: { tenantId, receiptNumber } },
      });
      if (!exists) break;
      attempts++;
    } while (attempts < 5);

    // 5. Tout dans une transaction atomique
    const sale = await this.prisma.$transaction(async (tx) => {
      // Créer la vente
      const newSale = await tx.sale.create({
        data: {
          tenantId,
          receiptNumber,
          cashierId,
          customerId: dto.customerId ?? null,
          totalAmount,
          paidAmount,
          changeAmount,
          remainingDebt,
          paymentMethod: dto.paymentMethod ?? 'CASH',
          status,
          notes: dto.notes,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              totalPrice: item.quantity * item.unitPrice,
            })),
          },
        },
        include: {
          items: {
            include: { product: { select: { id: true, name: true, unit: true } } },
          },
          customer: { select: { id: true, name: true } },
        },
      });

      // Décrémenter le stock + créer les mouvements
      for (const item of dto.items) {
        const product = productMap.get(item.productId)!;
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { decrement: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            userId: cashierId,
            type: 'OUT',
            quantity: item.quantity,
            reason: `Vente ${receiptNumber}`,
          },
        });
      }

      // Mettre à jour la dette du client si applicable
      if (dto.customerId && remainingDebt > 0) {
        await tx.commerceCustomer.update({
          where: { id: dto.customerId },
          data: { totalDebt: { increment: remainingDebt } },
        });
      }

      return newSale;
    });

    await this.invalidate(tenantId);
    return sale;
  }

  async cancel(tenantId: string, id: string) {
    const sale = await this.findOne(tenantId, id);

    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('Cette vente est déjà annulée');
    }

    await this.prisma.$transaction(async (tx) => {
      // Annuler la vente
      await tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // Remettre le stock
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.quantity } },
        });
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: item.productId,
            userId: 'system',
            type: 'RETURN',
            quantity: item.quantity,
            reason: `Annulation vente ${sale.receiptNumber}`,
          },
        });
      }

      // Réduire la dette du client si applicable
      if (sale.customerId && sale.remainingDebt > 0) {
        await tx.commerceCustomer.update({
          where: { id: sale.customerId },
          data: { totalDebt: { decrement: sale.remainingDebt } },
        });
      }
    });

    await this.invalidate(tenantId);
    return { message: 'Vente annulée et stock restauré' };
  }
}
