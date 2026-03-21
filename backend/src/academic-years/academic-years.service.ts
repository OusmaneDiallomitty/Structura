import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { StudentStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import {
  CreateNewYearTransitionDto,
  StudentTransitionMode,
} from './dto/create-new-year-transition.dto';

// TTL du cache : 5 minutes (les données changent rarement)
const CACHE_TTL = 300;

@Injectable()
export class AcademicYearsService {
  constructor(
    private prisma: PrismaService,
    private cache: CacheService,
  ) {}

  /** Clés de cache par tenant */
  private key = {
    current: (tenantId: string) => `year:current:${tenantId}`,
    all:     (tenantId: string) => `year:all:${tenantId}`,
  };

  /** Invalider les deux caches d'un tenant (après toute mutation) */
  private async invalidate(tenantId: string) {
    await this.cache.del(this.key.current(tenantId), this.key.all(tenantId));
  }

  /**
   * Récupérer toutes les années académiques d'un tenant
   * Cache Redis 5 min — invalidé à chaque mutation
   */
  async findAll(tenantId: string) {
    const cacheKey = this.key.all(tenantId);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.prisma.academicYear.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: { classes: true, students: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });

    await this.cache.set(cacheKey, result, CACHE_TTL);
    return result;
  }

  /**
   * Récupérer l'année courante
   * Cache Redis 5 min — endpoint le plus appelé (chaque page du dashboard)
   */
  async findCurrent(tenantId: string) {
    const cacheKey = this.key.current(tenantId);
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const currentYear = await this.prisma.academicYear.findFirst({
      where: { tenantId, isCurrent: true },
      include: {
        _count: {
          select: { classes: true, students: true },
        },
      },
    });

    if (!currentYear) {
      throw new NotFoundException("Aucune année scolaire courante n'est définie");
    }

    await this.cache.set(cacheKey, currentYear, CACHE_TTL);
    return currentYear;
  }

  /**
   * Retourne un aperçu de promotion pour l'année courante.
   * Pour chaque classe : liste des élèves avec leur moyenne annuelle
   * calculée à partir des compositions, et la décision suggérée.
   */
  async getPromotionPreview(tenantId: string) {
    const currentYear = await this.prisma.academicYear.findFirst({
      where: { tenantId, isCurrent: true },
    });
    if (!currentYear) throw new NotFoundException("Aucune année scolaire courante");

    const classes = await this.prisma.class.findMany({
      where: { tenantId, academicYearId: currentYear.id },
      include: { students: { where: { status: { not: StudentStatus.GRADUATED } } } },
      orderBy: { name: 'asc' },
    });

    // Compositions pour l'année courante (contiennent les moyennes par matière/trimestre)
    const compositions = await this.prisma.composition.findMany({
      where: { tenantId, academicYear: currentYear.name },
    });

    // Seuil de passage fixé à 10/20 (compositions guinéennes sur 20)
    const SCORE_MAX = 20;
    const PASS_THRESHOLD = 10;

    return classes.map((cls) => {
      const nextGrade = this.getNextGrade(cls.name);
      const studentsWithAvg = cls.students.map((student) => {
        const studentComps = compositions.filter((c) => c.studentId === student.id);
        // Moyenne générale annuelle = moyenne de toutes les compositions
        const scores = studentComps
          .map((c) => Number(c.compositionScore))
          .filter((s) => !isNaN(s) && s >= 0);
        const finalAverage = scores.length > 0
          ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
          : null;
        const suggestedDecision = finalAverage !== null
          ? (finalAverage >= PASS_THRESHOLD ? 'promote' : 'repeat')
          : 'promote'; // Pas de note → promouvoir par défaut
        return {
          id: student.id,
          firstName: student.firstName,
          lastName: student.lastName,
          matricule: student.matricule,
          finalAverage,
          scoreMax: SCORE_MAX,
          passed: finalAverage !== null ? finalAverage >= PASS_THRESHOLD : null,
          suggestedDecision,
        };
      });
      return {
        classId: cls.id,
        className: cls.name,
        nextClassName: nextGrade.name,
        studentCount: cls.students.length,
        students: studentsWithAvg.sort((a, b) =>
          `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr')
        ),
      };
    });
  }

  /**
   * Récupérer une année académique par ID
   */
  async findOne(tenantId: string, id: string) {
    const academicYear = await this.prisma.academicYear.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        _count: {
          select: {
            classes: true,
            students: true,
          },
        },
      },
    });

    if (!academicYear) {
      throw new NotFoundException('Année académique non trouvée');
    }

    return academicYear;
  }

  /**
   * Créer une année académique simple (sans transition)
   */
  async create(tenantId: string, createDto: CreateAcademicYearDto) {
    // Vérifier qu'une année avec ce nom n'existe pas déjà
    const existing = await this.prisma.academicYear.findFirst({
      where: {
        tenantId,
        name: createDto.name,
      },
    });

    if (existing) {
      throw new ConflictException(
        `L'année académique ${createDto.name} existe déjà`,
      );
    }

    // Si isCurrent = true, désactiver les autres années courantes
    if (createDto.isCurrent) {
      await this.prisma.academicYear.updateMany({
        where: {
          tenantId,
          isCurrent: true,
        },
        data: {
          isCurrent: false,
        },
      });
    }

    const created = await this.prisma.academicYear.create({
      data: {
        name: createDto.name,
        startDate: createDto.startDate ? new Date(createDto.startDate) : null,
        endDate: createDto.endDate ? new Date(createDto.endDate) : null,
        startMonth: createDto.startMonth ?? null,
        durationMonths: createDto.durationMonths ?? null,
        isCurrent: createDto.isCurrent ?? false,
        tenantId,
      },
    });

    await this.invalidate(tenantId);
    return created;
  }

  /**
   * Créer une nouvelle année avec transition automatique des élèves
   * C'est la fonction principale utilisée par le wizard
   */
  async createWithTransition(
    tenantId: string,
    createDto: CreateNewYearTransitionDto,
  ) {
    // Vérifier qu'une année courante existe
    const currentYear = await this.prisma.academicYear.findFirst({
      where: {
        tenantId,
        isCurrent: true,
      },
    });

    if (!currentYear) {
      throw new BadRequestException(
        "Aucune année courante n'existe. Créez d'abord une année académique.",
      );
    }

    // Vérifier que la nouvelle année n'existe pas déjà
    const existing = await this.prisma.academicYear.findFirst({
      where: {
        tenantId,
        name: createDto.name,
      },
    });

    if (existing) {
      throw new ConflictException(
        `L'année académique ${createDto.name} existe déjà`,
      );
    }

    // Transaction atomique pour tout faire d'un coup
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Créer la nouvelle année académique
      const newYear = await tx.academicYear.create({
        data: {
          name: createDto.name,
          startDate: createDto.startDate ? new Date(createDto.startDate) : null,
          endDate: createDto.endDate ? new Date(createDto.endDate) : null,
          startMonth: createDto.startMonth ?? null,
          durationMonths: createDto.durationMonths ?? null,
          isCurrent: true,
          tenantId,
        },
      });

      // 2. Récupérer toutes les classes de l'année courante
      const currentClasses = await tx.class.findMany({
        where: {
          tenantId,
          academicYearId: currentYear.id,
        },
        include: {
          students: true,
        },
      });

      const classMapping: Record<string, string> = {}; // oldClassId -> newClassId
      const studentTransitionMode =
        createDto.studentTransitionMode || StudentTransitionMode.PROMOTE;

      // 3. Créer les nouvelles classes selon le mode de transition
      for (const oldClass of currentClasses) {
        let newClassName: string;
        let newLevel: string;

        if (studentTransitionMode === StudentTransitionMode.PROMOTE) {
          // Calculer la classe supérieure
          const nextGrade = this.getNextGrade(oldClass.name);
          newClassName = nextGrade.name;
          newLevel = nextGrade.level;
        } else {
          // Garder le même nom de classe
          newClassName = oldClass.name;
          newLevel = oldClass.level;
        }

        const newClass = await tx.class.create({
          data: {
            name: newClassName,
            level: newLevel,
            section: oldClass.section,
            capacity: oldClass.capacity,
            teacherId: oldClass.teacherId,
            teacherName: oldClass.teacherName,
            room: oldClass.room,
            academicYear: createDto.name,
            academicYearId: newYear.id,
            tenantId,
          },
        });

        classMapping[oldClass.id] = newClass.id;
      }

      // 4. Transférer les élèves selon les décisions individuelles
      if (studentTransitionMode !== StudentTransitionMode.NONE) {
        for (const oldClass of currentClasses) {
          const newClassId = classMapping[oldClass.id];
          if (!newClassId) continue;

          for (const student of oldClass.students) {
            const decision = createDto.studentDecisions?.find(d => d.studentId === student.id);
            const effectiveDecision = decision?.decision ??
              (studentTransitionMode === StudentTransitionMode.PROMOTE ? 'promote' : 'repeat');

            if (effectiveDecision === 'graduate') {
              // Diplômé : marquer le statut, ne pas déplacer
              await tx.student.update({
                where: { id: student.id },
                data: { status: StudentStatus.GRADUATED },
              });
            } else if (effectiveDecision === 'repeat') {
              // Redoublant : reste dans la même classe niveau mais nouvelle année
              // Cherche la classe du même nom dans la nouvelle année
              const sameGradeClass = await tx.class.findFirst({
                where: { tenantId, academicYearId: newYear.id, name: oldClass.name },
              });
              if (sameGradeClass) {
                await tx.student.update({
                  where: { id: student.id },
                  data: { classId: sameGradeClass.id, academicYearId: newYear.id },
                });
              }
            } else {
              // Promu : va dans la classe supérieure
              await tx.student.update({
                where: { id: student.id },
                data: { classId: newClassId, academicYearId: newYear.id },
              });
            }
          }
        }
      }

      // 5. Créer les classes d'entrée si elles n'existent pas dans le nouveau mapping
      // (pour accueillir les nouveaux élèves qui rejoignent l'école cette année)
      if (studentTransitionMode === StudentTransitionMode.PROMOTE) {
        // Récupérer les noms des classes déjà créées pour la nouvelle année
        const newClassNames = await tx.class.findMany({
          where: { tenantId, academicYearId: newYear.id },
          select: { name: true },
        });
        const existingNewNames = new Set(newClassNames.map((c) => c.name));

        // Classes de première inscription (début de cycle)
        // On crée seulement celles dont le nom correspondant n'existe pas encore
        const entryClasses = [
          { name: 'CP',         level: 'PRIMAIRE'    },
          { name: '1ère Année', level: 'PRIMAIRE'    },
          { name: '7ème',       level: 'SECONDAIRE'  },
          { name: 'Petite Section', level: 'MATERNEL' },
        ];

        for (const entryClass of entryClasses) {
          if (!existingNewNames.has(entryClass.name)) {
            await tx.class.create({
              data: {
                name:           entryClass.name,
                level:          entryClass.level,
                section:        'A',
                capacity:       30,
                academicYear:   createDto.name,
                academicYearId: newYear.id,
                tenantId,
              },
            });
          }
        }
      }

      // 6. Marquer l'ancienne année comme archivée
      await tx.academicYear.update({
        where: { id: currentYear.id },
        data: {
          isCurrent: false,
          isArchived: true,
        },
      });

      // 7. Retourner le résumé de la transition
      const newClassesCount = Object.keys(classMapping).length;
      const studentsTransferred =
        studentTransitionMode !== StudentTransitionMode.NONE
          ? await tx.student.count({
              where: {
                academicYearId: newYear.id,
                tenantId,
              },
            })
          : 0;

      return {
        newYear,
        summary: {
          classesCreated: newClassesCount,
          studentsTransferred,
          oldYear: currentYear.name,
          newYear: newYear.name,
          transitionMode: studentTransitionMode,
        },
      };
    });

    await this.invalidate(tenantId);
    return result;
  }

  /**
   * Définir une année comme année courante
   */
  async setCurrent(tenantId: string, id: string) {
    // Vérifier que l'année existe
    await this.findOne(tenantId, id);

    const result = await this.prisma.$transaction([
      this.prisma.academicYear.updateMany({
        where: { tenantId, isCurrent: true },
        data: { isCurrent: false },
      }),
      this.prisma.academicYear.update({
        where: { id },
        data: { isCurrent: true, isArchived: false },
      }),
    ]);

    await this.invalidate(tenantId);
    return result;
  }

  /**
   * Supprimer une année académique
   */
  async remove(tenantId: string, id: string) {
    const academicYear = await this.findOne(tenantId, id);

    // Ne pas permettre la suppression de l'année courante
    if (academicYear.isCurrent) {
      throw new BadRequestException(
        "Impossible de supprimer l'année courante",
      );
    }

    // Vérifier s'il y a des données associées
    const classCount = await this.prisma.class.count({
      where: { academicYearId: id },
    });

    const studentCount = await this.prisma.student.count({
      where: { academicYearId: id },
    });

    if (classCount > 0 || studentCount > 0) {
      throw new BadRequestException(
        `Impossible de supprimer cette année car elle contient ${classCount} classe(s) et ${studentCount} élève(s)`,
      );
    }

    const deleted = await this.prisma.academicYear.delete({
      where: { id },
    });

    await this.invalidate(tenantId);
    return deleted;
  }

  /**
   * Calculer la classe supérieure à partir d'un nom de classe
   * Fonction helper pour la promotion
   */
  private getNextGrade(currentGrade: string): { name: string; level: string } {
    // Mapping des progressions de classes
    const gradeProgression: Record<string, { name: string; level: string }> = {
      // Maternelle
      'Petite Section': { name: 'Moyenne Section', level: 'MATERNEL' },
      'Moyenne Section': { name: 'Grande Section', level: 'MATERNEL' },
      'Grande Section': { name: 'CP', level: 'PRIMAIRE' },

      // Primaire
      CP: { name: 'CE1', level: 'PRIMAIRE' },
      CE1: { name: 'CE2', level: 'PRIMAIRE' },
      CE2: { name: 'CM1', level: 'PRIMAIRE' },
      CM1: { name: 'CM2', level: 'PRIMAIRE' },
      CM2: { name: '6ème', level: 'SECONDAIRE' },

      // Alternative Primaire (système guinéen)
      '1ère Année': { name: '2ème Année', level: 'PRIMAIRE' },
      '2ème Année': { name: '3ème Année', level: 'PRIMAIRE' },
      '3ème Année': { name: '4ème Année', level: 'PRIMAIRE' },
      '4ème Année': { name: '5ème Année', level: 'PRIMAIRE' },
      '5ème Année': { name: '6ème Année', level: 'PRIMAIRE' },
      '6ème Année': { name: '7ème', level: 'SECONDAIRE' },

      // Secondaire (Collège)
      '6ème': { name: '5ème', level: 'SECONDAIRE' },
      '5ème': { name: '4ème', level: 'SECONDAIRE' },
      '4ème': { name: '3ème', level: 'SECONDAIRE' },
      '3ème': { name: '2nde', level: 'SECONDAIRE' },

      // Alternative Secondaire (système guinéen)
      '7ème': { name: '8ème', level: 'SECONDAIRE' },
      '8ème': { name: '9ème', level: 'SECONDAIRE' },
      '9ème': { name: '10ème', level: 'SECONDAIRE' },

      // Secondaire (Lycée)
      '2nde': { name: '1ère', level: 'SECONDAIRE' },
      '1ère': { name: 'Terminale', level: 'SECONDAIRE' },
      '10ème': { name: '11ème', level: 'SECONDAIRE' },
      '11ème': { name: '12ème', level: 'SECONDAIRE' },

      // Terminale -> Diplômé (pas de progression)
      Terminale: { name: 'Diplômé', level: 'GRADUATED' },
      '12ème': { name: 'Diplômé', level: 'GRADUATED' },
    };

    const nextGrade = gradeProgression[currentGrade];

    if (!nextGrade) {
      // Par défaut, garder le même nom
      return { name: currentGrade, level: 'PRIMAIRE' };
    }

    return nextGrade;
  }
}
