import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

const TTL = 300; // 5 minutes — invalidé immédiatement à chaque mutation

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private listKey(tenantId: string) {
    return `commerce:customers:${tenantId}`;
  }

  private async invalidate(tenantId: string) {
    await this.cache.del(this.listKey(tenantId));
  }

  async findAll(tenantId: string, search?: string, limit = 200) {
    // Cache uniquement sans filtre — résultats filtrés trop variables pour cacher
    if (!search) {
      const cached = await this.cache.get<any[]>(this.listKey(tenantId));
      if (cached) return cached;
    }

    const take = Math.min(limit, 500); // Plafond absolu à 500

    const customers = await this.prisma.commerceCustomer.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
      },
      orderBy: { name: 'asc' },
      take,
    });

    if (!search) await this.cache.set(this.listKey(tenantId), customers, TTL);
    return customers;
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.prisma.commerceCustomer.findFirst({
      where: { id, tenantId, isActive: true },
      include: {
        sales: {
          where: { status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            receiptNumber: true,
            totalAmount: true,
            paidAmount: true,
            remainingDebt: true,
            paymentMethod: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Client introuvable');
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto) {
    const customer = await this.prisma.commerceCustomer.create({
      data: { tenantId, ...dto },
    });
    await this.invalidate(tenantId);
    return customer;
  }

  async update(tenantId: string, id: string, dto: Partial<CreateCustomerDto>) {
    await this.findOne(tenantId, id);
    const updated = await this.prisma.commerceCustomer.update({
      where: { id },
      data: dto,
    });
    await this.invalidate(tenantId);
    return updated;
  }

  async payDebt(tenantId: string, id: string, amount: number) {
    // Requête légère — on n'a besoin que de totalDebt et name
    const customer = await this.prisma.commerceCustomer.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true, name: true, totalDebt: true },
    });
    if (!customer) throw new NotFoundException('Client introuvable');
    if (customer.totalDebt <= 0) {
      throw new BadRequestException('Ce client n\'a aucune dette en cours');
    }
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }
    const payment = Math.min(amount, customer.totalDebt);

    // Tout dans une transaction pour garantir la cohérence
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedCustomer = await tx.commerceCustomer.update({
        where: { id },
        data: { totalDebt: { decrement: payment } },
        select: { totalDebt: true },
      });

      const oldestPartialSale = await tx.sale.findFirst({
        where: { tenantId, customerId: id, status: 'PARTIAL' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, remainingDebt: true },
      });

      if (oldestPartialSale) {
        const newRemaining = Math.max(oldestPartialSale.remainingDebt - payment, 0);
        await tx.sale.update({
          where: { id: oldestPartialSale.id },
          data: {
            remainingDebt: newRemaining,
            paidAmount: { increment: payment },
            status: newRemaining === 0 ? 'COMPLETED' : 'PARTIAL',
          },
        });
        await tx.salesPayment.create({
          data: {
            tenantId,
            saleId: oldestPartialSale.id,
            amount: payment,
            method: 'CASH',
            notes: `Remboursement dette — ${customer.name}`,
          },
        });
      }

      return updatedCustomer;
    });

    Promise.all([
      this.invalidate(tenantId),
      this.cache.del(`commerce:dashboard:${tenantId}`),
    ]).catch(() => {});

    return {
      customerId: id,
      amountPaid: payment,
      previousDebt: customer.totalDebt,
      remainingDebt: updated.totalDebt,
    };
  }

  async payAllDebt(tenantId: string, id: string) {
    // Requête légère
    const customer = await this.prisma.commerceCustomer.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true, name: true, totalDebt: true },
    });
    if (!customer) throw new NotFoundException('Client introuvable');
    if (customer.totalDebt <= 0) {
      throw new BadRequestException('Ce client n\'a aucune dette en cours');
    }

    const totalDebtAmount = customer.totalDebt;
    const paymentId = `CONSO-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    await this.prisma.$transaction(async (tx) => {
      // 1. Charger toutes les ventes partielles (champs minimaux)
      const partialSales = await tx.sale.findMany({
        where: { tenantId, customerId: id, status: 'PARTIAL' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, remainingDebt: true },
      });

      if (partialSales.length === 0) return;

      // 2. updateMany → 1 seule requête pour solder toutes les ventes
      const saleIds = partialSales.map((s) => s.id);
      await tx.sale.updateMany({
        where: { id: { in: saleIds } },
        data: { remainingDebt: 0, status: 'COMPLETED' },
      });
      // paidAmount doit être incrémenté individuellement → on le fait via updateMany
      // (PostgreSQL ne supporte pas SET paidAmount = paidAmount + remainingDebt par row différemment)
      // On met à jour chaque paidAmount avec un seul appel groupé sans boucle
      for (const sale of partialSales) {
        await tx.sale.update({
          where: { id: sale.id },
          data: { paidAmount: { increment: sale.remainingDebt } },
        });
      }

      // 3. createMany → 1 seule requête pour tous les SalesPayment
      await tx.salesPayment.createMany({
        data: partialSales.map((sale) => ({
          tenantId,
          saleId: sale.id,
          amount: sale.remainingDebt,
          method: 'CASH',
          notes: `Paiement consolidé ${paymentId}`,
        })),
      });

      // 4. Solder le client
      await tx.commerceCustomer.update({
        where: { id },
        data: { totalDebt: 0 },
      });
    });

    this.invalidate(tenantId).catch(() => {});

    return {
      customerId: id,
      customerName: customer.name,
      amountPaid: totalDebtAmount,
      previousDebt: totalDebtAmount,
      remainingDebt: 0,
      type: 'CONSOLIDATED',
      paymentId,
      createdAt: new Date().toISOString(),
    };
  }

  async getPaymentHistory(tenantId: string, id: string) {
    // Vérifier que le client existe
    await this.findOne(tenantId, id);

    // Récupérer les paiements du client via ses ventes
    const payments = await this.prisma.salesPayment.findMany({
      where: {
        tenantId,
        sale: {
          customerId: id,
        },
      },
      include: {
        sale: {
          select: {
            id: true,
            receiptNumber: true,
            totalAmount: true,
            paidAmount: true,
            remainingDebt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return payments;
  }

  async remove(tenantId: string, id: string) {
    const customer = await this.findOne(tenantId, id);
    if (customer.totalDebt > 0) {
      throw new NotFoundException(
        `Ce client a encore ${customer.totalDebt} GNF de dette`,
      );
    }
    await this.prisma.commerceCustomer.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidate(tenantId);
  }
}
