import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

// ─── Constantes calendrier (miroir du frontend) ──────────────────────────────

const ALL_MONTHS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
] as const;

@Injectable()
export class PaymentsService {
    constructor(private prisma: PrismaService) { }

    // ─── Helpers calendrier (privés) ─────────────────────────────────────────

    /**
     * Retourne les N mois scolaires avec leur année (ex: "Octobre 2025")
     * en respectant le calendrier configuré pour l'année scolaire.
     */
    private getSchoolMonthsForYear(
        academicYear: string,
        startMonth: string,
        durationMonths: number,
    ): string[] {
        const startYear = parseInt(academicYear.split('-')[0] ?? String(new Date().getFullYear()), 10);
        const startIdx = ALL_MONTHS_FR.indexOf(startMonth as typeof ALL_MONTHS_FR[number]);
        if (startIdx === -1) return [];
        return Array.from({ length: Math.min(durationMonths, 12) }, (_, i) => {
            const monthIdx = (startIdx + i) % 12;
            const yearOffset = Math.floor((startIdx + i) / 12);
            return `${ALL_MONTHS_FR[monthIdx]} ${startYear + yearOffset}`;
        });
    }

    /**
     * Découpe les mois scolaires en 3 trimestres équilibrés.
     * Même algorithme que le frontend.
     */
    private getTrimestreGroups(
        schoolMonths: string[],
    ): { trimestre: string; months: string[] }[] {
        const n = schoolMonths.length;
        const t1e = Math.ceil(n / 3);
        const t2e = Math.ceil((n - t1e) / 2);
        return [
            { trimestre: 'Trimestre 1', months: schoolMonths.slice(0, t1e) },
            { trimestre: 'Trimestre 2', months: schoolMonths.slice(t1e, t1e + t2e) },
            { trimestre: 'Trimestre 3', months: schoolMonths.slice(t1e + t2e) },
        ].filter((g) => g.months.length > 0);
    }

    /**
     * Expand un terme de paiement en liste de mois avec année.
     * Gère : mois unique, CSV, Trimestre X, Annuel X-Y.
     * Normalise aussi les anciens termes sans année ("Février" → "Février 2026")
     * pour éviter que ces termes contournent silencieusement la validation séquentielle.
     */
    private expandTermToMonths(
        term: string,
        schoolMonths: string[],
        trimestreGroups: { trimestre: string; months: string[] }[],
    ): string[] {
        if (!term) return [];
        if (term.startsWith('Annuel')) return [...schoolMonths];
        if (term.startsWith('Trimestre')) {
            return trimestreGroups.find((g) => g.trimestre === term)?.months ?? [];
        }
        if (term.includes(',')) {
            return term.split(',').map((s) => {
                const raw = s.trim();
                // Normaliser "Février" → "Février 2026" si le terme est sans année
                const qualified = schoolMonths.find((m) => m.split(' ')[0] === raw);
                return qualified ?? raw;
            });
        }
        // Mois unique : si le terme n'a pas d'année ("Février"), le qualifier avec l'année scolaire
        const qualified = schoolMonths.find((m) => m.split(' ')[0] === term.trim());
        return [qualified ?? term];
    }

