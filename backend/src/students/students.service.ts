import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StudentStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, createStudentDto: CreateStudentDto) {
    const currentYear = new Date().getFullYear();
    const prefix = `STU-${currentYear}-`;

    // Génération atomique du matricule via COUNT — résistant aux race conditions
    // COUNT donne le bon prochain numéro même avec plusieurs créations simultanées
    const count = await this.prisma.student.count({
      where: { tenantId, matricule: { startsWith: prefix } },
    });

    const buildData = (matricule: string) => {
      const data: any = { ...createStudentDto, matricule, tenantId };
      if (createStudentDto.dateOfBirth) data.dateOfBirth = new Date(createStudentDto.dateOfBirth);
      return data;
    };

    // Tentative d'insertion avec retry automatique sur conflit de matricule
    let attempt = count + 1;
    while (attempt <= count + 50) {
      const matricule = `${prefix}${String(attempt).padStart(5, '0')}`;
      try {
        return await this.prisma.student.create({
          data: buildData(matricule),
          include: { class: true },
        });
      } catch (err) {
        // Conflict sur l'unicité (matricule pris par une autre requête simultanée) → réessayer
        if ((err as any)?.code === 'P2002') {
          attempt++;
          continue;
        }
        throw err;
      }
    }

    throw new Error('Impossible de générer un matricule unique après plusieurs tentatives');
  }

  async findAll(
    tenantId: string,
    filters?: {
      status?: string;
      classId?: string;
      search?: string;
      academicYear?: string;
      // Pagination — limit: max résultats (défaut 500, max 5000 pour export)
      limit?: string | number;
      skip?: string | number;
    },
    currentUser?: { role: string; assignedClassIds?: string[] },
  ) {
    // Pagination : 100 par défaut, max 5000 (pour les exports complets)
    const take = Math.min(Number(filters?.limit) || 100, 5000);
    const skip = Number(filters?.skip) || 0;

    const where: any = { tenantId };

    if (filters?.status) {
      where.status = filters.status;
    }

    // Restriction TEACHER : seuls les élèves des classes assignées sont visibles
    // req.user.assignedClassIds est déjà calculé par JwtStrategy depuis taughtClasses
    if (currentUser?.role === 'TEACHER') {
      const assignedClassIds: string[] = Array.isArray(currentUser.assignedClassIds)
        ? (currentUser.assignedClassIds as string[]).filter(Boolean)
        : [];

      if (assignedClassIds.length === 0) {
        // Aucune classe assignée → aucun élève visible
        return [];
      }

      if (filters?.classId) {
        // Le prof tente de filtrer sur une classe : vérifier qu'elle lui est assignée
        where.classId = assignedClassIds.includes(filters.classId)
          ? filters.classId
          : null; // null → résultat vide (aucun student.classId ne vaut null)
      } else {
        where.classId = { in: assignedClassIds };
      }
    } else {
      if (filters?.classId) {
        where.classId = filters.classId;
      }
    }

    if (filters?.academicYear) {
      where.class = { academicYear: filters.academicYear };
    }

    if (filters?.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName:  { contains: filters.search, mode: 'insensitive' } },
        { matricule: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Count + findMany en parallèle — évite 2 requêtes séquentielles
    const [total, students] = await Promise.all([
      this.prisma.student.count({ where }),
      this.prisma.student.findMany({
        where,
        take,
        skip,
        include: {
          class: true,
          payments: {
            where: { status: { in: ['paid', 'partial'] } },
            take: 1,
            select: { id: true, term: true, academicYear: true, paidDate: true },
            orderBy: { paidDate: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const data = students.map(({ payments: paidPayments, ...student }) => ({
      ...student,
      paymentStatus: paidPayments.length > 0 ? PaymentStatus.PAID : student.paymentStatus,
      lastPaidTerm: paidPayments[0]?.term || null,
      lastPaidDate: paidPayments[0]?.paidDate || null,
    }));

    return { data, total, page: Math.floor(skip / take) + 1, limit: take };
  }

  async findOne(tenantId: string, id: string) {
    const student = await this.prisma.student.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        class: true,
        attendances: {
          orderBy: { date: 'desc' },
          // Pas de take : on retourne tout l'historique de présences (365 jours max/an)
        },
        payments: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!student) {
      throw new NotFoundException('Élève non trouvé');
    }

    // Recalculer le paymentStatus à partir des vrais paiements (corrige les données obsolètes)
    const hasPaidPayment = student.payments.some(
      (p) => p.status === 'paid' || p.status === 'partial',
    );
    const lastPaidPayment = student.payments.find(
      (p) => p.status === 'paid' || p.status === 'partial',
    );

    return {
      ...student,
      paymentStatus: hasPaidPayment ? PaymentStatus.PAID : student.paymentStatus,
      lastPaidTerm: lastPaidPayment?.term || null,
      lastPaidDate: lastPaidPayment?.paidDate || null,
    };
  }

  async update(tenantId: string, id: string, updateStudentDto: UpdateStudentDto) {
    // Vérifier que l'élève appartient au tenant
    await this.findOne(tenantId, id);

    // Adapter les types du DTO vers les enums Prisma
    const data: Prisma.StudentUpdateInput = {
      ...(updateStudentDto as unknown as Prisma.StudentUpdateInput),
    };

    if (updateStudentDto.status) {
      data.status = updateStudentDto.status as StudentStatus;
    }

    if (updateStudentDto.paymentStatus) {
      data.paymentStatus = updateStudentDto.paymentStatus as PaymentStatus;
    }

    // Convertir dateOfBirth string en Date si présent
    if (updateStudentDto.dateOfBirth) {
      data.dateOfBirth = new Date(updateStudentDto.dateOfBirth);
    }

    return this.prisma.student.update({
      where: { id },
      data,
      include: {
        class: true,
      },
    });
  }

  /**
   * Création en masse — import CSV.
   *
   * Stratégie matricule sécurisée :
   *  1. Trouver le DERNIER matricule existant du tenant pour l'année (ORDER BY DESC LIMIT 1)
   *     → résistant aux trous laissés par des suppressions (plus fiable que COUNT)
   *  2. Générer les numéros suivants séquentiellement : lastNum+1, lastNum+2…
   *  3. Insérer en une seule $transaction Prisma (atomique — tout réussit ou tout annule)
   *
   * Pourquoi $transaction et non createMany ?
   *  createMany ne supporte pas `include` sur PostgreSQL avec Prisma.
   *  $transaction([...creates]) exécute N INSERT dans une seule transaction DB,
   *  ce qui est équivalent en performance et permet de retourner les objets complets.
   */
  async bulkCreate(tenantId: string, students: import('./dto/create-student.dto').CreateStudentDto[]) {
    const currentYear = new Date().getFullYear();
    const prefix = `STU-${currentYear}-`;

    // Trouver le matricule le plus élevé existant pour ce tenant + cette année
    const lastStudent = await this.prisma.student.findFirst({
      where: { tenantId, matricule: { startsWith: prefix } },
      orderBy: { matricule: 'desc' },
      select: { matricule: true },
    });

    const lastNum = lastStudent
      ? parseInt(lastStudent.matricule.replace(prefix, ''), 10)
      : 0;

    // Construire les creates avec matricules uniques et séquentiels
    const creates = students.map((dto, i) => {
      const num = lastNum + i + 1;
      const matricule = `${prefix}${String(num).padStart(5, '0')}`;
      const data: any = { ...dto, matricule, tenantId };
      if (dto.dateOfBirth) data.dateOfBirth = new Date(dto.dateOfBirth);
      return this.prisma.student.create({ data, include: { class: true } });
    });

    // Une seule transaction — atomique
    const created = await this.prisma.$transaction(creates);
    return { created: created.length, students: created };
  }

  async remove(tenantId: string, id: string) {
    // Vérifier que l'élève appartient au tenant
    await this.findOne(tenantId, id);

    return this.prisma.student.delete({
      where: { id },
    });
  }

  async getStats(tenantId: string) {
    const [total, active, inactive, paid, pending, late, byClass] = await Promise.all([
      this.prisma.student.count({ where: { tenantId } }),
      this.prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.student.count({ where: { tenantId, status: 'INACTIVE' } }),
      this.prisma.student.count({ where: { tenantId, paymentStatus: 'PAID' } }),
      this.prisma.student.count({ where: { tenantId, paymentStatus: 'PENDING' } }),
      this.prisma.student.count({ where: { tenantId, paymentStatus: 'OVERDUE' } }),
      this.prisma.student.groupBy({
        by: ['classId'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    return { total, active, inactive, paid, pending, late, byClass };
  }
}
