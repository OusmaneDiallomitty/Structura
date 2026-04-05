import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';
import { UpsertSessionDto } from './dto/upsert-session.dto';

@Injectable()
export class CaisseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  private dayKey(tenantId: string, date: string) {
    return `commerce:caisse:day:${tenantId}:${date}`;
  }

  private historyKey(tenantId: string) {
    return `commerce:caisse:history:${tenantId}`;
  }

  /** Normalise une date YYYY-MM-DD en DateTime minuit UTC */
  private toDay(dateStr: string): Date {
    const d = new Date(dateStr + 'T00:00:00.000Z');
    return d;
  }

  private toNextDay(dateStr: string): Date {
    const d = new Date(dateStr + 'T00:00:00.000Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  /**
   * Toutes les entrées et sorties de caisse d'une journée.
   * Entrées  : ventes encaissées + récupération dettes clients
   * Sorties  : dépenses + paiements fournisseurs
   * Solde clôture = solde ouverture + entrées - sorties
   */
  async getDay(tenantId: string, dateStr?: string) {
    const date = dateStr ?? new Date().toISOString().slice(0, 10);
    const cacheKey = this.dayKey(tenantId, date);
    const isToday = date === new Date().toISOString().slice(0, 10);

    // Ne pas mettre en cache le jour en cours (données en temps réel)
    if (!isToday) {
      const cached = await this.cache.get<any>(cacheKey);
      if (cached) return cached;
    }

    const gte = this.toDay(date);
    const lt  = this.toNextDay(date);

    const [session, sales, debtRecoveries, expenses, supplierPayments] = await Promise.all([
      // Solde d'ouverture
      this.prisma.cashSession.findUnique({
        where: { tenantId_date: { tenantId, date: gte } },
      }),
      // Ventes encaissées (par méthode)
      this.prisma.sale.findMany({
        where: { tenantId, status: { not: 'CANCELLED' }, createdAt: { gte, lt } },
        select: {
          id: true, receiptNumber: true, totalAmount: true, paidAmount: true,
          remainingDebt: true, paymentMethod: true, createdAt: true,
          customer: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Récupération de dettes clients
      this.prisma.salesPayment.findMany({
        where: { tenantId, createdAt: { gte, lt } },
        include: {
          sale: { select: { receiptNumber: true, customer: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Dépenses
      this.prisma.commerceExpense.findMany({
        where: { tenantId, date: { gte, lt } },
        orderBy: { date: 'asc' },
      }),
      // Paiements fournisseurs
      this.prisma.supplierPayment.findMany({
        where: { tenantId, createdAt: { gte, lt } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    const openingBalance = session?.openingBalance ?? 0;

    // ─── Calcul entrées ───────────────────────────────────────────────────────
    // Uniquement les ventes réellement encaissées (paidAmount > 0, pas crédit pur)
    const salesCash = sales.filter((s) => s.paidAmount > 0);
    const totalSalesCash = salesCash.reduce((s, v) => s + v.paidAmount, 0);
    const totalDebtRecovered = debtRecoveries.reduce((s, p) => s + p.amount, 0);
    const totalIn = totalSalesCash + totalDebtRecovered;

    // ─── Calcul sorties ───────────────────────────────────────────────────────
    const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
    const totalSupplierPaid = supplierPayments.reduce((s, p) => s + p.amount, 0);
    const totalOut = totalExpenses + totalSupplierPaid;

    // ─── Soldes ───────────────────────────────────────────────────────────────
    const closingBalance = openingBalance + totalIn - totalOut;

    // ─── Répartition par méthode ──────────────────────────────────────────────
    const byMethod: Record<string, { in: number; out: number }> = {};
    for (const s of salesCash) {
      const m = s.paymentMethod;
      if (!byMethod[m]) byMethod[m] = { in: 0, out: 0 };
      byMethod[m].in += s.paidAmount;
    }
    for (const p of debtRecoveries as any[]) {
      const m = p.method ?? 'CASH';
      if (!byMethod[m]) byMethod[m] = { in: 0, out: 0 };
      byMethod[m].in += p.amount;
    }
    for (const e of expenses) {
      const m = 'CASH';
      if (!byMethod[m]) byMethod[m] = { in: 0, out: 0 };
      byMethod[m].out += e.amount;
    }
    for (const p of supplierPayments) {
      const m = p.paymentMethod;
      if (!byMethod[m]) byMethod[m] = { in: 0, out: 0 };
      byMethod[m].out += p.amount;
    }

    // ─── Mouvements unifiés pour l'affichage ─────────────────────────────────
    const movements: any[] = [
      ...salesCash.map((s) => ({
        type: 'IN',
        category: 'SALE',
        amount: s.paidAmount,
        method: s.paymentMethod,
        label: `Vente ${s.receiptNumber}`,
        sub: s.customer?.name ?? 'Client anonyme',
        at: s.createdAt,
        id: s.id,
      })),
      ...debtRecoveries.map((p: any) => ({
        type: 'IN',
        category: 'DEBT_RECOVERY',
        amount: p.amount,
        method: p.method ?? 'CASH',
        label: `Recouvrement — ${p.sale?.receiptNumber ?? ''}`,
        sub: p.sale?.customer?.name ?? '',
        at: p.createdAt,
        id: p.id,
      })),
      ...expenses.map((e) => ({
        type: 'OUT',
        category: 'EXPENSE',
        amount: e.amount,
        method: 'CASH',
        label: e.description ?? e.category,
        sub: e.category,
        at: e.date,
        id: e.id,
      })),
      ...supplierPayments.map((p) => ({
        type: 'OUT',
        category: 'SUPPLIER_PAYMENT',
        amount: p.amount,
        method: p.paymentMethod,
        label: `Paiement fournisseur — ${p.supplierName}`,
        sub: p.notes ?? '',
        at: p.createdAt,
        id: p.id,
      })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

    const result = {
      date,
      session: { id: session?.id ?? null, notes: session?.notes ?? null },
      openingBalance,
      totalIn,
      totalOut,
      closingBalance,
      breakdown: {
        salesCash: totalSalesCash,
        debtRecovered: totalDebtRecovered,
        expenses: totalExpenses,
        supplierPayments: totalSupplierPaid,
      },
      byMethod,
      movements,
      counts: {
        sales: salesCash.length,
        debtRecoveries: debtRecoveries.length,
        expenses: expenses.length,
        supplierPayments: supplierPayments.length,
      },
    };

    if (!isToday) await this.cache.set(cacheKey, result, 300);
    return result;
  }

  /**
   * Créer ou mettre à jour le solde d'ouverture d'une journée
   */
  async upsertSession(tenantId: string, dto: UpsertSessionDto) {
    const date = this.toDay(dto.date);
    const session = await this.prisma.cashSession.upsert({
      where: { tenantId_date: { tenantId, date } },
      update: { openingBalance: dto.openingBalance, notes: dto.notes ?? null },
      create: { tenantId, date, openingBalance: dto.openingBalance, notes: dto.notes ?? null },
    });
    // Invalider le cache du jour
    await this.cache.del(this.dayKey(tenantId, dto.date));
    await this.cache.del(this.historyKey(tenantId));
    return session;
  }

  /**
   * Historique des soldes de clôture sur N jours — pour le graphique
   */
  async getHistory(tenantId: string, days = 30) {
    const rows: { date: string; openingBalance: number; totalIn: number; totalOut: number; closingBalance: number }[] = [];

    // On génère toutes les dates de la période
    const today = new Date().toISOString().slice(0, 10);
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10));
    }

    // Batch: on charge toutes les données en une seule passe
    const since = this.toDay(dates[0]);
    const until = this.toNextDay(today);

    const [sessions, allSales, allDebtRecoveries, allExpenses, allSupplierPayments] = await Promise.all([
      this.prisma.cashSession.findMany({ where: { tenantId, date: { gte: since, lt: until } } }),
      this.prisma.$queryRaw<any[]>`
        SELECT DATE("createdAt" AT TIME ZONE 'UTC') as day, SUM("paidAmount") as total_in
        FROM sales WHERE "tenantId" = ${tenantId} AND status != 'CANCELLED' AND "createdAt" >= ${since} AND "createdAt" < ${until}
        AND "paidAmount" > 0 GROUP BY day`,
      this.prisma.$queryRaw<any[]>`
        SELECT DATE("createdAt" AT TIME ZONE 'UTC') as day, SUM(amount) as total
        FROM sales_payments WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since} AND "createdAt" < ${until}
        GROUP BY day`,
      this.prisma.$queryRaw<any[]>`
        SELECT DATE(date AT TIME ZONE 'UTC') as day, SUM(amount) as total
        FROM commerce_expenses WHERE "tenantId" = ${tenantId} AND date >= ${since} AND date < ${until}
        GROUP BY day`,
      this.prisma.$queryRaw<any[]>`
        SELECT DATE("createdAt" AT TIME ZONE 'UTC') as day, SUM(amount) as total
        FROM supplier_payments WHERE "tenantId" = ${tenantId} AND "createdAt" >= ${since} AND "createdAt" < ${until}
        GROUP BY day`,
    ]);

    const sessionMap  = new Map(sessions.map((s) => [s.date.toISOString().slice(0, 10), s.openingBalance]));
    const salesMap    = new Map(allSales.map((r) => [String(r.day).slice(0, 10), Number(r.total_in)]));
    const debtMap     = new Map(allDebtRecoveries.map((r) => [String(r.day).slice(0, 10), Number(r.total)]));
    const expMap      = new Map(allExpenses.map((r) => [String(r.day).slice(0, 10), Number(r.total)]));
    const suppMap     = new Map(allSupplierPayments.map((r) => [String(r.day).slice(0, 10), Number(r.total)]));

    for (const d of dates) {
      const opening  = sessionMap.get(d) ?? 0;
      const totalIn  = (salesMap.get(d) ?? 0) + (debtMap.get(d) ?? 0);
      const totalOut = (expMap.get(d) ?? 0) + (suppMap.get(d) ?? 0);
      rows.push({ date: d, openingBalance: opening, totalIn, totalOut, closingBalance: opening + totalIn - totalOut });
    }

    return rows;
  }
}