    /**
     * Valide la séquentialité d'un nouveau paiement :
     *  1. Aucun des mois du terme n'est déjà payé (anti-doublon strict)
     *  2. Aucun mois scolaire antérieur n'est impayé (anti-saut)
     *
     * Lance ConflictException avec un message explicite en cas d'erreur.
     */
    private async validatePaymentSequence(
        tenantId: string,
        studentId: string,
        academicYear: string,
        term: string,
    ): Promise<void> {
        // 1. Récupérer le calendrier scolaire depuis la BDD
        const academicYearRecord = await this.prisma.academicYear.findFirst({
            where: { tenantId, name: academicYear },
            select: { startMonth: true, durationMonths: true },
        });

        const startMonth = academicYearRecord?.startMonth ?? 'Septembre';
        const durationMonths = academicYearRecord?.durationMonths ?? 9;

        const schoolMonths = this.getSchoolMonthsForYear(academicYear, startMonth, durationMonths);
        const trimestreGroups = this.getTrimestreGroups(schoolMonths);

        // 2. Expand le terme entrant en liste de mois
        const incomingMonths = this.expandTermToMonths(term, schoolMonths, trimestreGroups);

        // Mois hors calendrier scolaire (HC) → pas de règle séquentielle
        const incomingSchoolMonths = incomingMonths.filter((m) => schoolMonths.includes(m));
        if (incomingSchoolMonths.length === 0) return;

        // 3. Récupérer tous les paiements paid ET partial de l'élève pour cette année
        const existingPayments = await this.prisma.payment.findMany({
            where: {
                tenantId,
                studentId,
                academicYear,
                status: { in: ['paid', 'partial'] },
            },
            select: { term: true, status: true },
        });

        // 4a. Mois entièrement payés (status=paid) → bloquent tout nouveau paiement
        const fullyPaidMonths = new Set<string>();
        // 4b. Mois partiellement payés (status=partial) → autorisent un complément
        const partialMonths = new Set<string>();
        for (const p of existingPayments) {
            if (!p.term) continue;
            const months = this.expandTermToMonths(p.term, schoolMonths, trimestreGroups);
            if (p.status === 'paid') {
                months.forEach((m) => fullyPaidMonths.add(m));
            } else {
                months.forEach((m) => partialMonths.add(m));
            }
        }
        // Pour l'anti-saut, un mois est "couvert" s'il est paid OU partial
        const paidMonths = new Set<string>([...fullyPaidMonths, ...partialMonths]);

        // 5. Anti-doublon : bloquer uniquement les mois entièrement payés (pas les partiels)
        const alreadyPaid = incomingSchoolMonths.filter((m) => fullyPaidMonths.has(m));
        if (alreadyPaid.length > 0) {
            throw new ConflictException(
                `Paiement déjà enregistré pour : ${alreadyPaid.join(', ')}`,
            );
        }

        // 6. Anti-saut : tous les mois scolaires antérieurs au premier mois entrant doivent être couverts
        const firstIncomingIdx = schoolMonths.findIndex((m) => incomingSchoolMonths.includes(m));
        if (firstIncomingIdx > 0) {
            const gapMonths = schoolMonths
                .slice(0, firstIncomingIdx)
                .filter((m) => !paidMonths.has(m));

            if (gapMonths.length > 0) {
                throw new ConflictException(
                    `Impossible de payer ce mois sans avoir d'abord réglé : ${gapMonths.join(', ')}`,
                );
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Génère le prochain numéro de reçu disponible pour l'année en cours.
     * Cherche le dernier numéro existant (toutes tenants confondus) et incrémente.
     * Garantit la séquentialité même après suppression de paiements.
     */
    private async generateReceiptNumber(): Promise<string> {
        const year = new Date().getFullYear();
        const prefix = `REC-${year}-`;
        const last = await this.prisma.payment.findFirst({
            where: { receiptNumber: { startsWith: prefix } },
            orderBy: { receiptNumber: 'desc' },
            select: { receiptNumber: true },
        });
        let seq = 1;
        if (last?.receiptNumber) {
            const parsed = parseInt(last.receiptNumber.replace(prefix, ''), 10);
            if (!isNaN(parsed)) seq = parsed + 1;
        }
        return `${prefix}${String(seq).padStart(6, '0')}`;
    }

    /**
     * Crée un paiement avec un numéro de reçu pré-généré.
     * En cas de collision sur le champ unique (race-condition rare), régénère et réessaie.
     * Le hint permet d'éviter une requête DB supplémentaire au premier appel.
     */
    private async createPaymentWithUniqueReceipt(data: any, receiptHint?: string) {
        const MAX_ATTEMPTS = 5;
        let lastError: any;

        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            // 1er essai : utiliser le numéro pré-généré en parallèle avec la validation
            const receiptNumber = (attempt === 0 && receiptHint)
                ? receiptHint
                : await this.generateReceiptNumber();
            try {
                return await this.prisma.payment.create({
                    data: { ...data, receiptNumber },
                    include: { student: true },
                });
            } catch (err: any) {
                // P2002 = Unique constraint violation → on réessaie avec le numéro suivant
                if (err?.code === 'P2002' && err?.meta?.target?.includes('receiptNumber')) {
                    lastError = err;
                    continue;
                }
                throw err;
            }
        }

        throw lastError;
    }

    // ─────────────────────────────────────────────────────────────────────────

    async create(tenantId: string, createPaymentDto: CreatePaymentDto) {
        const paymentData = {
            amount: createPaymentDto.amount,
            currency: createPaymentDto.currency || 'GNF',
            method: createPaymentDto.method as any,
            status: createPaymentDto.status || 'paid',
            studentId: createPaymentDto.studentId,
            description: createPaymentDto.description,
            dueDate: createPaymentDto.dueDate ? new Date(createPaymentDto.dueDate) : undefined,
            paidDate: createPaymentDto.paidDate ? new Date(createPaymentDto.paidDate) : new Date(),
            academicYear: createPaymentDto.academicYear,
            term: createPaymentDto.term,
            tenantId,
        };

        // Validation anti-doublon/anti-saut + génération numéro reçu en parallèle :
        // ces deux opérations sont read-only et indépendantes → gain ~200-400ms
        const [receiptNumber] = await Promise.all([
            this.generateReceiptNumber(),
            createPaymentDto.academicYear && createPaymentDto.term
                ? this.validatePaymentSequence(
                      tenantId,
                      createPaymentDto.studentId,
                      createPaymentDto.academicYear,
                      createPaymentDto.term,
                  )
                : Promise.resolve(),
        ]);

        // Créer le paiement avec le numéro pré-généré (retry sur collision)
        const payment = await this.createPaymentWithUniqueReceipt(paymentData, receiptNumber);

        // Mettre à jour automatiquement le statut de paiement de l'élève
        const paymentStatus = (createPaymentDto.status || 'paid').toUpperCase();
        if (paymentStatus === 'PAID' || paymentStatus === 'PARTIAL') {
            await this.prisma.student.update({
                where: { id: createPaymentDto.studentId },
                data: { paymentStatus: PaymentStatus.PAID },
            });
        }

        return payment;
    }

    async findAll(
        tenantId: string,
        filters?: {
            status?: string;
            studentId?: string;
            method?: string;
            startDate?: string;
            endDate?: string;
            academicYear?: string;
            term?: string;
            // Pagination — limit: max résultats (défaut 500, max 5000 pour export)
            limit?: string | number;
            skip?: string | number;
        },
    ) {
        // Sécurité anti-OOM : jamais plus de 5000 enregistrements d'un coup
        const take = Math.min(Number(filters?.limit) || 500, 5000);
        const skip = Number(filters?.skip) || 0;

        const where: any = { tenantId };

        if (filters?.status)       where.status       = filters.status;
        if (filters?.studentId)    where.studentId    = filters.studentId;
        if (filters?.method)       where.method       = filters.method;
        if (filters?.academicYear) where.academicYear = filters.academicYear;
        if (filters?.term)         where.term         = filters.term;

        if (filters?.startDate && filters?.endDate) {
            where.paidDate = {
                gte: new Date(filters.startDate),
                lte: new Date(filters.endDate),
            };
        }

        return this.prisma.payment.findMany({
            where,
            take,
            skip,
            include: { student: true },
            orderBy: { paidDate: 'desc' },
        });
    }

    async findOne(tenantId: string, id: string) {
        const payment = await this.prisma.payment.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                student: {
                    include: {
                        class: true,
                    },
                },
            },
        });

