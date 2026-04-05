import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateReceiptDto, ReceiptLineDto } from './dtos/create-receipt.dto';
import { ReceiptStatus } from '@prisma/client';

const TTL = 120; // 2 minutes

@Injectable()
export class StockReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private listKey(tenantId: string) {
    return `commerce:receipts:list:${tenantId}`;
  }

  // Clés du cache produits (doit correspondre à products.service.ts)
  private productsListKey(tenantId: string) { return `commerce:products:list:${tenantId}`; }
  private productsAlertsKey(tenantId: string) { return `commerce:products:alerts:${tenantId}`; }

  private async invalidateList(tenantId: string) {
    // Invalider receipts ET produits (le stock change quand un bon est créé/annulé)
    await Promise.all([
      this.cache.del(this.listKey(tenantId)),
      this.cache.del(this.productsListKey(tenantId)),
      this.cache.del(this.productsAlertsKey(tenantId)),
    ]);
  }

  /**
   * Créer un bon de réception — génère numéro unique, met à jour stock
   */
  async create(
    tenantId: string,
    userId: string,
    userName: string,
    dto: CreateReceiptDto,
  ) {
    // Générer numéro reçu unique (REC-001, REC-002, etc)
    const lastReceipt = await this.prisma.stockReceipt.findFirst({
      where: { tenantId },
      orderBy: { receiptNumber: 'desc' },
      select: { receiptNumber: true },
    });

    let nextNumber = 1;
    if (lastReceipt?.receiptNumber) {
      const match = lastReceipt.receiptNumber.match(/\d+$/);
      if (match) nextNumber = parseInt(match[0]) + 1;
    }
    const receiptNumber = `REC-${String(nextNumber).padStart(5, '0')}`;

    // Transaction: créer bon + lignes + mettre à jour stock
    const receipt = await this.prisma.$transaction(async (tx) => {
      // 1. Calculer le montant dû (fourni explicitement ou calculé depuis les lignes si tous les prix sont renseignés)
      const computedAmountDue =
        dto.amountDue !== undefined
          ? dto.amountDue
          : dto.lines.every((l) => l.unitPrice !== undefined && l.unitPrice > 0)
            ? dto.lines.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0)
            : null;

      // 2. Créer le bon
      const newReceipt = await tx.stockReceipt.create({
        data: {
          tenantId,
          receiptNumber,
          referenceNumber: dto.referenceNumber,
          supplierId: dto.supplierId,
          supplierName: dto.supplierName,
          receivedByUserId: userId,
          receivedByName: userName,
          status: 'RECEIVED' as ReceiptStatus,
          notes: dto.notes,
          totalItems: dto.lines.length,
          amountDue: computedAmountDue,
          paymentStatus: computedAmountDue && computedAmountDue > 0 ? 'UNPAID' : 'PAID',
        },
      });

      // 2. Créer les lignes et mettre à jour stock pour chaque produit
      for (const line of dto.lines) {
        // Vérifier produit existe
        const product = await tx.product.findFirst({
          where: { id: line.productId, tenantId, isActive: true },
        });
        if (!product) {
          throw new NotFoundException(
            `Produit ${line.productId} introuvable ou inactif`,
          );
        }

        // Vérifier unité correspond
        if (line.unit !== product.unit) {
          throw new BadRequestException(
            `Unité "${line.unit}" invalide pour "${product.name}" (attendu: ${product.unit})`,
          );
        }

        // Créer ligne reçu
        await tx.stockReceiptLine.create({
          data: {
            receiptId: newReceipt.id,
            productId: line.productId,
            quantity: line.quantity,
            unit: line.unit,
            unitPrice: line.unitPrice,
            totalPrice: line.unitPrice ? line.quantity * line.unitPrice : null,
            notes: line.notes,
          },
        });

        // Mettre à jour stock produit
        const newStock = product.stockQty + line.quantity;
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: newStock },
        });

        // Enregistrer mouvement stock
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: line.productId,
            userId,
            type: 'IN',
            quantity: line.quantity,
            reason: `Bon de réception ${receiptNumber}: ${line.quantity} ${line.unit}`,
          },
        });
      }

      return newReceipt;
    });

    await this.invalidateList(tenantId);
    return this.findOne(tenantId, receipt.id);
  }

  /**
   * Lister les bons de réception
   */
  async findAll(
    tenantId: string,
    filters: {
      supplierId?: string;
      status?: ReceiptStatus;
      startDate?: Date;
      endDate?: Date;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { supplierId, status, startDate, endDate, page = 1, limit = 50 } = filters;

    const where: any = { tenantId };
    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (startDate || endDate) {
      where.receivedAt = {};
      if (startDate) where.receivedAt.gte = startDate;
      if (endDate) where.receivedAt.lte = endDate;
    }

    const skip = (page - 1) * limit;
    const [receipts, total] = await Promise.all([
      this.prisma.stockReceipt.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          lines: {
            include: { product: { select: { id: true, name: true, unit: true } } },
          },
        },
        orderBy: { receivedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockReceipt.count({ where }),
    ]);

    return {
      data: receipts,
      total,
      page,
      pageCount: Math.ceil(total / limit),
    };
  }

  /**
   * Détail bon de réception
   */
  async findOne(tenantId: string, receiptId: string) {
    const receipt = await this.prisma.stockReceipt.findFirst({
      where: { id: receiptId, tenantId },
      include: {
        supplier: { select: { id: true, name: true, phone: true, email: true } },
        lines: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                unit: true,
                stockQty: true,
                reference: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!receipt) throw new NotFoundException('Bon introuvable');
    return receipt;
  }

  /**
   * Vérifier un bon (mark as VERIFIED)
   */
  async verify(tenantId: string, receiptId: string, userId: string) {
    const receipt = await this.findOne(tenantId, receiptId);

    if (receipt.status === 'VERIFIED') {
      throw new BadRequestException('Bon déjà vérifié');
    }

    if (receipt.status === 'CANCELLED') {
      throw new BadRequestException('Bon annulé — impossible de vérifier');
    }

    return this.prisma.stockReceipt.update({
      where: { id: receiptId },
      data: {
        status: 'VERIFIED' as ReceiptStatus,
        verifiedByUserId: userId,
        verifiedAt: new Date(),
      },
    });
  }

  /**
   * Annuler un bon — restaure stock
   */
  async cancel(tenantId: string, receiptId: string) {
    const receipt = await this.findOne(tenantId, receiptId);

    if (receipt.status === 'CANCELLED') {
      throw new BadRequestException('Bon déjà annulé');
    }

    // Transaction: annuler + restaurer stock
    await this.prisma.$transaction(async (tx) => {
      // Marquer comme annulé
      await tx.stockReceipt.update({
        where: { id: receiptId },
        data: { status: 'CANCELLED' as ReceiptStatus },
      });

      // Restaurer stock pour chaque ligne
      for (const line of receipt.lines) {
        const product = await tx.product.findUnique({
          where: { id: line.productId },
        });
        if (product) {
          const newStock = Math.max(0, product.stockQty - line.quantity);
          await tx.product.update({
            where: { id: line.productId },
            data: { stockQty: newStock },
          });
        }
      }

      // Enregistrer mouvements d'annulation
      for (const line of receipt.lines) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: line.productId,
            userId: 'system',
            type: 'OUT',
            quantity: line.quantity,
            reason: `Annulation bon ${receipt.receiptNumber}`,
          },
        });
      }
    });

    await this.invalidateList(tenantId);
  }

  /**
   * Statistiques bons (pour dashboard)
   */
  async getStats(tenantId: string, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const [totalReceived, totalValue, bySupplier] = await Promise.all([
      this.prisma.stockReceipt.count({
        where: { tenantId, receivedAt: { gte: startDate } },
      }),
      this.prisma.stockReceiptLine.aggregate({
        where: {
          receipt: { tenantId, receivedAt: { gte: startDate } },
        },
        _sum: { totalPrice: true },
      }),
      this.prisma.stockReceipt.groupBy({
        by: ['supplierName'],
        where: { tenantId, receivedAt: { gte: startDate } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    return {
      period: `${days} jours`,
      totalReceived,
      totalValue: totalValue._sum?.totalPrice ?? 0,
      topSuppliers: bySupplier,
    };
  }
}
