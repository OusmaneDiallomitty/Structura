import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

@Injectable()
export class ExpensesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateExpenseDto, recordedBy?: string) {
    return this.prisma.expense.create({
      data: {
        tenantId,
        amount:       dto.amount,
        category:     dto.category,
        description:  dto.description,
        method:       dto.method ?? 'CASH',
        date:         new Date(dto.date),
        academicYear: dto.academicYear ?? null,
        reference:    dto.reference   ?? null,
        note:         dto.note        ?? null,
        recordedBy:   recordedBy      ?? null,
      },
    });
  }

  async findAll(
    tenantId: string,
    filters: {
      academicYear?: string;
      category?:     string;
      from?:         string;
      to?:           string;
    } = {},
  ) {
    const where: Record<string, unknown> = { tenantId };

    if (filters.academicYear) where.academicYear = filters.academicYear;
    if (filters.category)     where.category     = filters.category;

    if (filters.from || filters.to) {
      where.date = {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to   ? { lte: new Date(filters.to)   } : {}),
      };
    }

    return this.prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async findOne(tenantId: string, id: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id, tenantId },
    });
    if (!expense) throw new NotFoundException('Dépense introuvable');
    return expense;
  }

  async update(tenantId: string, id: string, dto: UpdateExpenseDto) {
    await this.findOne(tenantId, id); // vérifie existence + appartenance tenant
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.amount      !== undefined ? { amount:      dto.amount                } : {}),
        ...(dto.category    !== undefined ? { category:    dto.category              } : {}),
        ...(dto.description !== undefined ? { description: dto.description           } : {}),
        ...(dto.method      !== undefined ? { method:      dto.method                } : {}),
        ...(dto.date        !== undefined ? { date:        new Date(dto.date)        } : {}),
        ...(dto.academicYear !== undefined ? { academicYear: dto.academicYear        } : {}),
        ...(dto.reference   !== undefined ? { reference:   dto.reference            } : {}),
        ...(dto.note        !== undefined ? { note:        dto.note                 } : {}),
      },
    });
  }

  async remove(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.prisma.expense.delete({ where: { id } });
  }

  /**
   * Statistiques agrégées par catégorie pour une année scolaire.
   * Utilisé pour le dashboard et le widget solde net.
   */
  async getStats(tenantId: string, academicYear?: string) {
    const where: Record<string, unknown> = { tenantId };
    if (academicYear) where.academicYear = academicYear;

    const expenses = await this.prisma.expense.findMany({
      where,
      select: { amount: true, category: true, date: true },
    });

    const totalAmount = expenses.reduce((s, e) => s + e.amount, 0);

    // Agrégation par catégorie
    const byCategory: Record<string, number> = {};
    for (const e of expenses) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amount;
    }

    // Agrégation par mois (YYYY-MM)
    const byMonth: Record<string, number> = {};
    for (const e of expenses) {
      const key = e.date.toISOString().slice(0, 7); // "2026-01"
      byMonth[key] = (byMonth[key] ?? 0) + e.amount;
    }

    return { totalAmount, count: expenses.length, byCategory, byMonth };
  }
}
