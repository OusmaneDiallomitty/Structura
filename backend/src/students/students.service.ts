import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StudentStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';

@Injectable()
export class StudentsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, createStudentDto: CreateStudentDto) {
    // Générer un matricule unique et robuste
    const currentYear = new Date().getFullYear();

    // Trouver le dernier élève créé pour ce tenant et cette année
    const lastStudent = await this.prisma.student.findFirst({
      where: {
        tenantId,
        matricule: {
          startsWith: `STU-${currentYear}-`,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        matricule: true,
      },
    });

    // Extraire le numéro du dernier matricule et incrémenter
    // Supporte les anciens matricules à 4 chiffres ET les nouveaux à 5 chiffres
    let nextNumber = 1;
    if (lastStudent) {
      const match = lastStudent.matricule.match(/STU-\d{4}-(\d{4,5})/);
      if (match) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    // Générer le nouveau matricule (5 chiffres)
    const matricule = `STU-${currentYear}-${String(nextNumber).padStart(5, '0')}`;

    // Vérifier qu'il n'existe pas déjà dans ce tenant (unicité par tenant depuis la migration)
    const existingStudent = await this.prisma.student.findFirst({
      where: { matricule, tenantId },
    });

    if (existingStudent) {
      // Fallback : boucler jusqu'à trouver un matricule libre
      let attempt = nextNumber + 1;
      let uniqueMatricule = '';
      while (!uniqueMatricule) {
        const testMatricule = `STU-${currentYear}-${String(attempt).padStart(5, '0')}`;
        const exists = await this.prisma.student.findFirst({
          where: { matricule: testMatricule, tenantId },
        });
        if (!exists) {
          uniqueMatricule = testMatricule;
          break;
        }
        attempt++;
      }

      // Convertir dateOfBirth string en Date si présent
      const data: any = {
        ...createStudentDto,
        matricule: uniqueMatricule,
        tenantId,
      };

      if (createStudentDto.dateOfBirth) {
        data.dateOfBirth = new Date(createStudentDto.dateOfBirth);
      }

      return this.prisma.student.create({
        data,
        include: {
          class: true,
        },
      });
    }

    // Convertir dateOfBirth string en Date si présent
    const data: any = {
      ...createStudentDto,
      matricule,
      tenantId,
    };

    if (createStudentDto.dateOfBirth) {
      data.dateOfBirth = new Date(createStudentDto.dateOfBirth);
    }

    return this.prisma.student.create({
      data,
      include: {
        class: true,
      },
    });
  }

  async findAll(
    tenantId: string,
    filters?: {
      status?: string;
      classId?: string;
      search?: string;
      // Pagination — limit: max résultats (défaut 500, max 5000 pour export)
      limit?: string | number;
      skip?: string | number;
    },
    currentUser?: { role: string; assignedClassIds?: string[] },
  ) {
    // Sécurité anti-OOM : jamais plus de 5000 enregistrements d'un coup
    const take = Math.min(Number(filters?.limit) || 500, 5000);
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

    if (filters?.search) {
      where.OR = [
        { firstName: { contains: filters.search, mode: 'insensitive' } },
        { lastName:  { contains: filters.search, mode: 'insensitive' } },
        { matricule: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    // Charger les élèves avec un indicateur de paiements réels
    const students = await this.prisma.student.findMany({
      where,
      take,
      skip,
      include: {
        class: true,
        // Inclure uniquement les paiements réussis pour calculer le statut réel
        payments: {
          where: { status: { in: ['paid', 'partial'] } },
          take: 1,
          select: { id: true, term: true, academicYear: true, paidDate: true },
          orderBy: { paidDate: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Recalculer le paymentStatus à partir des vrais paiements (corrige les données obsolètes)
    return students.map(({ payments: paidPayments, ...student }) => ({
      ...student,
      paymentStatus: paidPayments.length > 0 ? PaymentStatus.PAID : student.paymentStatus,
      lastPaidTerm: paidPayments[0]?.term || null,
      lastPaidDate: paidPayments[0]?.paidDate || null,
    }));
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
        grades: {
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

  async remove(tenantId: string, id: string) {
    // Vérifier que l'élève appartient au tenant
    await this.findOne(tenantId, id);

    return this.prisma.student.delete({
      where: { id },
    });
  }

  async getStats(tenantId: string) {
    const [total, active, inactive, byClass] = await Promise.all([
      this.prisma.student.count({ where: { tenantId } }),
      this.prisma.student.count({ where: { tenantId, status: 'ACTIVE' } }),
      this.prisma.student.count({ where: { tenantId, status: 'INACTIVE' } }),
      this.prisma.student.groupBy({
        by: ['classId'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    return {
      total,
      active,
      inactive,
      byClass,
    };
  }
}
