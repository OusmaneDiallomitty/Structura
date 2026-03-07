import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGradeDto, CreateBulkGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';

@Injectable()
export class GradesService {
    constructor(private prisma: PrismaService) { }

    /**
     * Vérifie que le trimestre n'est pas verrouillé avant toute écriture.
     * Lève ForbiddenException si un verrou existe → les notes ne peuvent pas être modifiées.
     */
    private async checkNotLocked(
        tenantId: string,
        classId: string,
        term: string,
        academicYear: string,
    ): Promise<void> {
        const lock = await this.prisma.trimesterLock.findFirst({
            where: { tenantId, classId, trimester: term, academicYear },
        });
        if (lock) {
            throw new ForbiddenException(
                `${term} est validé — déverrouillez le trimestre avant de modifier les notes.`,
            );
        }
    }

    async create(tenantId: string, createGradeDto: CreateGradeDto) {
        const currentYear = new Date().getFullYear();
        const academicYear = createGradeDto.academicYear || `${currentYear}-${currentYear + 1}`;

        await this.checkNotLocked(tenantId, createGradeDto.classId, createGradeDto.term, academicYear);

        return this.prisma.grade.create({
            data: {
                ...createGradeDto,
                academicYear,
                maxScore: createGradeDto.maxScore || 20,
                coefficient: createGradeDto.coefficient || 1,
                tenantId,
            },
            include: {
                student: true,
                class: true,
            },
        });
    }

    async createBulk(tenantId: string, createBulkDto: CreateBulkGradeDto) {
        const currentYear = new Date().getFullYear();
        const academicYear = createBulkDto.academicYear || `${currentYear}-${currentYear + 1}`;

        await this.checkNotLocked(tenantId, createBulkDto.classId, createBulkDto.term, academicYear);

        const grades = createBulkDto.grades.map((item) => ({
            subject: createBulkDto.subject,
            score: item.score,
            maxScore: createBulkDto.maxScore || 20,
            coefficient: createBulkDto.coefficient || 1,
            term: createBulkDto.term,
            academicYear,
            studentId: item.studentId,
            classId: createBulkDto.classId,
            teacherId: createBulkDto.teacherId,
            teacherName: createBulkDto.teacherName,
            notes: item.notes,
            tenantId,
        }));

        const result = await this.prisma.grade.createMany({
            data: grades,
            skipDuplicates: true, // Éviter les doublons
        });

        return {
            count: result.count,
            message: `${result.count} notes enregistrées`,
        };
    }

    async findAll(
        tenantId: string,
        filters?: {
            subject?: string;
            term?: string;
            classId?: string;
            studentId?: string;
            academicYear?: string;
            // Pagination — limit: max résultats (défaut 500, max 5000 pour export)
            limit?: string | number;
            skip?: string | number;
        },
    ) {
        // Sécurité anti-OOM : jamais plus de 5000 enregistrements d'un coup
        const take = Math.min(Number(filters?.limit) || 500, 5000);
        const skip = Number(filters?.skip) || 0;

        const where: any = { tenantId };

        if (filters?.subject)      where.subject      = filters.subject;
        if (filters?.term)         where.term         = filters.term;
        if (filters?.classId)      where.classId      = filters.classId;
        if (filters?.studentId)    where.studentId    = filters.studentId;
        if (filters?.academicYear) where.academicYear = filters.academicYear;

        return this.prisma.grade.findMany({
            where,
            take,
            skip,
            include: {
                student: true,
                class: true,
            },
            orderBy: [
                { term: 'asc' },
                { subject: 'asc' },
            ],
        });
    }