        if (!payment) {
            throw new NotFoundException('Paiement non trouvé');
        }

        return payment;
    }

    async update(tenantId: string, id: string, updatePaymentDto: UpdatePaymentDto) {
        // Vérifier que le paiement appartient au tenant
        const existing = await this.findOne(tenantId, id);

        const data: any = { ...updatePaymentDto };
        if (updatePaymentDto.paidDate) {
            data.paidDate = new Date(updatePaymentDto.paidDate);
        }
        if (updatePaymentDto.dueDate) {
            data.dueDate = new Date(updatePaymentDto.dueDate);
        }

        const payment = await this.prisma.payment.update({
            where: { id },
            data,
            include: {
                student: true,
            },
        });

        // Mettre à jour automatiquement le statut de paiement de l'élève
        if (updatePaymentDto.status) {
            const newStatus = updatePaymentDto.status.toUpperCase();
            if (newStatus === 'PAID' || newStatus === 'PARTIAL') {
                await this.prisma.student.update({
                    where: { id: existing.studentId },
                    data: { paymentStatus: PaymentStatus.PAID },
                });
            } else if (newStatus === 'PENDING' || newStatus === 'OVERDUE') {
                // Vérifier s'il reste d'autres paiements réussis pour cet élève
                const otherPaidPayments = await this.prisma.payment.count({
                    where: {
                        tenantId,
                        studentId: existing.studentId,
                        id: { not: id },
                        status: { in: ['paid', 'partial'] },
                    },
                });
                if (otherPaidPayments === 0) {
                    await this.prisma.student.update({
                        where: { id: existing.studentId },
                        data: { paymentStatus: PaymentStatus.PENDING },
                    });
                }
            }
        }

        return payment;
    }

    async remove(tenantId: string, id: string) {
        // Vérifier que le paiement appartient au tenant
        await this.findOne(tenantId, id);

        return this.prisma.payment.delete({
            where: { id },
        });
    }

    async getStats(tenantId: string, filters?: { academicYear?: string; term?: string }) {
        const where: any = { tenantId };

        if (filters?.academicYear) {
            where.academicYear = filters.academicYear;
        }

        if (filters?.term) {
            where.term = filters.term;
        }

        // Toutes les requêtes en parallèle — 7 aller-retours DB → 1 round-trip concurrent
        const [
            totalPayments,
            paidPayments,
            pendingPayments,
            overduePayments,
            totalCollected,
            totalPending,
            byMethod,
        ] = await Promise.all([
            this.prisma.payment.count({ where }),
            this.prisma.payment.count({ where: { ...where, status: 'paid' } }),
            this.prisma.payment.count({ where: { ...where, status: 'pending' } }),
            this.prisma.payment.count({ where: { ...where, status: 'overdue' } }),
            this.prisma.payment.aggregate({
                where: { ...where, status: 'paid' },
                _sum: { amount: true },
            }),
            this.prisma.payment.aggregate({
                where: { ...where, status: { in: ['pending', 'overdue'] } },
                _sum: { amount: true },
            }),
            this.prisma.payment.groupBy({
                by: ['method'],
                where: { ...where, status: 'paid' },
                _sum: { amount: true },
                _count: true,
            }),
        ]);

        return {
            totalPayments,
            paidPayments,
            pendingPayments,
            overduePayments,
            totalCollected: totalCollected._sum.amount || 0,
            totalPending: totalPending._sum.amount || 0,
            byMethod,
        };
    }

    async getByStudent(tenantId: string, studentId: string) {
        return this.prisma.payment.findMany({
            where: {
                tenantId,
                studentId,
            },
            orderBy: {
                paidDate: 'desc',
            },
        });
    }

    async getReceipt(tenantId: string, id: string) {
        const payment = await this.findOne(tenantId, id);

        // Retourner les données formatées pour le reçu
        return {
            receiptNumber: payment.receiptNumber,
            date: payment.paidDate,
            student: {
                name: `${payment.student.firstName} ${payment.student.lastName}`,
                matricule: payment.student.matricule,
                class: payment.student.class?.name,
            },
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            description: payment.description,
            academicYear: payment.academicYear,
            term: payment.term,
        };
    }
}
