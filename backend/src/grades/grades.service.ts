import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEvaluationDto, BulkCreateEvaluationDto } from './dto/create-evaluation.dto';
import { CreateCompositionDto, BulkCreateCompositionDto, UpdateCompositionDto } from './dto/create-composition.dto';
import { SetSubjectCoefficientsDto, UpdateSubjectCoefficientDto } from './dto/subject-coefficient.dto';
import { getMonthsForTerm, getTermsMonths } from './utils/months';

@Injectable()
export class GradesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Vérifie que le trimestre n'est pas verrouillé avant toute écriture
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

  /**
   * Obtient les mois du calendrier scolaire
   */
  private async getSchoolCalendar(tenantId: string, academicYear: string) {
    const [year, tenant] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { tenantId, name: academicYear } }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { schoolCalendar: true } }),
    ]);

    // Priorité : AcademicYear.startMonth → Tenant.schoolCalendar → défaut Septembre/9 mois
    const tenantCal = tenant?.schoolCalendar as { startMonth?: string; durationMonths?: number } | null;
    return {
      startMonth: year?.startMonth || tenantCal?.startMonth || 'Septembre',
      durationMonths: year?.durationMonths || tenantCal?.durationMonths || 9,
    };
  }

  // ── ÉVALUATIONS (Notes mensuelles) ──────────────────────────────────────

  async createEvaluation(tenantId: string, createDto: CreateEvaluationDto) {
    const currentYear = new Date().getFullYear();
    const academicYear = createDto.academicYear || `${currentYear}-${currentYear + 1}`;

    await this.checkNotLocked(tenantId, createDto.classId, createDto.term, academicYear);

    const calendar = await this.getSchoolCalendar(tenantId, academicYear);
    const isValidMonth = getMonthsForTerm(calendar.startMonth, calendar.durationMonths, createDto.term).includes(
      createDto.month,
    );

    if (!isValidMonth) {
      throw new BadRequestException(
        `Mois '${createDto.month}' n'appartient pas à ${createDto.term}`,
      );
    }

    return this.prisma.evaluation.upsert({
      where: {
        tenantId_studentId_classId_subject_term_academicYear_month: {
          tenantId,
          studentId: createDto.studentId,
          classId: createDto.classId,
          subject: createDto.subject,
          term: createDto.term,
          academicYear,
          month: createDto.month,
        },
      },
      create: { ...createDto, academicYear, tenantId },
      update: {
        score: createDto.score,
        teacherName: createDto.teacherName,
        notes: createDto.notes,
      },
    });
  }

  async bulkCreateEvaluations(tenantId: string, bulkDto: BulkCreateEvaluationDto) {
    const currentYear = new Date().getFullYear();
    const academicYear = bulkDto.academicYear || `${currentYear}-${currentYear + 1}`;

    await this.checkNotLocked(tenantId, bulkDto.classId, bulkDto.term, academicYear);

    const calendar = await this.getSchoolCalendar(tenantId, academicYear);
    const isValidMonth = getMonthsForTerm(
      calendar.startMonth,
      calendar.durationMonths,
      bulkDto.term,
    ).includes(bulkDto.month);

    if (!isValidMonth) {
      throw new BadRequestException(`Mois '${bulkDto.month}' n'appartient pas à ${bulkDto.term}`);
    }

    const evaluations = bulkDto.evaluations.map((item) => ({
      studentId: item.studentId,
      classId: bulkDto.classId,
      subject: bulkDto.subject,
      term: bulkDto.term,
      month: bulkDto.month,
      academicYear,
      score: item.score,
      teacherName: bulkDto.teacherName,
      notes: item.notes,
      tenantId,
    }));

    const result = await this.prisma.evaluation.createMany({
      data: evaluations,
      skipDuplicates: true,
    });

    return { count: result.count, message: `${result.count} évaluations enregistrées` };
  }

  async getEvaluations(
    tenantId: string,
    filters?: {
      classId?: string;
      subject?: string;
      term?: string;
      studentId?: string;
      academicYear?: string;
    },
  ) {
    const where: any = { tenantId };
    if (filters?.classId) where.classId = filters.classId;
    if (filters?.subject) where.subject = filters.subject;
    if (filters?.term) where.term = filters.term;
    if (filters?.studentId) where.studentId = filters.studentId;
    if (filters?.academicYear) where.academicYear = filters.academicYear;

    return this.prisma.evaluation.findMany({
      where,
      include: { student: true, class: true },
      orderBy: [
        { term: 'asc' },
        { subject: 'asc' },
        { month: 'asc' },
      ],
    });
  }

  // ── COMPOSITIONS (Examens) ──────────────────────────────────────────────

  async createComposition(tenantId: string, createDto: CreateCompositionDto) {
    const currentYear = new Date().getFullYear();
    const academicYear = createDto.academicYear || `${currentYear}-${currentYear + 1}`;

    await this.checkNotLocked(tenantId, createDto.classId, createDto.term, academicYear);

    return this.prisma.composition.upsert({
      where: {
        tenantId_studentId_classId_subject_term_academicYear: {
          tenantId,
          studentId: createDto.studentId,
          classId: createDto.classId,
          subject: createDto.subject,
          term: createDto.term,
          academicYear,
        },
      },
      create: { ...createDto, academicYear, tenantId },
      update: {
        compositionScore: createDto.compositionScore,
        teacherName: createDto.teacherName,
        notes: createDto.notes,
      },
    });
  }

  async bulkCreateCompositions(tenantId: string, bulkDto: BulkCreateCompositionDto) {
    const currentYear = new Date().getFullYear();
    const academicYear = bulkDto.academicYear || `${currentYear}-${currentYear + 1}`;

    await this.checkNotLocked(tenantId, bulkDto.classId, bulkDto.term, academicYear);

    const compositions = bulkDto.compositions.map((item) => ({
      studentId: item.studentId,
      classId: bulkDto.classId,
      subject: bulkDto.subject,
      term: bulkDto.term,
      academicYear,
      compositionScore: item.compositionScore,
      teacherName: bulkDto.teacherName,
      notes: item.notes,
      tenantId,
    }));

    const result = await this.prisma.composition.createMany({
      data: compositions,
      skipDuplicates: true,
    });

    return { count: result.count, message: `${result.count} compositions enregistrées` };
  }

  async updateComposition(
    tenantId: string,
    compositionId: string,
    updateDto: UpdateCompositionDto,
  ) {
    const comp = await this.prisma.composition.findFirst({
      where: { id: compositionId, tenantId },
    });

    if (!comp) throw new NotFoundException('Composition non trouvée');

    await this.checkNotLocked(tenantId, comp.classId, comp.term, comp.academicYear);

    return this.prisma.composition.update({
      where: { id: compositionId },
      data: updateDto,
    });
  }

  async getCompositions(
    tenantId: string,
    filters?: {
      classId?: string;
      subject?: string;
      term?: string;
      studentId?: string;
      academicYear?: string;
    },
  ) {
    const where: any = { tenantId };
    if (filters?.classId) where.classId = filters.classId;
    if (filters?.subject) where.subject = filters.subject;
    if (filters?.term) where.term = filters.term;
    if (filters?.studentId) where.studentId = filters.studentId;
    if (filters?.academicYear) where.academicYear = filters.academicYear;

    return this.prisma.composition.findMany({
      where,
      include: { student: true, class: true },
      orderBy: [{ term: 'asc' }, { subject: 'asc' }],
    });
  }

  // ── CALCULS DE MOYENNES ──────────────────────────────────────────────────

  /**
   * Calcule la moyenne de cours (moyenne des notes mensuelles).
   * Retourne null si aucune note mensuelle — permet de distinguer "0 intentionnel" de "absent".
   */
  private calculateAverageCourse(monthlyScores: number[]): number | null {
    if (monthlyScores.length === 0) return null;
    const sum = monthlyScores.reduce((a, b) => a + b, 0);
    return sum / monthlyScores.length;
  }

  /**
   * Calcule la moyenne d'une matière :
   *   - notes mensuelles + composition → (avgCourse + composition) / 2
   *   - composition seule (pas de notes mensuelles) → composition directement
   */
  private calculateAverageSubject(averageCourse: number | null, compositionScore: number): number {
    if (averageCourse === null) return compositionScore;
    return (averageCourse + compositionScore) / 2;
  }

  /**
   * Résout le coefficient d'une matière pour un élève.
   * Priorité : SubjectCoefficient (année) → ClassSubject (défaut classe) → fallback
   */
  private async resolveCoefficient(
    tenantId: string,
    classId: string,
    subject: string,
    academicYear: string,
    fallback: number,
  ): Promise<number> {
    const [subjectCoeff, classSubjectCoeff] = await Promise.all([
      this.prisma.subjectCoefficient.findFirst({
        where: { tenantId, classId, subject, academicYear },
      }),
      this.prisma.classSubject.findFirst({
        where: { classId, name: subject },
      }),
    ]);
    if (subjectCoeff?.coefficient != null) return subjectCoeff.coefficient;
    if (classSubjectCoeff?.coefficient != null) return classSubjectCoeff.coefficient;
    return fallback;
  }

  /**
   * Rapport élève pour un trimestre.
   * Adapte automatiquement la formule selon le mode de la classe :
   *   - SECONDARY : (moyenne_cours + composition) / 2 — sur 20
   *   - PRIMARY   : note de composition seule — sur 10
   *     → moyenne simple si aucun coefficient > 1, pondérée sinon
   */
  async getStudentReport(
    tenantId: string,
    studentId: string,
    term: string,
    academicYear?: string,
  ) {
    const currentYear = new Date().getFullYear();
    const year = academicYear || `${currentYear}-${currentYear + 1}`;

    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: { class: true },
    });
    if (!student) throw new NotFoundException('Élève non trouvé');

    const gradeMode  = (student.class as any)?.gradeMode ?? 'SECONDARY';
    const classLevel = (student.class as any)?.level ?? '';
    const className  = (student.class as any)?.name  ?? '';
    const isPrimary  =
      gradeMode === 'PRIMARY' ||
      ['Primaire', 'Maternelle'].includes(classLevel) ||
      /^(CP|CE|CM)\d/i.test(className) ||
      /^(Petite|Moyenne|Grande)\s+Section$/i.test(className);

    const [evaluations, compositions] = await Promise.all([
      this.prisma.evaluation.findMany({
        where: { tenantId, studentId, term, academicYear: year },
      }),
      this.prisma.composition.findMany({
        where: { tenantId, studentId, term, academicYear: year },
      }),
    ]);

    if (evaluations.length === 0 && compositions.length === 0) {
      throw new NotFoundException('Aucune note trouvée pour ce trimestre');
    }

    // ── Construire les détails par matière ──────────────────────────────────
    const subjectDetails = await Promise.all(
      compositions.map(async (comp) => {
        const coeff = await this.resolveCoefficient(
          tenantId, student.classId!, comp.subject, year,
          isPrimary ? 1 : 1, // défaut 1 dans les deux modes
        );

        if (isPrimary) {
          // Primaire : la note de composition IS la moyenne de matière (sur 10).
          //
          // Règle coefficient (identique secondaire) :
          //   coeff = 0  → matière sans coefficient (EPS, Dessin…) — EXCLUE de la moyenne générale
          //   coeff = 1  → poids égal ; c'est aussi le fallback si aucun ClassSubject n'est configuré
          //   coeff > 1  → pondération explicite (ex. CM1-CM2 : Maths ×2)
          //
          // Donc resolveCoefficient retourne déjà la bonne valeur :
          //   - ClassSubject configuré  → utilise le coefficient enregistré par le directeur
          //   - Aucun ClassSubject       → fallback = 1 → compte normalement
          return {
            subject:          comp.subject,
            averageCourse:    null,
            compositionScore: comp.compositionScore,
            averageSubject:   comp.compositionScore,
            coefficient:      coeff,
            countsInAverage:  coeff > 0,  // 0 = exclu, ≥ 1 = compte
            teacherName:      comp.teacherName || undefined,
          };
        } else {
          // Secondaire : (moyenne cours + composition) / 2 — sur 20
          // Si pas de notes mensuelles → composition seule (pas de division par 2)
          const monthlyScores = evaluations
            .filter((e) => e.subject === comp.subject)
            .map((e) => e.score);
          const avgCourse = this.calculateAverageCourse(monthlyScores);
          const averageSubject = this.calculateAverageSubject(avgCourse, comp.compositionScore);
          return {
            subject:          comp.subject,
            averageCourse:    avgCourse !== null ? Math.round(avgCourse * 100) / 100 : null,
            compositionScore: comp.compositionScore,
            averageSubject:   Math.round(averageSubject * 100) / 100,
            coefficient:      coeff,
            countsInAverage:  coeff > 0,
            teacherName:      comp.teacherName || undefined,
          };
        }
      }),
    );

    // ── Calculer la moyenne générale ────────────────────────────────────────
    const countedSubjects = subjectDetails.filter((s) => s.countsInAverage);
    let generalAverage = 0;

    if (isPrimary) {
      // Si aucune matière ne compte (tous coeff=0 ou pas de config coefficient),
      // fallback : moyenne simple sur toutes les matières (ignore les exclusions)
      const activeSubs = countedSubjects.length > 0 ? countedSubjects : subjectDetails;

      const hasWeightedCoeffs = activeSubs.some((s) => s.coefficient > 1);
      if (hasWeightedCoeffs) {
        const totalPoints = activeSubs.reduce((sum, s) => sum + s.averageSubject * s.coefficient, 0);
        const totalCoeffs  = activeSubs.reduce((sum, s) => sum + s.coefficient, 0);
        generalAverage = totalCoeffs > 0 ? Math.round((totalPoints / totalCoeffs) * 100) / 100 : 0;
      } else {
        const total = activeSubs.reduce((sum, s) => sum + s.averageSubject, 0);
        generalAverage = activeSubs.length > 0
          ? Math.round((total / activeSubs.length) * 100) / 100
          : 0;
      }
    } else {
      // Secondaire : toujours pondérée par coefficient
      // Fallback si tous coeff=0 : moyenne simple sur toutes les matières
      const activeSubs = countedSubjects.length > 0 ? countedSubjects : subjectDetails;
      const totalPoints = activeSubs.reduce((sum, s) => sum + s.averageSubject * s.coefficient, 0);
      const totalCoeffs  = activeSubs.reduce((sum, s) => sum + s.coefficient, 0);
      generalAverage = totalCoeffs > 0
        ? Math.round((totalPoints / totalCoeffs) * 100) / 100
        : Math.round((activeSubs.reduce((sum, s) => sum + s.averageSubject, 0) / activeSubs.length) * 100) / 100;
    }

    return {
      student: {
        id:        student.id,
        firstName: student.firstName,
        lastName:  student.lastName,
        matricule: student.matricule,
        class:     student.class
          ? { name: (student.class as any).name, section: (student.class as any).section }
          : null,
      },
      term,
      academicYear: year,
      gradeMode,
      scoreMax:     isPrimary ? 10 : 20,
      subjects:     subjectDetails,
      generalAverage,
      totalSubjects: subjectDetails.length,
    };
  }

  /**
   * Rapport annuel élève (primaire) — moyenne des 3 trimestres + décision.
   * Fonctionne aussi pour le secondaire mais la décision admis/redouble
   * est spécifique au primaire guinéen (seuil 5/10).
   */
  async getAnnualReport(tenantId: string, studentId: string, academicYear?: string) {
    const currentYear = new Date().getFullYear();
    const year = academicYear || `${currentYear}-${currentYear + 1}`;

    // Supporte les deux formats : "T1"/"T2"/"T3" (compact) et "Trimestre 1"/"Trimestre 2"/"Trimestre 3" (complet)
    const terms = ['Trimestre 1', 'Trimestre 2', 'Trimestre 3'];
    const termReports: { term: string; average: number }[] = [];

    for (const term of terms) {
      try {
        const report = await this.getStudentReport(tenantId, studentId, term, year);
        termReports.push({ term, average: report.generalAverage });
      } catch {
        // Trimestre sans notes — ignoré
      }
    }

    if (termReports.length === 0) {
      throw new NotFoundException('Aucune note trouvée pour cette année');
    }

    const annualAverage = Math.round(
      (termReports.reduce((sum, t) => sum + t.average, 0) / termReports.length) * 100,
    ) / 100;

    // Récupérer le gradeMode pour le seuil correct
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, tenantId },
      include: { class: { select: { gradeMode: true, level: true, name: true, section: true } } },
    });
    const gradeMode  = (student?.class as any)?.gradeMode ?? 'SECONDARY';
    const classLevel = (student?.class as any)?.level ?? '';
    const className  = (student?.class as any)?.name  ?? '';
    const isPrimary  =
      gradeMode === 'PRIMARY' ||
      ['Primaire', 'Maternelle'].includes(classLevel) ||
      /^(CP|CE|CM)\d/i.test(className) ||
      /^(Petite|Moyenne|Grande)\s+Section$/i.test(className);
    const passThreshold = isPrimary ? 5 : 10; // 5/10 primaire, 10/20 secondaire

    return {
      student: student
        ? { id: student.id, firstName: student.firstName, lastName: student.lastName, matricule: student.matricule }
        : { id: studentId },
      academicYear:    year,
      gradeMode,
      scoreMax:        isPrimary ? 10 : 20,
      termAverages:    termReports,
      termsCount:      termReports.length,
      annualAverage,
      decision:        annualAverage >= passThreshold ? 'ADMIS' : 'REDOUBLE',
      passThreshold,
    };
  }

  /**
   * Rapport de classe pour un trimestre
   */
  async getClassReport(
    tenantId: string,
    classId: string,
    term: string,
    academicYear?: string,
  ) {
    const currentYear = new Date().getFullYear();
    const year = academicYear || `${currentYear}-${currentYear + 1}`;

    // Récupérer les élèves de la classe
    const students = await this.prisma.student.findMany({
      where: { tenantId, classId, status: 'ACTIVE' },
    });

    if (students.length === 0) {
      throw new NotFoundException('Aucun élève dans cette classe');
    }

    // Calculer les moyennes pour chaque élève
    const studentResults = await Promise.all(
      students.map(async (student) => {
        try {
          const report = await this.getStudentReport(tenantId, student.id, term, year);
          return {
            student: report.student,
            generalAverage: report.generalAverage,
            totalSubjects: report.totalSubjects,
          };
        } catch {
          // Élève sans notes
          return {
            student: {
              id: student.id,
              firstName: student.firstName,
              lastName: student.lastName,
              matricule: student.matricule,
            },
            generalAverage: 0,
            totalSubjects: 0,
          };
        }
      }),
    );

    // Trier par moyenne décroissante et ajouter le rang
    const ranked = studentResults
      .sort((a, b) => b.generalAverage - a.generalAverage)
      .map((s, idx) => ({
        ...s,
        rank: idx + 1,
      }));

    const classAverage =
      ranked.length > 0
        ? Math.round((ranked.reduce((sum, r) => sum + r.generalAverage, 0) / ranked.length) * 100) /
          100
        : 0;

    const classInfo = await this.prisma.class.findUnique({
      where: { id: classId },
    });

    return {
      class: classInfo ? { id: classInfo.id, name: classInfo.name, section: classInfo.section } : null,
      term,
      academicYear: year,
      students: ranked,
      classAverage,
      totalStudents: ranked.length,
    };
  }

  // ── COEFFICIENTS ─────────────────────────────────────────────────────────

  async setSubjectCoefficients(tenantId: string, setDto: SetSubjectCoefficientsDto) {
    const currentYear = new Date().getFullYear();
    const academicYear = setDto.academicYear || `${currentYear}-${currentYear + 1}`;

    // Upsert chaque coefficient
    for (const coeff of setDto.coefficients) {
      await this.prisma.subjectCoefficient.upsert({
        where: {
          tenantId_classId_subject_academicYear: {
            tenantId,
            classId: setDto.classId,
            subject: coeff.subject,
            academicYear,
          },
        },
        create: {
          tenantId,
          classId: setDto.classId,
          subject: coeff.subject,
          coefficient: coeff.coefficient,
          academicYear,
        },
        update: { coefficient: coeff.coefficient },
      });
    }

    return {
      message: `${setDto.coefficients.length} coefficients configurés`,
      count: setDto.coefficients.length,
    };
  }

  async getSubjectCoefficients(
    tenantId: string,
    classId: string,
    academicYear?: string,
  ) {
    const currentYear = new Date().getFullYear();
    const year = academicYear || `${currentYear}-${currentYear + 1}`;

    return this.prisma.subjectCoefficient.findMany({
      where: { tenantId, classId, academicYear: year },
      orderBy: { subject: 'asc' },
    });
  }

  // ── VERROUS DE TRIMESTRE ────────────────────────────────────────────────

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
}
