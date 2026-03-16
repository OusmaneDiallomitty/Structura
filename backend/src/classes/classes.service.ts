import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { DEFAULT_CLASSES, CreateDefaultClassesDto } from './dto/create-default-classes.dto';
import { ConvertAndCreateClassesDto } from './dto/convert-and-create-classes.dto';
import { SaveClassSubjectsDto } from './dto/save-class-subjects.dto';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Créer une classe unique
   * PRODUCTION-READY: Rattache automatiquement à l'année courante
   */
  async create(tenantId: string, createClassDto: CreateClassDto) {
    // Vérifier qu'une année courante existe
    const currentYear = await this.prisma.academicYear.findFirst({
      where: {
        tenantId,
        isCurrent: true,
      },
    });

    if (!currentYear) {
      throw new BadRequestException(
        'Impossible de créer une classe sans année académique courante. ' +
        'Veuillez d\'abord créer une année académique.'
      );
    }

    // Créer la classe rattachée à l'année courante
    return this.prisma.class.create({
      data: {
        ...createClassDto,
        academicYearId: currentYear.id,
        academicYear: currentYear.name,
        tenantId,
      },
    });
  }

  /**
   * Récupérer toutes les classes d'un tenant
   * Production: Tri par ordre logique (CP1, CP2, ..., 12ème) + stats de genre
   * Si role === TEACHER : filtre sur classAssignments (source de vérité unique)
   */
  async findAll(tenantId: string, userId?: string, role?: string, classAssignments?: any[]) {
    const where: any = { tenantId };

    // Un professeur ne voit que ses classes assignées (via classAssignments — toujours à jour)
    if (role === 'TEACHER' && userId) {
      const assignedIds = (classAssignments ?? [])
        .map((a: any) => a.classId)
        .filter(Boolean);
      if (assignedIds.length === 0) return [];
      where.id = { in: assignedIds };
    }

    // 1 requête pour les classes (sans charger tous les élèves)
    const [classes, genderStats] = await Promise.all([
      this.prisma.class.findMany({
        where,
        include: {
          _count: { select: { students: true } },
        },
        orderBy: [
          { order: 'asc' },
          { section: 'asc' },
        ],
      }),
      // 1 requête groupBy pour les stats de genre (au lieu de N requêtes)
      this.prisma.student.groupBy({
        by: ['classId', 'gender'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    // Construire une map classId → { maleCount, femaleCount }
    const genderMap = new Map<string, { maleCount: number; femaleCount: number }>();
    for (const stat of genderStats) {
      if (!genderMap.has(stat.classId)) {
        genderMap.set(stat.classId, { maleCount: 0, femaleCount: 0 });
      }
      const entry = genderMap.get(stat.classId)!;
      if (stat.gender === 'M') entry.maleCount = stat._count;
      else if (stat.gender === 'F') entry.femaleCount = stat._count;
    }

    return classes.map((classItem) => {
      const gender = genderMap.get(classItem.id) ?? { maleCount: 0, femaleCount: 0 };
      return {
        ...classItem,
        maleCount: gender.maleCount,
        femaleCount: gender.femaleCount,
      };
    });
  }

  async findOne(tenantId: string, id: string, userId?: string, role?: string, classAssignments?: any[]) {
    const classEntity = await this.prisma.class.findFirst({
      where: {
        id,
        tenantId,
      },
      include: {
        students: {
          orderBy: { lastName: 'asc' },
        },
        _count: {
          select: { students: true },
        },
      },
    });

    if (!classEntity) {
      throw new NotFoundException('Classe non trouvée');
    }

    // Un professeur ne peut accéder qu'à ses classes assignées (via classAssignments)
    if (role === 'TEACHER' && userId) {
      const assignedIds = (classAssignments ?? []).map((a: any) => a.classId).filter(Boolean);
      if (!assignedIds.includes(id)) {
        throw new ForbiddenException('Vous n\'êtes pas assigné à cette classe');
      }
    }

    return classEntity;
  }

  /**
   * Mettre à jour une classe (nom, section, capacité, etc.)
   * PRODUCTION-READY: Validation des doublons de section
   */
  async update(tenantId: string, id: string, updateClassDto: UpdateClassDto) {
    const existingClass = await this.findOne(tenantId, id);

    // Si on modifie la section, vérifier qu'on ne crée pas de doublon
    if (updateClassDto.section !== undefined) {
      const name = updateClassDto.name || existingClass.name;
      const academicYearId = existingClass.academicYearId;

      // Vérifier si une autre classe avec ce nom et cette section existe déjà
      const duplicate = await this.prisma.class.findFirst({
        where: {
          tenantId,
          academicYearId,
          name,
          section: updateClassDto.section,
          id: { not: id }, // Exclure la classe courante
        },
      });

      if (duplicate) {
        const sectionDisplay = updateClassDto.section || 'sans section';
        throw new BadRequestException(
          `❌ Une classe "${name}" avec la section "${sectionDisplay}" existe déjà pour cette année académique.`
        );
      }
    }

    return this.prisma.class.update({
      where: { id },
      data: updateClassDto,
    });
  }

  async transferStudents(
    tenantId: string,
    sourceClassId: string,
    targetClassId: string,
  ) {
    // Vérifier que les deux classes existent et appartiennent au tenant
    const [sourceClass, targetClass] = await Promise.all([
      this.findOne(tenantId, sourceClassId),
      this.findOne(tenantId, targetClassId),
    ]);

    // Transférer tous les élèves de la classe source vers la classe cible
    const result = await this.prisma.student.updateMany({
      where: {
        classId: sourceClassId,
        tenantId,
      },
      data: {
        classId: targetClassId,
      },
    });

    return {
      transferred: result.count,
      from: sourceClass.name,
      to: targetClass.name,
    };
  }

  // ─── Matières d'une classe ──────────────────────────────────────────────

  /**
   * Récupère les matières configurées pour une classe.
   * Retourne une liste vide si aucune matière n'a encore été configurée.
   */
  async getSubjects(tenantId: string, classId: string) {
    // Vérifier que la classe appartient au tenant
    await this.findOne(tenantId, classId);

    return this.prisma.classSubject.findMany({
      where: { classId, tenantId },
      orderBy: { order: 'asc' },
      select: { id: true, name: true, coefficient: true, order: true },
    });
  }

  /**
   * Sauvegarde la liste complète des matières d'une classe (upsert + suppression).
   * Opération idempotente : peut être appelée plusieurs fois sans effet de bord.
   */
  async saveSubjects(
    tenantId: string,
    classId: string,
    dto: SaveClassSubjectsDto,
  ) {
    // Vérifier que la classe appartient au tenant
    await this.findOne(tenantId, classId);

    return this.prisma.$transaction(async (tx) => {
      // 1. Supprimer les matières qui ne sont plus dans la liste
      await tx.classSubject.deleteMany({
        where: {
          classId,
          tenantId,
          name: { notIn: dto.subjects.map((s) => s.name) },
        },
      });

      // 2. Upsert chaque matière en parallèle (indépendantes entre elles → Promise.all)
      await Promise.all(
        dto.subjects.map((s, i) =>
          tx.classSubject.upsert({
            where: { classId_name: { classId, name: s.name } },
            update: { coefficient: s.coefficient, order: i },
            create: {
              classId,
              tenantId,
              name: s.name,
              coefficient: s.coefficient,
              order: i,
            },
          }),
        ),
      );

      // 3. Retourner la liste finale triée
      return tx.classSubject.findMany({
        where: { classId, tenantId },
        orderBy: { order: 'asc' },
        select: { id: true, name: true, coefficient: true, order: true },
      });
    });
  }

  async remove(tenantId: string, id: string) {
    const classEntity = await this.findOne(tenantId, id);

    // Supprimer d'abord les dépendances (élèves, présences, paiements, notes)
    await this.prisma.$transaction([
      // Supprimer les évaluations des élèves de cette classe
      this.prisma.evaluation.deleteMany({
        where: { student: { classId: id } },
      }),
      // Supprimer les compositions des élèves de cette classe
      this.prisma.composition.deleteMany({
        where: { student: { classId: id } },
      }),
      // Supprimer les présences des élèves de cette classe
      this.prisma.attendance.deleteMany({
        where: { student: { classId: id } },
      }),
      // Supprimer les paiements des élèves de cette classe
      this.prisma.payment.deleteMany({
        where: { student: { classId: id } },
      }),
      // Supprimer les élèves de cette classe
      this.prisma.student.deleteMany({
        where: { classId: id },
      }),
      // Enfin, supprimer la classe
      this.prisma.class.delete({
        where: { id },
      }),
    ]);

    return classEntity;
  }

  /**
   * Créer les classes par défaut du système éducatif guinéen
   */
  /**
   * Créer les classes prédéfinies du système guinéen
   * PRODUCTION-READY: Validation stricte qu'une année courante existe
   */
  async createDefaultClasses(tenantId: string, dto: CreateDefaultClassesDto) {
    const { academicYearId, selectedClasses, sections } = dto;

    // 1. Vérifier qu'une année courante existe (protection production)
    const currentYear = await this.prisma.academicYear.findFirst({
      where: {
        tenantId,
        isCurrent: true,
      },
    });

    if (!currentYear) {
      throw new BadRequestException(
        'Impossible de créer des classes sans année académique courante. ' +
        'Veuillez d\'abord créer une année académique dans le dashboard.'
      );
    }

    // 2. Vérifier que l'année académique fournie existe et est bien la courante
    const academicYear = await this.prisma.academicYear.findFirst({
      where: {
        id: academicYearId,
        tenantId,
      },
    });

    if (!academicYear) {
      throw new NotFoundException('Année académique non trouvée');
    }

    // 3. Vérifier que l'année fournie est bien l'année courante (cohérence)
    if (academicYear.id !== currentYear.id) {
      throw new BadRequestException(
        `Impossible de créer des classes pour une année non courante. ` +
        `L'année courante est "${currentYear.name}".`
      );
    }

    // Filtrer les classes à créer
    const classesToCreate = selectedClasses && selectedClasses.length > 0
      ? DEFAULT_CLASSES.filter(c => selectedClasses.includes(c.name))
      : DEFAULT_CLASSES;

    // 4. VALIDATION PRODUCTION : Détecter les conflits de sections
    // Vérifier pour chaque classe si on risque un conflit
    for (const classTemplate of classesToCreate) {
      const requestedSections = sections?.[classTemplate.name] || [];

      // Si on veut créer 2+ sections (ex: CP1 A et CP1 B)
      if (requestedSections.length > 1) {
        // Vérifier si une classe existe déjà SANS section
        const existingWithoutSection = await this.prisma.class.findFirst({
          where: {
            tenantId,
            academicYearId,
            name: classTemplate.name,
            section: null,
          },
          include: {
            _count: { select: { students: true } },
          },
        });

        if (existingWithoutSection) {
          const studentCount = existingWithoutSection._count.students;
          throw new BadRequestException(
            `❌ Impossible de créer plusieurs sections pour "${classTemplate.name}".\n\n` +
            `Une classe "${classTemplate.name}" existe déjà sans section avec ${studentCount} élève(s).\n\n` +
            `📋 Pour créer des sections (A, B, C...) :\n` +
            `1️⃣ Supprimez d'abord la classe "${classTemplate.name}" existante\n` +
            `   (ou transférez ses ${studentCount} élève(s) vers une autre classe)\n` +
            `2️⃣ Puis recréez avec le nombre correct de sections\n\n` +
            `💡 Astuce : Utilisez le bouton "Transférer les élèves" dans la page Classes`
          );
        }
      }

      // Vérifier les doublons pour les sections individuelles
      for (const section of requestedSections) {
        const existingWithSection = await this.prisma.class.findFirst({
          where: {
            tenantId,
            academicYearId,
            name: classTemplate.name,
            section: section,
          },
        });

        if (existingWithSection) {
          throw new BadRequestException(
            `❌ La classe "${classTemplate.name} ${section}" existe déjà pour l'année "${academicYear.name}".`
          );
        }
      }

      // Si aucune section (count=1), vérifier qu'une classe sans section n'existe pas déjà
      if (requestedSections.length === 0) {
        const existingWithoutSection = await this.prisma.class.findFirst({
          where: {
            tenantId,
            academicYearId,
            name: classTemplate.name,
            section: null,
          },
        });

        if (existingWithoutSection) {
          throw new BadRequestException(
            `❌ La classe "${classTemplate.name}" existe déjà pour l'année "${academicYear.name}".`
          );
        }
      }
    }

    // Créer toutes les classes en parallèle — N×M creates séquentiels → un seul round-trip
    const classCreationPromises = classesToCreate.flatMap((classTemplate) => {
      const classSections = sections?.[classTemplate.name] || [null];
      return classSections.map((section) =>
        this.prisma.class.create({
          data: {
            name: classTemplate.name,
            level: classTemplate.level,
            section: section || undefined,
            order: classTemplate.order,
            capacity: 30,
            studentCount: 0,
            academicYearId: academicYearId,
            academicYear: academicYear.name,
            tenantId: tenantId,
          },
        }),
      );
    });

    const createdClasses = await Promise.all(classCreationPromises);

    return {
      created: createdClasses.length,
      classes: createdClasses,
    };
  }

  /**
   * Conversion automatique intelligente
   * PRODUCTION-READY : Renomme une classe existante et crée de nouvelles sections en une transaction
   *
   * Exemple :
   * - CP1 existe sans section (25 élèves)
   * - Utilisateur veut créer CP1 A et CP1 B
   * - Cette méthode : renomme CP1 → CP1 A + crée CP1 B
   */
  async convertAndCreateClasses(tenantId: string, dto: ConvertAndCreateClassesDto) {
    const { academicYearId, existingClassId, className, sectionsToCreate } = dto;

    // 1. Vérifier que l'année académique existe et est courante
    const academicYear = await this.prisma.academicYear.findFirst({
      where: {
        id: academicYearId,
        tenantId,
        isCurrent: true,
      },
    });

    if (!academicYear) {
      throw new BadRequestException('Année académique non trouvée ou non courante');
    }

    // 2. Vérifier que la classe existante existe et appartient au tenant
    const existingClass = await this.prisma.class.findFirst({
      where: {
        id: existingClassId,
        tenantId,
        academicYearId,
      },
      include: {
        _count: { select: { students: true } },
      },
    });

    if (!existingClass) {
      throw new NotFoundException('Classe existante non trouvée');
    }

    // 3. Vérifier que la classe existante n'a pas déjà de section
    if (existingClass.section) {
      throw new BadRequestException(
        `La classe "${existingClass.name} ${existingClass.section}" a déjà une section. ` +
        `Cette opération ne peut s'appliquer qu'aux classes sans section.`
      );
    }

    // 4. Vérifier qu'on ne crée pas de doublons
    for (const section of sectionsToCreate) {
      const duplicate = await this.prisma.class.findFirst({
        where: {
          tenantId,
          academicYearId,
          name: className,
          section: section,
        },
      });

      if (duplicate) {
        throw new BadRequestException(
          `❌ La classe "${className} ${section}" existe déjà.`
        );
      }
    }

    // 5. Trouver le template de classe pour l'ordre et le niveau
    const classTemplate = DEFAULT_CLASSES.find(c => c.name === className);
    if (!classTemplate) {
      throw new BadRequestException(`Classe "${className}" non reconnue dans le système`);
    }

    // 6. Transaction atomique : tout réussit ou tout échoue
    const result = await this.prisma.$transaction(async (prisma) => {
      // Étape 1 : Renommer la classe existante (ajouter section A)
      const updatedClass = await prisma.class.update({
        where: { id: existingClassId },
        data: { section: sectionsToCreate[0] }, // Première section (généralement "A")
      });

      // Étape 2 : Créer les nouvelles classes pour les autres sections
      const newClasses = [];
      for (let i = 1; i < sectionsToCreate.length; i++) {
        const newClass = await prisma.class.create({
          data: {
            name: className,
            level: classTemplate.level,
            section: sectionsToCreate[i],
            order: classTemplate.order,
            capacity: 30,
            studentCount: 0,
            academicYearId: academicYearId,
            academicYear: academicYear.name,
            tenantId: tenantId,
          },
        });
        newClasses.push(newClass);
      }

      return {
        converted: updatedClass,
        created: newClasses,
      };
    });

    return {
      success: true,
      converted: {
        id: result.converted.id,
        name: result.converted.name,
        section: result.converted.section,
        studentCount: existingClass._count.students,
      },
      created: result.created.map(c => ({
        id: c.id,
        name: c.name,
        section: c.section,
      })),
      totalClasses: 1 + result.created.length,
    };
  }
}