    async findOne(tenantId: string, id: string) {
        const grade = await this.prisma.grade.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                student: true,
                class: true,
            },
        });

        if (!grade) {
            throw new NotFoundException('Note non trouvée');
        }

        return grade;
    }

    async update(tenantId: string, id: string, updateGradeDto: UpdateGradeDto) {
        // Vérifier que la note appartient au tenant + que le trimestre n'est pas verrouillé
        const grade = await this.findOne(tenantId, id);
        await this.checkNotLocked(tenantId, grade.classId, grade.term, grade.academicYear);

        return this.prisma.grade.update({
            where: { id },
            data: updateGradeDto,
            include: {
                student: true,
                class: true,
            },
        });
    }

    async remove(tenantId: string, id: string) {
        // Vérifier que la note appartient au tenant
        await this.findOne(tenantId, id);

        return this.prisma.grade.delete({
            where: { id },
        });
    }

    async getStats(tenantId: string, filters?: { classId?: string; term?: string; academicYear?: string }) {
        const where: any = { tenantId };

        if (filters?.classId) {
            where.classId = filters.classId;
        }

        if (filters?.term) {
            where.term = filters.term;
        }

        if (filters?.academicYear) {
            where.academicYear = filters.academicYear;
        }

        // Moyenne générale
        const avgScore = await this.prisma.grade.aggregate({
            where,
            _avg: {
                score: true,
            },
        });

        // Statistiques par matière
        const bySubject = await this.prisma.grade.groupBy({
            by: ['subject'],
            where,
            _avg: {
                score: true,
            },
            _count: true,
        });

        // Nombre total de notes
        const totalGrades = await this.prisma.grade.count({ where });

        return {
            totalGrades,
            averageScore: avgScore._avg.score || 0,
            bySubject,
        };
    }

    async getStudentReport(tenantId: string, studentId: string, term: string, academicYear?: string) {
        const currentYear = new Date().getFullYear();
        const year = academicYear || `${currentYear}-${currentYear + 1}`;

        const grades = await this.prisma.grade.findMany({
            where: {
                tenantId,
                studentId,
                term,
                academicYear: year,
            },
            include: {
                student: {
                    include: {
                        class: true,
                    },
                },
            },
            orderBy: {
                subject: 'asc',
            },
        });

        if (grades.length === 0) {
            throw new NotFoundException('Aucune note trouvée pour cet élève');
        }

        // Calculer la moyenne pondérée sur l'échelle native (maxScore du niveau)
        // Ne jamais normaliser sur /20 : un élève de Primaire a des notes sur /10
        let totalPoints = 0;
        let totalCoefficients = 0;

        grades.forEach((grade) => {
            totalPoints += grade.score * (grade.coefficient || 1);
            totalCoefficients += grade.coefficient || 1;
        });

        const nativeMaxScore = grades[0]?.maxScore ?? 20;
        const average = totalCoefficients > 0 ? totalPoints / totalCoefficients : 0;

        return {
            student: grades[0].student,
            term,
            academicYear: year,
            maxScore: nativeMaxScore,
            grades: grades.map((g) => ({
                subject: g.subject,
                score: g.score,
                maxScore: g.maxScore,
                coefficient: g.coefficient,
                percentage: (g.score / g.maxScore) * 100,
                teacherName: g.teacherName,
                notes: g.notes,
            })),
            average: Math.round(average * 100) / 100,
            totalSubjects: grades.length,
        };
    }

    // ── Gestion des verrous de trimestre ──────────────────────────────────────

    async getTrimesterLock(
        tenantId: string,
        classId: string,
        trimester: string,
        academicYear: string,
    ) {
        return this.prisma.trimesterLock.findFirst({
            where: { tenantId, classId, trimester, academicYear },
        });
    }

    async lockTrimester(
        tenantId: string,
        classId: string,
        trimester: string,
        academicYear: string,
        lockedByName?: string,
    ) {
        return this.prisma.trimesterLock.upsert({
            where: {
                classId_trimester_academicYear_tenantId: {
                    classId,
                    trimester,
                    academicYear,
                    tenantId,
                },
            },
            create: { classId, tenantId, trimester, academicYear, lockedByName },
            update: { lockedAt: new Date(), lockedByName },
        });
    }

    async unlockTrimester(
        tenantId: string,
        classId: string,
        trimester: string,
        academicYear: string,
    ) {
        await this.prisma.trimesterLock.deleteMany({
            where: { tenantId, classId, trimester, academicYear },
        });
        return { message: 'Trimestre déverrouillé' };
    }

    async getClassReport(tenantId: string, classId: string, term: string, academicYear?: string) {
        const currentYear = new Date().getFullYear();
        const year = academicYear || `${currentYear}-${currentYear + 1}`;

        const grades = await this.prisma.grade.findMany({
            where: {
                tenantId,
                classId,
                term,
                academicYear: year,
            },
            include: {
                student: true,
                class: true,
            },
        });

        if (grades.length === 0) {
            throw new NotFoundException('Aucune note trouvée pour cette classe');
        }

        // Grouper par élève — moyenne sur l'échelle native (pas de normalisation /20)
        const studentGrades = grades.reduce((acc, grade) => {
            if (!acc[grade.studentId]) {
                acc[grade.studentId] = {
                    student: grade.student,
                    grades: [],
                    totalPoints: 0,
                    totalCoefficients: 0,
                };
            }

            acc[grade.studentId].grades.push(grade);
            acc[grade.studentId].totalPoints += grade.score * (grade.coefficient || 1);
            acc[grade.studentId].totalCoefficients += grade.coefficient || 1;

            return acc;
        }, {});

        // Calculer les moyennes
        const results = Object.values(studentGrades).map((data: any) => ({
            student: data.student,
            average: data.totalCoefficients > 0
                ? Math.round((data.totalPoints / data.totalCoefficients) * 100) / 100
                : 0,
            subjectCount: data.grades.length,
        }));

        // Trier par moyenne décroissante
        results.sort((a, b) => b.average - a.average);

        // Calculer la moyenne de la classe
        const classAverage = results.reduce((sum, r) => sum + r.average, 0) / results.length;

        return {
            class: grades[0].class,
            term,
            academicYear: year,
            maxScore: grades[0]?.maxScore ?? 20,
            students: results,
            classAverage: Math.round(classAverage * 100) / 100,
            totalStudents: results.length,
        };
    }
}
