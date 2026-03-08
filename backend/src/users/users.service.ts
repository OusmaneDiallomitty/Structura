import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { AssignClassesDto } from './dto/assign-classes.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

/** Champs retournés publiquement (jamais le mot de passe) */
const USER_PUBLIC_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  permissions: true,
  classAssignments: true,
  isActive: true,
  emailVerified: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  // ── Profil personnel ──────────────────────────────────────────────────────

  /**
   * Retourne le profil complet de l'utilisateur connecté.
   * Inclut classAssignments et taughtClasses pour que les pages
   * frontend (présences, notes) puissent filtrer les classes/matières en temps réel.
   */
  async getOwnProfile(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...USER_PUBLIC_SELECT,
        taughtClasses: {
          select: { id: true, name: true, level: true, section: true },
        },
      },
    });
  }

  /**
   * Met à jour le prénom, nom ou téléphone de l'utilisateur connecté.
   * Ni le rôle ni l'email ne peuvent être modifiés via cet endpoint.
   */
  async updateOwnProfile(userId: string, dto: UpdateProfileDto) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName  !== undefined && { lastName:  dto.lastName  }),
        ...(dto.phone     !== undefined && { phone:     dto.phone     }),
      },
      select: USER_PUBLIC_SELECT,
    });
  }

  // ── Méthodes internes utilisées par Auth ──────────────────────────────────

  /**
   * Recherche par email (non unique globalement depuis la migration multi-tenant).
   * Retourne le premier compte correspondant — utilisé en interne uniquement.
   * Pour la résolution d'ambiguïté login, préférer auth.service.ts qui parcourt
   * tous les candidats et compare les mots de passe.
   */
  async findByEmail(email: string) {
    return this.prisma.user.findFirst({
      where: { email },
      include: { tenant: true },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { tenant: true },
    });
  }

  // ── Gestion de l'équipe (multi-tenant) ───────────────────────────────────

  /**
   * Liste tous les membres de l'équipe du tenant.
   */
  async getTeamMembers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: {
        ...USER_PUBLIC_SELECT,
        taughtClasses: {
          select: { id: true, name: true, level: true, section: true },
        },
      },
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
    });
  }

  /**
   * Crée un nouveau membre d'équipe dans le tenant.
   * Génère un mot de passe temporaire et envoie un email d'invitation.
   * Seul le DIRECTOR peut appeler cette méthode (contrôlé par le guard).
   */
  async createTeamMember(tenantId: string, dto: CreateTeamMemberDto) {
    // Un email déjà enregistré comme directeur ne peut pas devenir membre d'équipe.
    // Un directeur gère sa propre école — son email est réservé à ce compte.
    const isDirectorElsewhere = await this.prisma.user.findFirst({
      where: { email: dto.email, role: 'DIRECTOR' },
    });
    if (isDirectorElsewhere) {
      throw new BadRequestException(
        "Cet email est déjà enregistré comme directeur d'une école. " +
        'Il ne peut pas être ajouté comme membre d\'équipe.',
      );
    }

    // Unicité email par tenant (un même prof peut enseigner dans plusieurs écoles)
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.email, tenantId },
    });
    if (existing) {
      throw new BadRequestException(
        'Cet email est déjà utilisé dans votre établissement',
      );
    }

    // Récupérer le nom de l'école pour l'email d'invitation
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true },
    });

    // Token d'invitation sécurisé (valide 7 jours) — stocké dans passwordResetToken
    const inviteToken = crypto.randomBytes(32).toString('hex');
    const inviteTokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Mot de passe aléatoire (jamais communiqué, sera remplacé lors de l'activation)
    const tempPassword = crypto.randomBytes(16).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await this.prisma.user.create({
      data: {
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        password: hashedPassword,
        phone: dto.phone ?? null,
        role: dto.role.toUpperCase(),
        tenantId,
        // Le directeur ajoute directement → email déjà vérifié
        emailVerified: true,
        isActive: true,
        onboardingCompleted: true,
        // Token d'activation du compte
        passwordResetToken: inviteToken,
        passwordResetExpiry: inviteTokenExpiry,
      },
      select: {
        ...USER_PUBLIC_SELECT,
        taughtClasses: {
          select: { id: true, name: true, level: true, section: true },
        },
      },
    });

    // Email d'invitation avec lien d'activation
    // On attend l'envoi pour pouvoir informer le directeur en cas d'échec.
    let emailSent = false;
    try {
      await this.emailService.sendTeamInvitationEmail(
        user.email,
        user.firstName,
        tenant?.name ?? 'votre établissement',
        inviteToken,
      );
      emailSent = true;
    } catch (err) {
      // On ne bloque pas la création du compte : le directeur peut renvoyer l'invitation
      console.error(`[Users] Échec envoi email invitation pour ${user.email}:`, err instanceof Error ? err.message : err);
    }

    return { ...user, emailSent };
  }

  /**
   * Met à jour le rôle, statut ou coordonnées d'un membre.
   * Un directeur ne peut pas modifier son propre rôle ni se désactiver.
   */
  async updateTeamMember(
    tenantId: string,
    currentUserId: string,
    id: string,
    dto: UpdateTeamMemberDto,
  ) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('Membre non trouvé');

    if (id === currentUserId && dto.isActive === false) {
      throw new ForbiddenException('Vous ne pouvez pas désactiver votre propre compte');
    }
    if (id === currentUserId && dto.role) {
      throw new ForbiddenException('Vous ne pouvez pas modifier votre propre rôle');
    }

    // Si le rôle passe de TEACHER vers un autre rôle, déassigner toutes les classes.
    // Cela évite des données orphelines (classe avec teacherId pointant vers un non-TEACHER).
    if (user.role === 'TEACHER' && dto.role && dto.role.toUpperCase() !== 'TEACHER') {
      await this.prisma.class.updateMany({
        where: { teacherId: id, tenantId },
        data: { teacherId: null },
      });
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.firstName                  && { firstName: dto.firstName }),
        ...(dto.lastName                   && { lastName:  dto.lastName  }),
        ...(dto.phone   !== undefined       && { phone:     dto.phone     }),
        ...(dto.role                       && { role:       dto.role.toUpperCase() }),
        ...(dto.isActive !== undefined      && { isActive:   dto.isActive  }),
      },
      select: {
        ...USER_PUBLIC_SELECT,
        taughtClasses: {
          select: { id: true, name: true, level: true, section: true },
        },
      },
    });
  }

  /**
   * Met à jour les permissions personnalisées d'un membre.
   * Un directeur ne peut pas modifier ses propres permissions.
   */
  async updateMemberPermissions(
    tenantId: string,
    currentUserId: string,
    memberId: string,
    dto: UpdatePermissionsDto,
  ) {
    const user = await this.prisma.user.findFirst({ where: { id: memberId, tenantId } });
    if (!user) throw new NotFoundException('Membre non trouvé');

    if (memberId === currentUserId) {
      throw new ForbiddenException('Vous ne pouvez pas modifier vos propres permissions');
    }

    // Sérialiser en JSON pur pour éliminer les prototypes de classe NestJS
    // et garantir que Prisma reçoit un objet JSON-serializable valide.
    const sanitizedPermissions = JSON.parse(JSON.stringify(dto));

    return this.prisma.user.update({
      where: { id: memberId },
      data: { permissions: sanitizedPermissions },
      select: {
        ...USER_PUBLIC_SELECT,
        taughtClasses: {
          select: { id: true, name: true, level: true, section: true },
        },
      },
    });
  }

  /**
   * Assigne des classes à un professeur.
   * Vérifie que toutes les classes appartiennent au tenant (sécurité cross-tenant).
   * Seul un TEACHER peut se voir assigner des classes.
   */
  async assignTeacherClasses(
    tenantId: string,
    currentUserId: string,
    memberId: string,
    dto: AssignClassesDto,
  ) {
    const user = await this.prisma.user.findFirst({ where: { id: memberId, tenantId } });
    if (!user) throw new NotFoundException('Membre non trouvé');

    if (user.role !== 'TEACHER') {
      throw new BadRequestException('Seul un professeur peut se voir assigner des classes');
    }

    // Vérifier que tous les classIds appartiennent au tenant (sécurité cross-tenant)
    if (dto.classIds.length > 0) {
      const classes = await this.prisma.class.findMany({
        where: { id: { in: dto.classIds }, tenantId },
        select: { id: true },
      });
      if (classes.length !== dto.classIds.length) {
        throw new BadRequestException('Une ou plusieurs classes sont invalides ou n\'appartiennent pas à votre établissement');
      }
    }

    // Normaliser le JSON classAssignments : ne garder que les entrées cohérentes avec classIds
    const normalizedAssignments = (dto.classAssignments ?? []).filter(
      (a) => dto.classIds.includes(a.classId),
    );

    // Transaction : déassigner toutes les classes actuelles puis assigner les nouvelles
    await this.prisma.$transaction(async (tx) => {
      // Déassigner toutes les classes actuellement assignées à ce prof
      await tx.class.updateMany({
        where: { teacherId: memberId, tenantId },
        data: { teacherId: null },
      });

      // Assigner les nouvelles classes
      if (dto.classIds.length > 0) {
        await tx.class.updateMany({
          where: { id: { in: dto.classIds }, tenantId },
          data: { teacherId: memberId },
        });
      }

      // Sauvegarder le détail matières par classe dans le champ JSON
      await tx.user.update({
        where: { id: memberId },
        data: {
          classAssignments: normalizedAssignments.length > 0
            ? normalizedAssignments
            : dto.classIds.length > 0
              ? dto.classIds.map((id) => ({ classId: id, subjects: [] }))
              : [],
        },
      });
    });

    return this.prisma.user.findUnique({
      where: { id: memberId },
      select: {
        ...USER_PUBLIC_SELECT,
        taughtClasses: {
          select: { id: true, name: true, level: true, section: true },
        },
      },
    });
  }

  /**
   * Supprime définitivement un membre du tenant.
   * Un directeur ne peut pas se supprimer lui-même.
   */
  async deleteTeamMember(tenantId: string, currentUserId: string, id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!user) throw new NotFoundException('Membre non trouvé');

    if (id === currentUserId) {
      throw new ForbiddenException('Vous ne pouvez pas supprimer votre propre compte');
    }

    await this.prisma.user.delete({ where: { id } });
    return { message: 'Membre supprimé avec succès' };
  }
}
