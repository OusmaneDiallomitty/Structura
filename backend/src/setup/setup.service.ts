import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  SchoolType,
  getTemplateByType,
  getAllTemplates,
  SchoolTemplate,
} from './templates/school-templates';

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Obtenir tous les templates disponibles
   */
  async getAvailableTemplates(): Promise<SchoolTemplate[]> {
    return getAllTemplates();
  }

  /**
   * Appliquer un template d'école (créer les classes automatiquement)
   */
  async applyTemplate(templateType: SchoolType, tenantId: string) {
    this.logger.log(`Applying template ${templateType} for tenant ${tenantId}`);

    const template = getTemplateByType(templateType);

    if (!template) {
      throw new Error(`Template ${templateType} not found`);
    }

    // Créer toutes les classes du template
    const createdClasses = await Promise.all(
      template.classes.map((classTemplate) =>
        this.prisma.class.create({
          data: {
            name: classTemplate.name,
            level: classTemplate.level,
            section: classTemplate.section,
            capacity: classTemplate.capacity,
            studentCount: 0,
            academicYear: this.getCurrentAcademicYear(),
            tenantId,
          },
        }),
      ),
    );

    this.logger.log(
      `Created ${createdClasses.length} classes for tenant ${tenantId}`,
    );

    return {
      template: template.displayName,
      classesCreated: createdClasses.length,
      classes: createdClasses,
    };
  }

  /**
   * Marquer l'onboarding comme complété pour un user
   */
  async completeOnboarding(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { onboardingCompleted: true },
    });
  }

  /**
   * Vérifier si l'onboarding est complété
   */
  async isOnboardingCompleted(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true },
    });

    return user?.onboardingCompleted ?? false;
  }

  /**
   * Obtenir l'année académique actuelle (format: YYYY-YYYY+1)
   */
  private getCurrentAcademicYear(): string {
    const now = new Date();
    const year = now.getFullYear();
    // Si on est après septembre, c'est l'année suivante
    const startYear = now.getMonth() >= 8 ? year : year - 1;
    return `${startYear}-${startYear + 1}`;
  }
}
