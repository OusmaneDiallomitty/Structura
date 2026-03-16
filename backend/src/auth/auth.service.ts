import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService }  from '../prisma/prisma.service';
import { EmailService }   from '../email/email.service';
import { CacheService }   from '../cache/cache.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';

/** Champs publics retournés pour les infos de l'école */
const SCHOOL_PUBLIC_SELECT = {
  id: true,
  name: true,
  type: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  country: true,
  logo: true,
  notifMonthlyReport: true,
  notifOverdueAlert: true,
  createdAt: true,
  updatedAt: true,
} as const;

type JwtUserPayload = {
  id: string;
  email: string;
  tenantId: string;
  role: string;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma:                 PrismaService,
    private jwtService:             JwtService,
    private configService:          ConfigService,
    private emailService:           EmailService,
    private cacheService:           CacheService,
    private notificationsService:   NotificationsService,
  ) {}

  async register(registerDto: RegisterDto) {
    // Un directeur ne peut créer qu'une seule école par email.
    // Les membres d'équipe (professeurs, secrétaires…) peuvent partager le même email
    // entre plusieurs établissements — l'unicité est alors limitée au tenant.
    const existingDirector = await this.prisma.user.findFirst({
      where: { email: registerDto.email, role: 'DIRECTOR' },
    });

    if (existingDirector) {
      throw new BadRequestException(
        'Un compte directeur existe déjà avec cet email. Veuillez utiliser une autre adresse email.',
      );
    }

    // Hasher le mot de passe
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Extraire prénom et nom
    const nameParts = registerDto.fullName.trim().split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Créer le tenant et l'utilisateur dans une transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Créer le tenant (organisation)
      const tenant = await tx.tenant.create({
        data: {
          name: registerDto.organizationName,
          type: registerDto.organizationType,
          country: registerDto.country,
          city: registerDto.city,
          phone: registerDto.phone,
          isActive: true,
        },
      });

      // Générer un token de vérification
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      // Créer l'utilisateur (directeur par défaut)
      const user = await tx.user.create({
        data: {
          email: registerDto.email,
          password: hashedPassword,
          firstName,
          lastName,
          phone: registerDto.phone,
          role: 'DIRECTOR',
          tenantId: tenant.id,
          emailVerified: false,
          emailVerificationToken: verificationToken,
          emailVerificationExpiry: verificationTokenExpiry,
          onboardingCompleted: false,
          isActive: true,
        },
      });

      return { user, tenant };
    });

    // Envoyer l'email de vérification (async, ne pas bloquer la réponse)
    this.emailService
      .sendVerificationEmail(result.user.email, result.user.emailVerificationToken, result.user.firstName)
      .catch((error) => {
        this.logger.error('Failed to send verification email', error);
      });

    // Journal d'audit — nouvelle école inscrite
    this.prisma.auditLog.create({
      data: {
        action:     'NEW_TENANT',
        tenantId:   result.tenant.id,
        tenantName: result.tenant.name,
        details:    { directorEmail: result.user.email, country: result.tenant.country, city: result.tenant.city },
      },
    }).catch(() => {});

    // Générer les tokens
    const tokens = await this.generateTokens(result.user);

    // Retourner la réponse (sans le password!)
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        role: result.user.role.toLowerCase(),
        tenantId: result.user.tenantId,
        schoolName: result.tenant.name,
        schoolLogo: result.tenant.logo ?? null,
        phone: result.user.phone,
        avatar: result.user.avatar,
        emailVerified: result.user.emailVerified,
        isActive: result.user.isActive,
        permissions: result.user.permissions ?? null,
        classAssignments: result.user.classAssignments ?? [],
        createdAt: result.user.createdAt,
        updatedAt: result.user.updatedAt,
      },
      ...tokens,
    };
  }

  async login(loginDto: LoginDto, loginContext?: { ip: string; userAgent: string }) {
    // Récupérer tous les comptes associés à cet email (peut en exister plusieurs
    // si un utilisateur enseigne dans plusieurs établissements).
    const candidates = await this.prisma.user.findMany({
      where: { email: loginDto.email },
      include: { tenant: true },
    });

    if (candidates.length === 0) {
      this.logSecurityEvent('LOGIN_FAILED', loginDto.email, null, 'Email inconnu').catch(() => {});
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Identifier le compte dont le hash de mot de passe correspond.
    // Chaque établissement impose un mot de passe distinct → un seul match possible.
    let matchedUser: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      const valid = await bcrypt.compare(loginDto.password, candidate.password);
      if (valid) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      this.logSecurityEvent('LOGIN_FAILED', loginDto.email, null, 'Mot de passe incorrect').catch(() => {});
      throw new UnauthorizedException('Email ou mot de passe incorrect');
    }

    // Vérifications de sécurité sur le compte correspondant
    if (!matchedUser.emailVerified) {
      throw new UnauthorizedException('Veuillez vérifier votre adresse email avant de vous connecter');
    }

    if (!matchedUser.isActive) {
      throw new UnauthorizedException('Votre compte a été désactivé');
    }

    if (!matchedUser.tenant.isActive) {
      throw new UnauthorizedException('Votre organisation a été désactivée');
    }

    // ─── Option B : approbation requise si session active sur un autre appareil ────
    // Si une session existait déjà, bloquer l'accès et envoyer un email d'approbation.
    // L'ancien appareil garde sa session intacte jusqu'à la décision (Approuver/Refuser).
    // Exception : SUPER_ADMIN bypass — contrôle du système, pas besoin d'auto-approbation.
    const hadActiveSession = !!matchedUser.currentSessionId;
    const isSuperAdmin = matchedUser.role === 'SUPER_ADMIN';
    const isDevMode = this.configService.get('NODE_ENV') === 'development';

    if (hadActiveSession && loginContext && !isSuperAdmin && !isDevMode) {
      const pendingToken = crypto.randomUUID();
      const loginTime    = new Date().toLocaleString('fr-FR', { timeZone: 'Africa/Conakry' });

      // Stocker le pending token en BDD (indépendant de Redis) — TTL 10 min
      // Effacer le code d'échange d'un éventuel ancien cycle d'approbation
      const expiry = new Date(Date.now() + 10 * 60 * 1000);
      await this.prisma.user.update({
        where: { id: matchedUser.id },
        data:  { pendingLoginToken: pendingToken, pendingLoginExpiry: expiry, pendingExchangeCode: null },
      });

      const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
      const approveUrl  = `${frontendUrl}/approve-login?token=${pendingToken}`;
      const denyUrl     = `${frontendUrl}/deny-login?token=${pendingToken}`;

      this.emailService.sendLoginApprovalEmail(
        matchedUser.email,
        matchedUser.firstName,
        loginContext.ip,
        loginContext.userAgent,
        approveUrl,
        denyUrl,
        loginTime,
      ).catch(() => {});

      return { status: 'PENDING_APPROVAL', pendingToken };
    }

    // ─── Première connexion (aucune session active) → générer JWT directement ────
    const tokens      = await this.generateTokens(matchedUser);
    const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');

    const isFirstLogin = !matchedUser.lastLoginAt;

    await this.prisma.user.update({
      where: { id: matchedUser.id },
      data: {
        lastLoginAt:      new Date(),
        currentSessionId: tokens.sessionId,
        refreshTokenHash: refreshHash,
      },
    });

    // Notifier les directeurs quand un membre active son compte pour la première fois
    if (isFirstLogin && matchedUser.role !== 'DIRECTOR' && matchedUser.role !== 'SUPER_ADMIN') {
      this.notificationsService.notifyDirectors(
        matchedUser.tenantId,
        'MEMBER_ACTIVATED',
        'Compte activé',
        `${matchedUser.firstName} ${matchedUser.lastName} a activé son compte et s'est connecté(e).`,
        '/dashboard/team',
      ).catch(() => {});
    }

    return {
      user: {
        id:               matchedUser.id,
        email:            matchedUser.email,
        firstName:        matchedUser.firstName,
        lastName:         matchedUser.lastName,
        role:             matchedUser.role.toLowerCase(),
        tenantId:         matchedUser.tenantId,
        schoolName:       matchedUser.tenant?.name ?? null,
        schoolLogo:       matchedUser.tenant?.logo ?? null,
        phone:            matchedUser.phone,
        avatar:           matchedUser.avatar,
        emailVerified:    matchedUser.emailVerified,
        isActive:         matchedUser.isActive,
        permissions:      matchedUser.permissions ?? null,
        classAssignments: matchedUser.classAssignments ?? [],
        createdAt:        matchedUser.createdAt,
        updatedAt:        matchedUser.updatedAt,
      },
      token:        tokens.token,
      refreshToken: tokens.refreshToken,
      expiresIn:    tokens.expiresIn,
    };
  }

  /**
   * Déconnexion — invalide immédiatement la session et le refresh token.
   * Après logout, tout JWT existant est rejeté par la JwtStrategy (sessionId null).
   */
  async logout(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { currentSessionId: null, refreshTokenHash: null },
    });
  }

  /**
   * Révocation de session via lien email (Option A — "Ce n'était pas moi").
   * Le token est à usage unique, stocké dans Redis avec TTL 24h.
   */
  async revokeSession(token: string): Promise<void> {
    if (!token || token.length < 10) {
      throw new UnauthorizedException('Token de révocation invalide');
    }
    const key = `revoke:${token}`;
    const stored = await this.cacheService.get<{ userId: string }>(key);
    if (!stored?.userId) {
      throw new UnauthorizedException('Token de révocation invalide ou expiré');
    }
    // Usage unique — supprimer immédiatement
    await this.cacheService.del(key);
    // Révoquer la session
    await this.prisma.user.update({
      where: { id: stored.userId },
      data: { currentSessionId: null, refreshTokenHash: null },
    });
    // Log audit
    this.logSecurityEvent('SESSION_REVOKED_BY_EMAIL', null, null, `Session révoquée via lien email pour userId: ${stored.userId}`).catch(() => {});
  }

  // ─── Approbation de connexion (Option B — code d'échange) ────────────────
  //
  // Flux sécurisé :
  //   1. login() → génère pendingLoginToken en BDD + envoie email
  //   2. checkApproval() ← poll toutes les 3s depuis /pending-approval
  //   3. approveLogin() ← clic email → génère un code d'échange court (UUID)
  //      → Redis `approved_login:{pendingToken}` = { code } (TTL 700s)
  //      → BDD `pendingExchangeCode` = code (fallback si Redis down)
  //   4. checkApproval() retourne { status: 'approved', code }  (jamais de JWT)
  //   5. exchangeCode() ← frontend → échange le code contre les vrais JWT
  //      → code consommé (détruit) immédiatement
  //      → JWT jamais stocké en BDD
  //
  // Sécurité : un code UUID seul est inutilisable sans l'endpoint /exchange.

  /**
   * Poll : vérifie si la demande de connexion en attente a été approuvée ou refusée.
   * Retourne { status, code } — jamais les tokens JWT directement.
   */
  async checkApproval(pendingToken: string) {
    if (!pendingToken || pendingToken.length < 10) {
      return { status: 'expired' };
    }

    // Résultat "approuvé" disponible dans Redis (mis par approveLogin)
    const approved = await this.cacheService.get<{ code: string }>(`approved_login:${pendingToken}`);
    if (approved?.code) {
      return { status: 'approved', code: approved.code };
    }

    // Résultat "refusé" disponible dans Redis (mis par denyLogin)
    const denied = await this.cacheService.get<any>(`denied_login:${pendingToken}`);
    if (denied) {
      return { status: 'denied' };
    }

    // Vérifier en BDD que le pendingLoginToken est encore valide
    const userByToken = await this.prisma.user.findUnique({
      where: { pendingLoginToken: pendingToken },
    });

    if (!userByToken) {
      return { status: 'expired' };
    }

    if (!userByToken.pendingLoginExpiry || userByToken.pendingLoginExpiry < new Date()) {
      // Expiré — nettoyer en fire-and-forget
      this.prisma.user.update({
        where: { id: userByToken.id },
        data:  { pendingLoginToken: null, pendingLoginExpiry: null, pendingExchangeCode: null },
      }).catch(() => {});
      return { status: 'expired' };
    }

    // Fallback BDD : approveLogin() a posé le code en BDD (Redis était indisponible)
    if (userByToken.pendingExchangeCode) {
      return { status: 'approved', code: userByToken.pendingExchangeCode };
    }

    return { status: 'pending' };
  }

  /**
   * Approuver la connexion : génère un code d'échange court (UUID), PAS les tokens JWT.
   * Les tokens sont générés plus tard dans exchangeCode() au moment de l'échange.
   * Appelé via le lien "Approuver" dans l'email.
   */
  async approveLogin(pendingToken: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { pendingLoginToken: pendingToken },
    });

    if (!user || !user.pendingLoginExpiry || user.pendingLoginExpiry < new Date()) {
      throw new BadRequestException("Lien d'approbation invalide ou expiré");
    }

    if (!user.isActive) throw new UnauthorizedException('Compte invalide');

    // Idempotence : si le code existe déjà, ré-émettre en Redis et retourner
    // (évite de créer un second code si l'utilisateur clique deux fois sur Approuver)
    if (user.pendingExchangeCode) {
      await this.cacheService.set(
        `approved_login:${pendingToken}`,
        { code: user.pendingExchangeCode },
        700,
      );
      return;
    }

    // Générer le code d'échange (TTL 2 min — très court, échangé quasi-instantanément)
    const exchangeCode = crypto.randomUUID();

    // Redis : le poll checkApproval() le lit pour retourner { status: 'approved', code }
    await this.cacheService.set(`approved_login:${pendingToken}`, { code: exchangeCode }, 700);

    // BDD : fallback si Redis était down pendant le set ci-dessus
    // Seul le code (UUID) est stocké — jamais les tokens JWT
    await this.prisma.user.update({
      where: { id: user.id },
      data:  { pendingExchangeCode: exchangeCode },
    });

    this.logSecurityEvent('LOGIN_APPROVED', user.email, user.tenantId, 'Connexion approuvée via email').catch(() => {});
  }

  /**
   * Échange le code à usage unique contre les vrais tokens JWT.
   * Le code est détruit immédiatement après l'échange (usage unique).
   * C'est ici que la session est créée — jamais dans approveLogin().
   */
  async exchangeCode(code: string) {
    if (!code || code.length < 10) {
      throw new BadRequestException('Code invalide');
    }

    // Retrouver l'utilisateur par son code d'échange (champ @unique en BDD)
    // Cette requête BDD est la source de vérité — Redis n'est pas nécessaire ici.
    const user = await this.prisma.user.findUnique({
      where:   { pendingExchangeCode: code },
      include: { tenant: true },
    });

    if (!user) {
      throw new BadRequestException('Code invalide ou déjà utilisé');
    }

    if (!user.isActive || !user.tenant?.isActive) {
      throw new UnauthorizedException('Compte ou organisation désactivé');
    }

    // Consommer le code immédiatement (usage unique, atomique via @unique constraint)
    // Après cette ligne, tout autre appel avec le même code retournera "not found"
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        pendingExchangeCode: null,
        pendingLoginToken:   null,
        pendingLoginExpiry:  null,
      },
    });

    // Nettoyer Redis (best-effort)
    this.cacheService.del(`approved_login:${user.pendingLoginToken ?? ''}`).catch(() => {});

    // Générer les tokens JWT + mettre à jour la session maintenant
    const tokens      = await this.generateTokens(user);
    const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');

    await this.prisma.user.update({
      where: { id: user.id },
      data:  { lastLoginAt: new Date(), currentSessionId: tokens.sessionId, refreshTokenHash: refreshHash },
    });

    this.logSecurityEvent('LOGIN_EXCHANGED', user.email, user.tenantId, 'Code échangé — session créée').catch(() => {});

    return {
      user: {
        id:               user.id,
        email:            user.email,
        firstName:        user.firstName,
        lastName:         user.lastName,
        role:             user.role.toLowerCase(),
        tenantId:         user.tenantId,
        schoolName:       user.tenant?.name ?? null,
        schoolLogo:       user.tenant?.logo ?? null,
        phone:            user.phone,
        avatar:           user.avatar,
        emailVerified:    user.emailVerified,
        isActive:         user.isActive,
        permissions:      user.permissions ?? null,
        classAssignments: user.classAssignments ?? [],
        createdAt:        user.createdAt,
        updatedAt:        user.updatedAt,
      },
      token:        tokens.token,
      refreshToken: tokens.refreshToken,
      expiresIn:    tokens.expiresIn,
    };
  }

  /**
   * Refuser la connexion : efface le pending token en BDD.
   * Appelé via le lien "Refuser" dans l'email.
   */
  async denyLogin(pendingToken: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { pendingLoginToken: pendingToken },
    });

    if (!user || !user.pendingLoginExpiry || user.pendingLoginExpiry < new Date()) {
      throw new BadRequestException('Lien de refus invalide ou expiré');
    }

    // Stocker "denied" dans Redis (5 min) — le poll distingue denied vs expired
    await this.cacheService.set(`denied_login:${pendingToken}`, { status: 'denied' }, 300);

    // Effacer le pending token + code d'échange en BDD
    await this.prisma.user.update({
      where: { id: user.id },
      data:  { pendingLoginToken: null, pendingLoginExpiry: null, pendingExchangeCode: null },
    });

    this.logSecurityEvent('LOGIN_DENIED', user.email, user.tenantId, 'Connexion refusée via email').catch(() => {});
  }

  /**
   * Log un événement de sécurité dans AuditLog — fire-and-forget.
   */
  private async logSecurityEvent(
    action: string,
    actorEmail: string | null,
    tenantId: string | null,
    details: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        action,
        actorEmail,
        tenantId,
        details: { message: details, timestamp: new Date().toISOString() },
      },
    });
  }

  async refreshToken(refreshToken: string) {
    try {
      // Vérifier la signature JWT avec le secret dédié
      const payload = this.jwtService.verify<{
        userId: string;
        email: string;
        tenantId: string;
        role: string;
        sessionId: string;
      }>(refreshToken, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      });

      // Vérifier que l'utilisateur existe toujours et est actif
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedException('Utilisateur invalide ou désactivé');
      }

      // Vérifier que le refresh token correspond à celui stocké en BDD (révocation possible)
      const incomingHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      if (!user.refreshTokenHash || user.refreshTokenHash !== incomingHash) {
        this.logSecurityEvent('REFRESH_TOKEN_REUSE', user.email, user.tenantId, 'Refresh token invalide ou déjà révoqué').catch(() => {});
        throw new UnauthorizedException('SESSION_INVALIDATED');
      }

      // Vérifier que la session est toujours active (non révoquée par un autre login)
      if (!user.currentSessionId || user.currentSessionId !== payload.sessionId) {
        throw new UnauthorizedException('SESSION_INVALIDATED');
      }

      // Rotation : générer de nouveaux tokens + invalider l'ancien refresh token
      const tokens = await this.generateTokens(user);
      const newRefreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');
      await this.prisma.user.update({
        where: { id: user.id },
        data: { currentSessionId: tokens.sessionId, refreshTokenHash: newRefreshHash },
      });

      return { token: tokens.token, refreshToken: tokens.refreshToken, expiresIn: tokens.expiresIn };
    } catch (err: any) {
      if (err?.message === 'SESSION_INVALIDATED') {
        throw new UnauthorizedException('SESSION_INVALIDATED');
      }
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }
  }

  private async generateTokens(user: JwtUserPayload) {
    // Nouvel identifiant de session unique — invalide tous les tokens précédents
    const sessionId = crypto.randomUUID();

    const payload = {
      userId: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
      sessionId,
    };

    const token = this.jwtService.sign(payload);

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get('JWT_REFRESH_SECRET'),
      expiresIn: this.configService.get('JWT_REFRESH_EXPIRES_IN') || '7d',
    });

    return { token, refreshToken, expiresIn: 3600, sessionId };
  }

  /**
   * Verify user email with token
   */
  async verifyEmail(token: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        emailVerificationToken: token,
        emailVerificationExpiry: {
          gte: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Token de vérification invalide ou expiré');
    }

    // Mettre à jour l'utilisateur
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerificationToken: null,
        emailVerificationExpiry: null,
      },
    });

    // Envoyer l'email de bienvenue
    this.emailService
      .sendWelcomeEmail(user.email, user.firstName)
      .catch((error) => {
        this.logger.error('Failed to send welcome email', error);
      });

    return {
      message: 'Email vérifié avec succès',
      emailVerified: true,
    };
  }

  /**
   * Request password reset
   */
  async requestPasswordReset(email: string) {
    // findFirst car email n'est plus globalement unique — les directeurs restent uniques
    // par email (contrôlé à l'inscription) mais par sécurité on prend le premier compte trouvé.
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      // Ne pas révéler si l'email existe ou non (sécurité)
      return {
        message: 'Si cet email existe, un lien de réinitialisation a été envoyé',
      };
    }

    // Générer un token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000); // 1h

    // Sauvegarder le token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetExpiry: resetTokenExpiry,
      },
    });

    // Envoyer l'email
    this.emailService
      .sendPasswordResetEmail(user.email, resetToken, user.firstName)
      .catch((error) => {
        this.logger.error('Failed to send password reset email', error);
      });

    return {
      message: 'Si cet email existe, un lien de réinitialisation a été envoyé',
    };
  }

  /**
   * Accept invitation and set password (first login for team members).
   * Returns JWT tokens for automatic login after setup.
   *
   * Sécurité multi-école :
   * - Si l'utilisateur possède déjà un compte dans une autre école (même email),
   *   le nouveau mot de passe DOIT être différent de tous ses mots de passe existants.
   * - Le token d'invitation est invalidé après cette opération (passwordResetToken → null).
   * - lastLoginAt est mis à jour : marque la première connexion effective.
   */
  async acceptInvite(token: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: { gte: new Date() },
      },
      include: { tenant: true },
    });

    if (!user) {
      throw new BadRequestException("Lien d'invitation invalide ou expiré");
    }

    // Vérifier que le mot de passe choisi n'est pas déjà utilisé dans une autre école.
    // Permet à l'utilisateur d'avoir des comptes distincts tout en empêchant la réutilisation
    // (le login disambiguïse les comptes par mot de passe — ils doivent donc tous être uniques).
    const otherAccounts = await this.prisma.user.findMany({
      where: {
        email: user.email,
        id: { not: user.id },         // exclure le compte en cours d'activation
        onboardingCompleted: true,     // uniquement les comptes déjà activés
      },
      select: { password: true, tenant: { select: { name: true } } },
    });

    for (const other of otherAccounts) {
      const isSamePassword = await bcrypt.compare(password, other.password);
      if (isSamePassword) {
        throw new BadRequestException(
          'Ce mot de passe est déjà utilisé dans un autre établissement. ' +
          'Veuillez en choisir un différent pour distinguer vos comptes.',
        );
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Générer les tokens AVANT l'update pour obtenir sessionId et refreshTokenHash.
    // Sans ça, currentSessionId reste null en BDD et la JwtStrategy rejette
    // toutes les requêtes suivantes avec SESSION_INVALIDATED.
    const tokens      = await this.generateTokens({ id: user.id, email: user.email, tenantId: user.tenantId, role: user.role });
    const refreshHash = crypto.createHash('sha256').update(tokens.refreshToken).digest('hex');

    // Invalider le token d'invitation + ouvrir la session en une seule écriture
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password:            hashedPassword,
        passwordResetToken:  null,
        passwordResetExpiry: null,
        onboardingCompleted: true,
        lastLoginAt:         new Date(),
        currentSessionId:    tokens.sessionId,   // ← manquait : cause du SESSION_INVALIDATED
        refreshTokenHash:    refreshHash,         // ← manquait : refresh token inutilisable
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role.toLowerCase(),
        tenantId: user.tenantId,
        schoolName: user.tenant?.name ?? null,
        schoolLogo: user.tenant?.logo ?? null,
        phone: user.phone,
        avatar: user.avatar,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
        permissions: user.permissions ?? null,
        classAssignments: user.classAssignments ?? [],
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      ...tokens,
    };
  }

  /**
   * Reset password with token
   */
  async resetPassword(token: string, newPassword: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpiry: {
          gte: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Token de réinitialisation invalide ou expiré');
    }

    // Hasher le nouveau mot de passe
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Mettre à jour le mot de passe
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpiry: null,
      },
    });

    return {
      message: 'Mot de passe réinitialisé avec succès',
    };
  }

  // ─── Gestion du compte connecté ──────────────────────────────────────────

  /**
   * Changer son mot de passe en étant authentifié.
   * Vérifie le mot de passe actuel avant de mettre à jour.
   * Limite : le nouveau mot de passe doit être différent de l'ancien.
   */
  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur non trouvé');

    const isValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!isValid) {
      throw new BadRequestException('Mot de passe actuel incorrect');
    }

    const isSame = await bcrypt.compare(dto.newPassword, user.password);
    if (isSame) {
      throw new BadRequestException('Le nouveau mot de passe doit être différent de l\'ancien');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    // Révoquer la session active — force la reconnexion avec le nouveau mot de passe
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed, currentSessionId: null, refreshTokenHash: null },
    });

    return { message: 'Mot de passe modifié avec succès. Veuillez vous reconnecter.' };
  }

  // ─── Informations de l'école (tenant) ────────────────────────────────────

  /**
   * Récupérer les informations publiques du tenant (école).
   * Accessible à tous les utilisateurs authentifiés du tenant.
   */
  async getSchoolInfo(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: SCHOOL_PUBLIC_SELECT,
    });

    if (!tenant) throw new NotFoundException('Organisation non trouvée');
    return tenant;
  }

  /**
   * Mettre à jour les informations du tenant (école).
   * Réservé au rôle DIRECTOR.
   * Si le nom de l'école change, met à jour le nom dans le localStorage via la réponse.
   */
  async updateSchoolInfo(tenantId: string, dto: UpdateSchoolDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Organisation non trouvée');

    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.name              !== undefined && { name:               dto.name              }),
        ...(dto.email             !== undefined && { email:              dto.email             }),
        ...(dto.phone             !== undefined && { phone:              dto.phone             }),
        ...(dto.address           !== undefined && { address:            dto.address           }),
        ...(dto.city              !== undefined && { city:               dto.city              }),
        ...(dto.notifMonthlyReport !== undefined && { notifMonthlyReport: dto.notifMonthlyReport }),
        ...(dto.notifOverdueAlert  !== undefined && { notifOverdueAlert:  dto.notifOverdueAlert  }),
      },
      select: SCHOOL_PUBLIC_SELECT,
    });
  }

  // ─── Logo de l'école ──────────────────────────────────────────────────────

  async uploadLogo(tenantId: string, file: any, uploadService: any): Promise<{ logo: string }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { logo: true } });
    if (!tenant) throw new NotFoundException('Organisation non trouvée');
    if (tenant.logo) await uploadService.deleteByUrl(tenant.logo);
    const url = await uploadService.uploadLogo(tenantId, file);
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { logo: url } });
    return { logo: url };
  }

  async deleteLogo(tenantId: string, uploadService: any): Promise<{ message: string }> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { logo: true } });
    if (!tenant) throw new NotFoundException('Organisation non trouvée');
    if (tenant.logo) await uploadService.deleteByUrl(tenant.logo);
    await this.prisma.tenant.update({ where: { id: tenantId }, data: { logo: null } });
    return { message: 'Logo supprimé.' };
  }

  // ─── Configuration des frais de scolarité (tenant) ──────────────────────

  /**
   * Retourne la configuration des frais du tenant.
   * Accessible à tous les rôles authentifiés (le comptable doit pouvoir lire
   * les frais pour calculer les montants à encaisser).
   */
  async getFeesConfig(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { feeConfig: true, paymentFrequency: true, schoolCalendar: true },
    });
    if (!tenant) throw new NotFoundException('Organisation non trouvée');
    return {
      feeConfig:        tenant.feeConfig        ?? null,
      paymentFrequency: tenant.paymentFrequency  ?? 'monthly',
      schoolCalendar:   tenant.schoolCalendar    ?? null,
    };
  }

  /**
   * Met à jour la configuration des frais du tenant.
   * Réservé au DIRECTOR ou à un membre avec permission payments.configure = true.
   * Tous les utilisateurs du tenant verront immédiatement la nouvelle configuration.
   */
  async updateFeesConfig(tenantId: string, dto: import('./dto/update-fees.dto').UpdateFeesDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Organisation non trouvée');

    // JSON.parse(JSON.stringify()) sérialise en JSON pur compatible avec Prisma InputJsonValue
    return this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...(dto.feeConfig        !== undefined && {
          feeConfig: JSON.parse(JSON.stringify(dto.feeConfig)) as Prisma.InputJsonObject,
        }),
        ...(dto.paymentFrequency !== undefined && { paymentFrequency: dto.paymentFrequency }),
        ...(dto.schoolCalendar   !== undefined && {
          schoolCalendar: JSON.parse(JSON.stringify(dto.schoolCalendar)) as Prisma.InputJsonObject,
        }),
      },
      select: { feeConfig: true, paymentFrequency: true, schoolCalendar: true },
    });
  }

  /**
   * Resend verification email
   */
  async resendVerificationEmail(email: string) {
    // Email non globalement unique → findFirst (uniquement les directeurs s'inscrivent par email)
    const user = await this.prisma.user.findFirst({
      where: { email },
    });

    // Réponse générique : ne pas révéler si l'email existe ou non (anti-énumération)
    if (!user || user.emailVerified) {
      return { message: 'Si cet email existe et n\'est pas encore vérifié, un email a été envoyé' };
    }

    // Générer un nouveau token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationTokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // Mettre à jour le token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpiry: verificationTokenExpiry,
      },
    });

    // Fire-and-forget : ne bloque pas la réponse HTTP
    this.emailService
      .sendVerificationEmail(user.email, verificationToken, user.firstName)
      .catch((error) => this.logger.error('Failed to resend verification email', error));

    return {
      message: 'Email de vérification renvoyé',
    };
  }

  // ─── Impersonation exchange ────────────────────────────────────────────────

  /**
   * Échange un code d'impersonation opaque contre le JWT correspondant.
   * Le code est supprimé immédiatement (usage unique, TTL Redis 2min).
   */
  async exchangeImpersonationCode(code: string): Promise<{ token: string }> {
    if (!code || code.length < 10) {
      throw new UnauthorizedException('Code d\'impersonation invalide');
    }
    const key    = `impersonate:${code}`;
    const stored = await this.cacheService.get<{ token: string }>(key);

    if (!stored?.token) {
      throw new UnauthorizedException('Code d\'impersonation invalide ou expiré');
    }

    // Suppression immédiate — usage unique
    await this.cacheService.del(key);

    return { token: stored.token };
  }
}
