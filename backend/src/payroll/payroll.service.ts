import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PaySalaryDto } from './dto/pay-salary.dto';
import { UpdateSalaryConfigDto } from './dto/update-salary-config.dto';

@Injectable()
export class PayrollService {
  constructor(private prisma: PrismaService) {}

  // ── Résumé du mois — tout le personnel + statut paiement ────────────────────

  async getSummary(tenantId: string, month: string) {
    const { start, end } = this.monthRange(month);

    const [staff, payments] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId, isActive: true, role: { not: 'DIRECTOR' } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          salaryConfig: true,
          hireMonth: true,
        },
        orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
      }),
      this.prisma.expense.findMany({
        where: {
          tenantId,
          category: 'SALARY',
          date: { gte: start, lte: end },
        },
        select: {
          id: true,
          staffId: true,
          staffName: true,
          amount: true,
          method: true,
          date: true,
          note: true,
          reference: true,
        },
      }),
    ]);

    const paymentByStaff = new Map(payments.map((p) => [p.staffId, p]));

    const summary = staff.map((s) => {
      const payment = paymentByStaff.get(s.id) ?? null;
      const config = s.salaryConfig as { amount: number; currency: string } | null;
      return {
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        role: s.role.toLowerCase(),
        phone: s.phone,
        salaryConfig: config,
        hireMonth: s.hireMonth ?? null,
        payment,
        isPaid: !!payment,
      };
    });

    const totalConfigured = summary
      .filter((s) => s.salaryConfig?.amount)
      .reduce((sum, s) => sum + (s.salaryConfig?.amount ?? 0), 0);

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const paidCount = payments.length;
    const totalStaff = staff.length;
    const unconfiguredCount = summary.filter((s) => !s.salaryConfig?.amount).length;

    return {
      month,
      staff: summary,
      stats: {
        totalStaff,
        paidCount,
        unpaidCount: totalStaff - paidCount,
        unconfiguredCount,
        totalConfigured,
        totalPaid,
      },
    };
  }

  // ── Enregistrer un paiement de salaire ──────────────────────────────────────

  async paySalary(tenantId: string, dto: PaySalaryDto, recordedBy: string) {
    const { start, end } = this.monthRange(dto.month);

    // Vérifier que le membre appartient au tenant
    const staff = await this.prisma.user.findFirst({
      where: { id: dto.staffId, tenantId, isActive: true },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
    if (!staff) throw new NotFoundException('Membre introuvable');

    // Anti-doublon — un seul salaire par membre par mois
    const existing = await this.prisma.expense.findFirst({
      where: {
        tenantId,
        category: 'SALARY',
        staffId: dto.staffId,
        date: { gte: start, lte: end },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Le salaire de ${staff.firstName} ${staff.lastName} a déjà été enregistré pour ce mois.`,
      );
    }

    const [year, monthNum] = dto.month.split('-').map(Number);
    const payDate = new Date(year, monthNum - 1, new Date().getDate());

    const staffName = `${staff.firstName} ${staff.lastName}`;
    const [monthName] = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' })
      .format(payDate)
      .split(' ')
      .map((s, i) => (i === 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s));

    return this.prisma.expense.create({
      data: {
        tenantId,
        amount: dto.amount,
        category: 'SALARY',
        description: `Salaire ${staffName} — ${new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(payDate)}`,
        method: dto.method ?? 'CASH',
        date: payDate,
        academicYear: dto.academicYear ?? null,
        note: dto.note ?? null,
        recordedBy,
        staffId: dto.staffId,
        staffName,
      },
    });
  }

  // ── Historique des salaires payés ────────────────────────────────────────────

  async getHistory(
    tenantId: string,
    filters: { staffId?: string; limit?: number; offset?: number },
  ) {
    const where: any = { tenantId, category: 'SALARY' };
    if (filters.staffId) where.staffId = filters.staffId;

    const [data, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      this.prisma.expense.count({ where }),
    ]);

    return { data, total };
  }

  // ── Supprimer un paiement (annulation) ───────────────────────────────────────

  async deletePayment(tenantId: string, expenseId: string) {
    const expense = await this.prisma.expense.findFirst({
      where: { id: expenseId, tenantId, category: 'SALARY' },
    });
    if (!expense) throw new NotFoundException('Paiement introuvable');
    return this.prisma.expense.delete({ where: { id: expenseId } });
  }

  // ── Configurer le salaire d'un membre ────────────────────────────────────────

  async updateSalaryConfig(
    tenantId: string,
    memberId: string,
    dto: UpdateSalaryConfigDto,
  ) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, tenantId },
    });
    if (!member) throw new NotFoundException('Membre introuvable');

    return this.prisma.user.update({
      where: { id: memberId },
      data: {
        salaryConfig: { amount: dto.amount, currency: dto.currency ?? 'GNF' },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        salaryConfig: true,
      },
    });
  }

  // ── Helper : plage de dates d'un mois ────────────────────────────────────────

  private monthRange(month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    return {
      start: new Date(year, monthNum - 1, 1),
      end: new Date(year, monthNum, 0, 23, 59, 59, 999),
    };
  }
}
