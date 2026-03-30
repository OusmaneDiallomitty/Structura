import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

const TTL = 120;

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

  async findAll(tenantId: string, search?: string) {
    if (!search) {
      const cached = await this.cache.get<any[]>(this.listKey(tenantId));
      if (cached) return cached;
    }

    const customers = await this.prisma.commerceCustomer.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(search && { name: { contains: search, mode: 'insensitive' } }),
      },
      orderBy: { name: 'asc' },
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
    const customer = await this.findOne(tenantId, id);
    if (customer.totalDebt <= 0) {
      throw new BadRequestException('Ce client n\'a aucune dette en cours');
    }
    if (amount <= 0) {
      throw new BadRequestException('Le montant doit être supérieur à 0');
    }
    const payment = Math.min(amount, customer.totalDebt);
    const updated = await this.prisma.commerceCustomer.update({
      where: { id },
      data: { totalDebt: { decrement: payment } },
    });
    // Mettre à jour la vente la plus ancienne avec dette restante
    const oldestPartialSale = await this.prisma.sale.findFirst({
      where: { tenantId, customerId: id, status: 'PARTIAL' },
      orderBy: { createdAt: 'asc' },
    });
    if (oldestPartialSale) {
      const newRemaining = Math.max(
        oldestPartialSale.remainingDebt - payment,
        0,
      );
      await this.prisma.sale.update({
        where: { id: oldestPartialSale.id },
        data: {
          remainingDebt: newRemaining,
          paidAmount: { increment: payment },
          status: newRemaining === 0 ? 'COMPLETED' : 'PARTIAL',
        },
      });
    }
    await this.invalidate(tenantId);
    return {
      customerId: id,
      amountPaid: payment,
      previousDebt: customer.totalDebt,
      remainingDebt: updated.totalDebt,
    };
  }

  async payAllDebt(tenantId: string, id: string) {
    const customer = await this.findOne(tenantId, id);
    if (customer.totalDebt <= 0) {
      throw new BadRequestException('Ce client n\'a aucune dette en cours');
    }

    const totalDebtAmount = customer.totalDebt;
    const paymentId = `CONSO-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    let paidSales: any[] = [];

    await this.prisma.$transaction(async (tx) => {
      // Récupérer toutes les ventes partielles du client
      const partialSales = await tx.sale.findMany({
        where: { tenantId, customerId: id, status: 'PARTIAL' },
        orderBy: { createdAt: 'asc' },
        include: {
          items: {
            include: { product: { select: { id: true, name: true, unit: true } } },
          },
        },
      });

      // Payer chaque vente
      let remainingAmount = totalDebtAmount;
      for (const sale of partialSales) {
        const payAmount = Math.min(remainingAmount, sale.remainingDebt);
        if (payAmount > 0) {
          const updated = await tx.sale.update({
            where: { id: sale.id },
            data: {
              remainingDebt: Math.max(0, sale.remainingDebt - payAmount),
              paidAmount: { increment: payAmount },
              status: sale.remainingDebt - payAmount === 0 ? 'COMPLETED' : 'PARTIAL',
            },
            include: {
              items: {
                include: { product: { select: { id: true, name: true, unit: true } } },
              },
            },
          });

          // Enregistrer le paiement
          await tx.salesPayment.create({
            data: {
              tenantId,
              saleId: sale.id,
              amount: payAmount,
              method: 'CASH',
              notes: `Paiement consolidé ${paymentId}`,
            },
          });

          paidSales.push({ ...updated, amountPaid: payAmount });
          remainingAmount -= payAmount;
        }
      }

      // Mettre à jour la dette du client
      await tx.commerceCustomer.update({
        where: { id },
        data: { totalDebt: 0 },
      });
    });

    await this.invalidate(tenantId);
    return {
      customerId: id,
      customerName: customer.name,
      amountPaid: totalDebtAmount,
      previousDebt: customer.totalDebt,
      remainingDebt: 0,
      type: 'CONSOLIDATED',
      paymentId,
      paidSales,
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
