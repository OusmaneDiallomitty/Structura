import { Injectable, NotFoundException, ForbiddenException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateEvaluationDto, BulkCreateEvaluationDto } from './dto/create-evaluation.dto';
import { CreateCompositionDto, BulkCreateCompositionDto, UpdateCompositionDto } from './dto/create-composition.dto';
import { SetSubjectCoefficientsDto, UpdateSubjectCoefficientDto } from './dto/subject-coefficient.dto';
import { getMonthsForTerm, getTermsMonths } from './utils/months';

@Injectable()
export class GradesService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /** Détecte si une classe est en mode primaire (sur 10) */
  private detectPrimary(classInfo: any): boolean {
    const gradeMode  = classInfo?.gradeMode ?? 'SECONDARY';
    const classLevel = classInfo?.level ?? '';
    const className  = classInfo?.name  ?? '';
    return (
      gradeMode === 'PRIMARY' ||
      ['Primaire', 'Maternelle'].includes(classLevel) ||
      /^(CP|CE|CM)\d/i.test(className) ||
      /^(Petite|Moyenne|Grande)\s+Section$/i.test(className)
    );
  }

  /**
   * Vérifie qu'un professeur est autorisé à écrire sur une matière d'une classe.
   * Les DIRECTOR/SECRETARY/ACCOUNTANT/SUPERVISOR ont accès à tout.
   * Un TEACHER ne peut écrire que sur les matières qui lui sont affectées via classAssignments.
   *
   * Structure classAssignments : [{ classId: string, subjects: string[] }]
   */
  assertSubjectAccess(user: any, classId: string, subject: string): void {
    const role: string = (user?.role ?? '').toUpperCase();

    // Les non-professeurs (directeur, etc.) passent sans restriction
    if (role !== 'TEACHER') return;

    const assignments: { classId: string; subjects: string[] }[] =
      Array.isArray(user.classAssignments) ? user.classAssignments : [];

    // Si aucune affectation configurée → accès refusé (sécurité par défaut)
    if (assignments.length === 0) {
      throw new ForbiddenException(
        'Aucune classe ou matière ne vous a été affectée. Contactez votre directeur.',
      );
    }

    const classEntry = assignments.find((a) => a.classId === classId);

    if (!classEntry) {
      throw new ForbiddenException(
        `Vous n'êtes pas affecté à cette classe.`,
      );
    }

    // Si subjects est vide → le prof a accès à toutes les matières de cette classe
    if (!classEntry.subjects || classEntry.subjects.length === 0) return;

    if (!classEntry.subjects.includes(subject)) {
      throw new ForbiddenException(
        `Vous n'êtes pas autorisé à saisir des notes pour la matière "${subject}" dans cette classe.`,
      );
    }
  }

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

    const result = await this.prisma.evaluation.upsert({
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
    await this.cache.del(
      `grades:evals:${tenantId}:${createDto.classId}:${createDto.term}:${academicYear}`,
      `grades:evals:${tenantId}:${createDto.classId}:${createDto.term}:${academicYear}:${createDto.subject}`,
      `grades:classreport:${tenantId}:${createDto.classId}:${createDto.term}:${academicYear}`,
    );
    return result;
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

    const results = await this.prisma.$transaction(
      bulkDto.evaluations.map((item) =>
        this.prisma.evaluation.upsert({
          where: {
            tenantId_studentId_classId_subject_term_academicYear_month: {
              tenantId,
              studentId: item.studentId,
              classId: bulkDto.classId,
              subject: bulkDto.subject,
              term: bulkDto.term,
              academicYear,
              month: bulkDto.month,
            },
          },
          create: {
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
          },
          update: {
            score: item.score,
            teacherName: bulkDto.teacherName,
            notes: item.notes,
          },
        }),
      ),
    );

    await this.cache.del(
      `grades:evals:${tenantId}:${bulkDto.classId}:${bulkDto.term}:${academicYear}`,
      `grades:evals:${tenantId}:${bulkDto.classId}:${bulkDto.term}:${academicYear}:${bulkDto.subject}`,
      `grades:classreport:${tenantId}:${bulkDto.classId}:${bulkDto.term}:${academicYear}`,
    );
    return { count: results.length, message: `${results.length} évaluations enregistrées` };
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
    // Cache uniquement quand la requête est ciblée (grille notes d'une classe/trimestre)
    // IMPORTANT : inclure le filtre subject dans la clé — des requêtes parallèles par
    // matière (grille secondaire) écraseraient sinon le cache global avec des données partielles.
    const subjectSuffix = filters?.subject ? `:${filters.subject}` : '';
    const cacheKey =
      filters?.classId && filters?.term && filters?.academicYear && !filters?.studentId
        ? `grades:evals:${tenantId}:${filters.classId}:${filters.term}:${filters.academicYear}${subjectSuffix}`
        : null;

    if (cacheKey) {
      const cached = await this.cache.get<any[]>(cacheKey);
      if (cached) return cached;
    }

    const where: any = { tenantId };
    if (filters?.classId) where.classId = filters.classId;
    if (filters?.subject) where.subject = filters.subject;
    if (filters?.term) where.term = filters.term;
    if (filters?.studentId) where.studentId = filters.studentId;
    if (filters?.academicYear) where.academicYear = filters.academicYear;

    const result = await this.prisma.evaluation.findMany({
      where,
      include: { student: true, class: true },
      orderBy: [
        { term: 'asc' },
        { subject: 'asc' },
        { month: 'asc' },
      ],
    });

    if (cacheKey) await this.cache.set(cacheKey, result, 180);
    return result;
  }

  // ── COMPOSITIONS (Examens) ──────────────────────────────────────────────

  async createComposition(tenantId: string, createDto: CreateCompositionDto) {
    const currentYear = new Date().getFullYear();
    const academicYear = createDto.academicYear || `${currentYear}-${currentYear + 1}`;

    await this.checkNotLocked(tenantId, createDto.classId, createDto.term, academicYear);

    const result = await this.prisma.composition.upsert({
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
    await this.cache.del(
      `grades:comps:${tenantId}:${createDto.classId}:${createDto.term}:${academicYear}`,
      `grades:comps:${tenantId}:${createDto.classId}:${createDto.term}:${academicYear}:${createDto.subject}`,
      `grades:classreport:${tenantId}:${createDto.classId}:${createDto.term}:${academicYear}`,
    );
    return result;
  }

  async bulkCreateCompositions(tenantId: string, bulkDto: BulkCreateCompositionDto) {
    const currentYear = new Date().getFullYear();
    const academicYear = bulkDto.academicYear || `${currentYear}-${currentYear + 1}`;

    await this.checkNotLocked(tenantId, bulkDto.classId, bulkDto.term, academicYear);

    const results = await this.prisma.$transaction(
      bulkDto.compositions.map((item) =>
        this.prisma.composition.upsert({
          where: {
            tenantId_studentId_classId_subject_term_academicYear: {
              tenantId,
              studentId: item.studentId,
              classId: bulkDto.classId,
              subject: bulkDto.subject,
              term: bulkDto.term,
              academicYear,
            },
          },
          create: {
            studentId: item.studentId,
            classId: bulkDto.classId,
            subject: bulkDto.subject,
            term: bulkDto.term,
            academicYear,
            compositionScore: item.compositionScore,
            teacherName: bulkDto.teacherName,
            notes: item.notes,
            tenantId,
          },
          update: {
            compositionScore: item.compositionScore,
            teacherName: bulkDto.teacherName,
            notes: item.notes,
          },
        }),
      ),
    );

    await this.cache.del(
      `grades:comps:${tenantId}:${bulkDto.classId}:${bulkDto.term}:${academicYear}`,
      `grades:comps:${tenantId}:${bulkDto.classId}:${bulkDto.term}:${academicYear}:${bulkDto.subject}`,
      `grades:classreport:${tenantId}:${bulkDto.classId}:${bulkDto.term}:${academicYear}`,
    );
    return { count: results.length, message: `${results.length} compositions enregistrées` };
  }

  async updateComposition(
    tenantId: string,
    compositionId: string,
    updateDto: UpdateCompositionDto,
    user?: any,
  ) {
    const comp = await this.prisma.composition.findFirst({
      where: { id: compositionId, tenantId },
    });

    if (!comp) throw new NotFoundException('Composition non trouvée');

    // Vérification accès matière pour les professeurs
    if (user) this.assertSubjectAccess(user, comp.classId, comp.subject);

    await this.checkNotLocked(tenantId, comp.classId, comp.term, comp.academicYear);

    const updated = await this.prisma.composition.update({
      where: { id: compositionId },
      data: updateDto,
    });
    await this.cache.del(
      `grades:comps:${tenantId}:${comp.classId}:${comp.term}:${comp.academicYear}`,
      `grades:comps:${tenantId}:${comp.classId}:${comp.term}:${comp.academicYear}:${comp.subject}`,
      `grades:classreport:${tenantId}:${comp.classId}:${comp.term}:${comp.academicYear}`,
    );
    return updated;
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
    // IMPORTANT : inclure le filtre subject dans la clé — des requêtes parallèles par
    // matière (grille primaire / secondaire) écraseraient sinon le cache global.
    const subjectSuffix = filters?.subject ? `:${filters.subject}` : '';
    const cacheKey =
      filters?.classId && filters?.term && filters?.academicYear && !filters?.studentId
        ? `grades:comps:${tenantId}:${filters.classId}:${filters.term}:${filters.academicYear}${subjectSuffix}`
        : null;

    if (cacheKey) {
      const cached = await this.cache.get<any[]>(cacheKey);
      if (cached) return cached;
    }

    const where: any = { tenantId };
    if (filters?.classId) where.classId = filters.classId;
    if (filters?.subject) where.subject = filters.subject;
    if (filters?.term) where.term = filters.term;
    if (filters?.studentId) where.studentId = filters.studentId;
    if (filters?.academicYear) where.academicYear = filters.academicYear;

    const result = await this.prisma.composition.findMany({
      where,
      include: { student: true, class: true },
      orderBy: [{ term: 'asc' }, { subject: 'asc' }],
    });

    if (cacheKey) await this.cache.set(cacheKey, result, 180);
    return result;
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
    // rawAvgSubject : valeur EXACTE utilisée pour le calcul de la moyenne générale
    // averageSubject dans la réponse : arrondie à 2 décimales pour l'affichage uniquement
    const subjectDetails = await Promise.all(
      compositions.map(async (comp) => {
        const coeff = await this.resolveCoefficient(
          tenantId, student.classId!, comp.subject, year,
          1, // défaut 1 dans les deux modes
        );

        if (isPrimary) {
          return {
            subject:          comp.subject,
            averageCourse:    null,
            compositionScore: comp.compositionScore,
            averageSubject:   comp.compositionScore,   // sur 10, pas d'arrondi nécessaire
            rawAvgSubject:    comp.compositionScore,   // identique pour primaire
            coefficient:      coeff,
            countsInAverage:  coeff > 0,
            teacherName:      comp.teacherName || undefined,
          };
        } else {
          // Secondaire : (moyenne cours + composition) / 2 — sur 20
          const monthlyScores = evaluations
            .filter((e) => e.subject === comp.subject)
            .map((e) => e.score);
          const avgCourse       = this.calculateAverageCourse(monthlyScores);
          const rawAvgSubject   = this.calculateAverageSubject(avgCourse, comp.compositionScore);
          return {
            subject:          comp.subject,
            averageCourse:    avgCourse !== null ? Math.round(avgCourse * 100) / 100 : null,
            compositionScore: comp.compositionScore,
            averageSubject:   Math.round(rawAvgSubject * 100) / 100,  // arrondi pour affichage
            rawAvgSubject,                                             // brut pour le calcul
            coefficient:      coeff,
            countsInAverage:  coeff > 0,
            teacherName:      comp.teacherName || undefined,
          };
        }
      }),
    );

    // ── Calculer la moyenne générale ─────────────────────────────────────────
    // IMPORTANT : on utilise rawAvgSubject (valeur exacte) et NON averageSubject
    // (arrondi) pour éviter les erreurs d'arrondi intermédiaires qui lèseraient l'élève.
    const countedSubjects = subjectDetails.filter((s) => s.countsInAverage);
    let generalAverage = 0;

    if (isPrimary) {
      const activeSubs = countedSubjects.length > 0 ? countedSubjects : subjectDetails;
      const hasWeightedCoeffs = activeSubs.some((s) => s.coefficient > 1);
      if (hasWeightedCoeffs) {
        const totalPoints = activeSubs.reduce((sum, s) => sum + s.rawAvgSubject * s.coefficient, 0);
        const totalCoeffs  = activeSubs.reduce((sum, s) => sum + s.coefficient, 0);
        generalAverage = totalCoeffs > 0 ? Math.round((totalPoints / totalCoeffs) * 100) / 100 : 0;
      } else {
        const total = activeSubs.reduce((sum, s) => sum + s.rawAvgSubject, 0);
        generalAverage = activeSubs.length > 0
          ? Math.round((total / activeSubs.length) * 100) / 100
          : 0;
      }
    } else {
      // Secondaire : toujours pondérée par coefficient
      const activeSubs = countedSubjects.length > 0 ? countedSubjects : subjectDetails;
      const totalPoints = activeSubs.reduce((sum, s) => sum + s.rawAvgSubject * s.coefficient, 0);
      const totalCoeffs  = activeSubs.reduce((sum, s) => sum + s.coefficient, 0);
      generalAverage = totalCoeffs > 0
        ? Math.round((totalPoints / totalCoeffs) * 100) / 100
        : Math.round((activeSubs.reduce((sum, s) => sum + s.rawAvgSubject, 0) / activeSubs.length) * 100) / 100;
    }

    // Retirer rawAvgSubject de la réponse (interne au calcul uniquement)
    const subjectDetailsClean = subjectDetails.map(({ rawAvgSubject: _, ...rest }) => rest);

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
      subjects:     subjectDetailsClean,
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
   * Rapport de classe pour un trimestre.
   * Optimisé : 6 requêtes SQL en parallèle au lieu de N×M×2 (N élèves × M matières × 2 requêtes coeff).
   * Résultat mis en cache Redis 2 minutes.
   */
  async getClassReport(
    tenantId: string,
    classId: string,
    term: string,
    academicYear?: string,
  ) {
    const currentYear = new Date().getFullYear();
    const year = academicYear || `${currentYear}-${currentYear + 1}`;

    const cacheKey = `grades:classreport:${tenantId}:${classId}:${term}:${year}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    // 6 requêtes en parallèle — remplace les centaines de requêtes en boucle
    const [students, allEvals, allComps, allCoeffs, classSubjects, classInfo] = await Promise.all([
      this.prisma.student.findMany({ where: { tenantId, classId, status: 'ACTIVE' } }),
      this.prisma.evaluation.findMany({ where: { tenantId, classId, term, academicYear: year } }),
      this.prisma.composition.findMany({ where: { tenantId, classId, term, academicYear: year } }),
      this.prisma.subjectCoefficient.findMany({ where: { tenantId, classId, academicYear: year } }),
      this.prisma.classSubject.findMany({ where: { classId } }),
      this.prisma.class.findUnique({ where: { id: classId } }),
    ]);

    if (students.length === 0) {
      throw new NotFoundException('Aucun élève dans cette classe');
    }

    const isPrimary = this.detectPrimary(classInfo);

    // Map de coefficients : ClassSubject en base, SubjectCoefficient (année) prend priorité
    const coeffMap = new Map<string, number>();
    for (const cs of classSubjects) {
      if (cs.coefficient != null) coeffMap.set(cs.name, cs.coefficient);
    }
    for (const sc of allCoeffs) {
      if (sc.coefficient != null) coeffMap.set(sc.subject, sc.coefficient);
    }

    // Regrouper évals et comps par élève (Maps pour O(1))
    const evalsByStudent = new Map<string, typeof allEvals>();
    for (const e of allEvals) {
      const arr = evalsByStudent.get(e.studentId) ?? [];
      arr.push(e);
      evalsByStudent.set(e.studentId, arr);
    }
    const compsByStudent = new Map<string, typeof allComps>();
    for (const c of allComps) {
      const arr = compsByStudent.get(c.studentId) ?? [];
      arr.push(c);
      compsByStudent.set(c.studentId, arr);
    }

    // Calcul en mémoire — zéro requête supplémentaire
    const studentResults = students.map((student) => {
      const evals = evalsByStudent.get(student.id) ?? [];
      const comps = compsByStudent.get(student.id) ?? [];

      if (comps.length === 0) {
        return {
          student: { id: student.id, firstName: student.firstName, lastName: student.lastName, matricule: student.matricule, gender: student.gender },
          generalAverage: 0,
          totalSubjects: 0,
        };
      }

      const subjectDetails = comps.map((comp) => {
        const coeff = coeffMap.get(comp.subject) ?? 1;
        if (isPrimary) {
          return { rawAvg: comp.compositionScore, coeff, counts: coeff > 0 };
        } else {
          const scores = evals.filter((e) => e.subject === comp.subject).map((e) => e.score);
          const avgCourse = this.calculateAverageCourse(scores);
          const rawAvg = this.calculateAverageSubject(avgCourse, comp.compositionScore);
          return { rawAvg, coeff, counts: coeff > 0 };
        }
      });

      const active = subjectDetails.filter((s) => s.counts).length > 0
        ? subjectDetails.filter((s) => s.counts)
        : subjectDetails;

      const totalPoints = active.reduce((sum, s) => sum + s.rawAvg * s.coeff, 0);
      const totalCoeffs = active.reduce((sum, s) => sum + s.coeff, 0);
      const generalAverage =
        totalCoeffs > 0
          ? Math.round((totalPoints / totalCoeffs) * 100) / 100
          : active.length > 0
            ? Math.round((active.reduce((sum, s) => sum + s.rawAvg, 0) / active.length) * 100) / 100
            : 0;

      return {
        student: { id: student.id, firstName: student.firstName, lastName: student.lastName, matricule: student.matricule, gender: student.gender },
        generalAverage,
        totalSubjects: comps.length,
      };
    });

    const ranked = studentResults
      .sort((a, b) => b.generalAverage - a.generalAverage)
      .map((s, idx) => ({ ...s, rank: idx + 1 }));

    const classAverage =
      ranked.length > 0
        ? Math.round((ranked.reduce((sum, r) => sum + r.generalAverage, 0) / ranked.length) * 100) / 100
        : 0;

    const result = {
      class: classInfo ? { id: classInfo.id, name: (classInfo as any).name, section: (classInfo as any).section } : null,
      term,
      academicYear: year,
      students: ranked,
      classAverage,
      totalStudents: ranked.length,
      gradeMode: isPrimary ? 'PRIMARY' : 'SECONDARY',
      scoreMax: isPrimary ? 10 : 20,
      passThreshold: isPrimary ? 5 : 10,
    };

    await this.cache.set(cacheKey, result, 120);
    return result;
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
