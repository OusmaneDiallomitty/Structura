import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService }      from '@nestjs/jwt';
import { ConfigService }   from '@nestjs/config';
import { randomUUID }      from 'crypto';
import * as crypto         from 'crypto';
import * as bcrypt         from 'bcryptjs';
import { PrismaService }   from '../prisma/prisma.service';
import { EmailService }    from '../email/email.service';
import { CacheService }    from '../cache/cache.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { ExtendTrialDto }  from './dto/extend-trial.dto';
import { SendReminderDto } from './dto/send-reminder.dto';
import { CreateTenantAdminDto } from './dto/create-tenant-admin.dto';

/** Identifiant interne du tenant admin plateforme — exclu des statistiques */
const ADMIN_SUBDOMAIN = 'structura-admin';

/**
 * Filtre Prisma qui exclut le tenant admin de toutes les requêtes.
 * IMPORTANT : { subdomain: { not: X } } exclut aussi les NULL en SQL.
 * On utilise OR pour inclure les tenants sans subdomain (subdomain: null).
 */
const tenantExcludeAdmin = {
  OR: [
    { subdomain: { not: ADMIN_SUBDOMAIN } },
    { subdomain: null as string | null },
  ],
};

/** Champs retournés dans les listes de tenants */
const TENANT_LIST_SELECT = {
  id: true, name: true, type: true, subdomain: true,
  city: true, country: true, email: true, phone: true, logo: true,
  isActive: true, subscriptionPlan: true, subscriptionStatus: true,
  trialEndsAt: true, currentPeriodEnd: true,
  currentStudentCount: true, currentClassCount: true, currentUserCount: true,
  createdAt: true, updatedAt: true,
};

// ─── Health Score ──────────────────────────────────────────────────────────────

/**
 * Score de santé d'une école (0-100).
 * Indicateur clé pour détecter les écoles à risque de churn.
 *
 *  +40  Connexion d'un utilisateur dans les 3 derniers jours
 *  +25  Connexion dans les 7 derniers jours
 *  +10  Connexion dans les 14 derniers jours
 *  +30  Nombre d'élèves ≥ 10
 *  +20  Nombre d'élèves ≥ 5
 *  +10  Nombre d'élèves ≥ 1
 *  +30  Abonnement ACTIVE ou TRIALING (paiement à jour)
 */
function computeHealthScore(tenant: {
  users: { lastLoginAt: Date | null }[];
  currentStudentCount: number;
  subscriptionStatus: string;
}): number {
  let score = 0;

  // Activité (dernière connexion)
  const lastLogin = tenant.users
    .map((u) => u.lastLoginAt)
    .filter(Boolean)
    .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0];

  if (lastLogin) {
    const days = (Date.now() - (lastLogin as Date).getTime()) / 86_400_000;
    if      (days <= 3)  score += 40;
    else if (days <= 7)  score += 25;
    else if (days <= 14) score += 10;
  }

  // Élèves enregistrés
  const s = tenant.currentStudentCount;
  if      (s >= 10) score += 30;
  else if (s >= 5)  score += 20;
  else if (s >= 1)  score += 10;

  // Statut abonnement
  if (['ACTIVE', 'TRIALING'].includes(tenant.subscriptionStatus)) score += 30;

  return Math.min(100, score);
}

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private prisma:        PrismaService,
    private jwtService:    JwtService,
    private configService: ConfigService,
    private emailService:  EmailService,
    private cacheService:  CacheService,
  ) {}

  /** Écrit dans le journal d'audit de façon fire-and-forget (ne bloque pas). */
  async audit(params: {
    action:      string;
    actorEmail?: string;
    actorId?:    string;
    tenantId?:   string;
    tenantName?: string;
    details?:    Record<string, unknown>;
  }) {
    this.prisma.auditLog.create({
      data: { ...params, details: params.details as any },
    }).catch((e) => this.logger.error(`Audit log failed: ${e.message}`));
  }

  // ─── Stats globales ────────────────────────────────────────────────────────

  async getGlobalStats() {
    // Cache 2 min — 11 requêtes BDD évitées sur chaque appel répété
    const CACHE_KEY = 'admin:stats:global';
    const cached = await this.cacheService.get<object>(CACHE_KEY);
    if (cached) return cached;

    const now           = new Date();
    const startOfMonth  = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfWeek   = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);

    const [
      totalTenants, activeTenants, trialTenants,
      totalStudents, totalUsers,
      newThisMonth, newThisWeek,
      tenantsByPlan, revenueAll, revenueThisMonth,
      churnThisMonth,
    ] = await Promise.all([
      this.prisma.tenant.count({ where: tenantExcludeAdmin }),
      this.prisma.tenant.count({ where: { ...tenantExcludeAdmin, isActive: true } }),
      this.prisma.tenant.count({ where: { ...tenantExcludeAdmin, subscriptionStatus: 'TRIALING' } }),
      this.prisma.student.count(),
      this.prisma.user.count({ where: { role: { not: 'SUPER_ADMIN' } } }),
      this.prisma.tenant.count({ where: { ...tenantExcludeAdmin, createdAt: { gte: startOfMonth } } }),
      this.prisma.tenant.count({ where: { ...tenantExcludeAdmin, createdAt: { gte: startOfWeek } } }),
      this.prisma.tenant.groupBy({
        by: ['subscriptionPlan'],
        where: tenantExcludeAdmin,
        _count: { _all: true },
        orderBy: { _count: { subscriptionPlan: 'desc' } },
      }),
      // Revenus Structura = abonnements Djomy réussis (PAS les paiements de scolarité élèves)
      this.prisma.subscriptionPayment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } }),
      this.prisma.subscriptionPayment.aggregate({
        _sum: { amount: true },
        where: { status: 'SUCCESS', createdAt: { gte: startOfMonth } },
      }),
      // Churn : tenants passés à CANCELED ou EXPIRED ce mois
      this.prisma.tenant.count({
        where: {
          ...tenantExcludeAdmin,
          subscriptionStatus: { in: ['CANCELED', 'EXPIRED'] },
          updatedAt: { gte: startOfMonth },
        },
      }),
    ]);

    const result = {
      tenants: {
        total:        totalTenants,
        active:       activeTenants,
        inactive:     totalTenants - activeTenants,
        trial:        trialTenants,
        newThisMonth,
        newThisWeek,
        byPlan: tenantsByPlan.map((p) => ({ plan: p.subscriptionPlan, count: p._count._all })),
      },
      users:    { total: totalUsers },
      students: { total: totalStudents },
      revenue: {
        total:      revenueAll._sum.amount ?? 0,
        thisMonth:  revenueThisMonth._sum.amount ?? 0,
        currency:   'GNF',
      },
      churn: {
        thisMonth: churnThisMonth,
      },
    };

    await this.cacheService.set(CACHE_KEY, result, 120); // TTL 2 min
    return result;
  }

  // ─── Alertes ───────────────────────────────────────────────────────────────

  /**
   * Retourne les alertes triées par urgence :
   *   URGENT   → trial expirant dans 72h (trié par hoursLeft ↑), PAST_DUE, trial expiré non converti
   *   WARNING  → écoles inactives 7+ jours, onboarding abandonné (0 élève 3j+)
   *   INFO     → trials expirant dans 7 jours, écoles FREE depuis 30j
   */
  async getAlerts() {
    const now     = new Date();
    const in72h   = new Date(now.getTime() + 72 * 3_600_000);
    const in7days = new Date(now.getTime() +  7 * 86_400_000);
    const ago3d   = new Date(now.getTime() -  3 * 86_400_000);
    const ago7d   = new Date(now.getTime() -  7 * 86_400_000);
    const ago30d  = new Date(now.getTime() - 30 * 86_400_000);

    // Sélection commune : infos tenant + tous users pour health score + infos directeur
    const alertSelect = {
      ...TENANT_LIST_SELECT,
      users: { select: { email: true, role: true, lastLoginAt: true } },
    };

    const [
      trialExpiring72h,
      trialExpiring7d,
      expiredTrials,
      pastDue,
      inactiveUsers,
      noSetup,
      longFree,
    ] = await Promise.all([
      // Trials expirant dans 72h
      this.prisma.tenant.findMany({
        where: { ...tenantExcludeAdmin, subscriptionStatus: 'TRIALING', trialEndsAt: { gte: now, lte: in72h } },
        select: alertSelect,
      }),
      // Trials expirant dans 7 jours (mais pas dans 72h)
      this.prisma.tenant.findMany({
        where: { ...tenantExcludeAdmin, subscriptionStatus: 'TRIALING', trialEndsAt: { gt: in72h, lte: in7days } },
        select: alertSelect,
      }),
      // Trials déjà expirés — écoles non converties (lead perdu)
      this.prisma.tenant.findMany({
        where: { ...tenantExcludeAdmin, subscriptionStatus: 'TRIALING', trialEndsAt: { lt: now } },
        select: alertSelect,
        orderBy: { trialEndsAt: 'desc' },
        take: 50,
      }),
      // Paiements en retard
      this.prisma.tenant.findMany({
        where: { ...tenantExcludeAdmin, subscriptionStatus: 'PAST_DUE', isActive: true },
        select: alertSelect,
      }),
      // Écoles sans aucune connexion depuis 7 jours
      this.prisma.tenant.findMany({
        where: {
          ...tenantExcludeAdmin, isActive: true,
          users: { none: { lastLoginAt: { gte: ago7d } } },
        },
        select: alertSelect,
      }),
      // Onboarding abandonné : inscrites 3j+ avec 0 élève
      this.prisma.tenant.findMany({
        where: {
          ...tenantExcludeAdmin, isActive: true,
          currentStudentCount: 0,
          createdAt: { lte: ago3d },
        },
        select: alertSelect,
      }),
      // Plan FREE depuis plus de 30 jours (opportunité upsell)
      this.prisma.tenant.findMany({
        where: { ...tenantExcludeAdmin, subscriptionPlan: 'FREE', createdAt: { lte: ago30d }, isActive: true },
        select: alertSelect,
      }),
    ]);

    /** Enrichit un tenant brut : extrait le directeur + calcule le health score */
    const enrich = (t: any) => {
      const { users, ...tenant } = t;
      const director = (users as any[]).find((u) => u.role === 'DIRECTOR') ?? null;
      const healthScore = computeHealthScore({
        users: users ?? [],
        currentStudentCount: tenant.currentStudentCount,
        subscriptionStatus:  tenant.subscriptionStatus,
      });
      return {
        tenant:   { ...tenant, healthScore },
        director: director ? { email: director.email, lastLoginAt: director.lastLoginAt } : null,
      };
    };

    // Urgentes triées : trials expirant bientôt en premier (hoursLeft ↑), puis PAST_DUE, puis expirés
    const urgentItems = [
      ...trialExpiring72h
        .map((t) => {
          const { tenant, director } = enrich(t);
          const hoursLeft = t.trialEndsAt
            ? Math.round((new Date(t.trialEndsAt).getTime() - now.getTime()) / 3_600_000)
            : null;
          return { type: 'TRIAL_EXPIRING_SOON' as const, label: 'Trial expire dans moins de 72h', tenant, director, hoursLeft, daysExpired: null };
        })
        .sort((a, b) => (a.hoursLeft ?? 999) - (b.hoursLeft ?? 999)),
      ...pastDue.map((t) => {
        const { tenant, director } = enrich(t);
        return { type: 'PAST_DUE' as const, label: 'Paiement en retard', tenant, director, hoursLeft: null, daysExpired: null };
      }),
      ...expiredTrials.map((t) => {
        const { tenant, director } = enrich(t);
        const daysExpired = t.trialEndsAt
          ? Math.round((now.getTime() - new Date(t.trialEndsAt).getTime()) / 86_400_000)
          : null;
        return { type: 'TRIAL_EXPIRED' as const, label: 'Trial expiré — non converti', tenant, director, hoursLeft: null, daysExpired };
      }),
    ];

    const warningItems = [
      ...inactiveUsers.map((t) => {
        const { tenant } = enrich(t);
        return { type: 'INACTIVE_7DAYS' as const, label: 'Inactif depuis 7+ jours', tenant, director: null, hoursLeft: null, daysExpired: null };
      }),
      ...noSetup.map((t) => {
        const { tenant, director } = enrich(t);
        const daysSince = Math.round((now.getTime() - new Date(t.createdAt).getTime()) / 86_400_000);
        return { type: 'NO_SETUP' as const, label: `Onboarding abandonné — 0 élève depuis ${daysSince}j`, tenant, director, hoursLeft: null, daysExpired: null };
      }),
    ];

    const infoItems = [
      ...trialExpiring7d.map((t) => {
        const { tenant, director } = enrich(t);
        return { type: 'TRIAL_EXPIRING_WEEK' as const, label: 'Trial expire cette semaine', tenant, director, hoursLeft: null, daysExpired: null };
      }),
      ...longFree.map((t) => {
        const { tenant } = enrich(t);
        return { type: 'LONG_FREE' as const, label: 'En plan FREE depuis 30+ jours', tenant, director: null, hoursLeft: null, daysExpired: null };
      }),
    ];

    return {
      urgent:  urgentItems,
      warning: warningItems,
      info:    infoItems,
      counts: {
        urgent:  urgentItems.length,
        warning: warningItems.length,
        info:    infoItems.length,
        total:   urgentItems.length + warningItems.length + infoItems.length,
      },
    };
  }

  /**
   * Comptage rapide des alertes actives — utilisé par le badge de la sidebar.
   * 3 requêtes COUNT au lieu des 7 findMany de getAlerts() pour les listes complètes.
   * Cache 90s — appelé toutes les 2 min par la sidebar, évite les COUNT répétés.
   */
  async getAlertsCount() {
    const CACHE_KEY = 'admin:alerts:count';
    const cached = await this.cacheService.get<object>(CACHE_KEY);
    if (cached) return cached;

    const now   = new Date();
    const in72h = new Date(now.getTime() + 72 * 3_600_000);
    const ago7d = new Date(now.getTime() -  7 * 86_400_000);
    const ago3d = new Date(now.getTime() -  3 * 86_400_000);

    const [urgentCount, warningCount] = await Promise.all([
      // Urgent = trial ≤ 72h OU déjà expiré OU PAST_DUE
      this.prisma.tenant.count({
        where: {
          ...tenantExcludeAdmin,
          OR: [
            { subscriptionStatus: 'TRIALING', trialEndsAt: { lte: in72h } },
            { subscriptionStatus: 'PAST_DUE', isActive: true },
          ],
        },
      }),
      // Warning = inactif OU onboarding abandonné (non dédupliqué)
      this.prisma.tenant.count({
        where: {
          ...tenantExcludeAdmin,
          isActive: true,
          OR: [
            { users: { none: { lastLoginAt: { gte: ago7d } } } },
            { currentStudentCount: 0, createdAt: { lte: ago3d } },
          ],
        },
      }),
    ]);

    const result = { urgent: urgentCount, warning: warningCount, total: urgentCount + warningCount };
    await this.cacheService.set(CACHE_KEY, result, 90); // TTL 90s
    return result;
  }

  // ─── Journal d'activité ────────────────────────────────────────────────────

  async getActivity(params: { page?: number; limit?: number; tenantId?: string }) {
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 30));
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (params.tenantId) where.tenantId = params.tenantId;

    const [total, logs] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: logs,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  // ─── Gestion des tenants ───────────────────────────────────────────────────

  async findAllTenants(params: {
    page?: number; limit?: number;
    search?: string; status?: 'active' | 'inactive'; plan?: string; country?: string;
  }) {
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 20));
    const skip  = (page - 1) * limit;

    const where: any = { ...tenantExcludeAdmin };
    if (params.search) {
      where.AND = [
        { OR: tenantExcludeAdmin.OR },
        { OR: [
          { name:      { contains: params.search, mode: 'insensitive' } },
          { email:     { contains: params.search, mode: 'insensitive' } },
          { subdomain: { contains: params.search, mode: 'insensitive' } },
          { city:      { contains: params.search, mode: 'insensitive' } },
        ]},
      ];
      delete where.OR;
    }
    if (params.status === 'active')   where.isActive = true;
    if (params.status === 'inactive') where.isActive = false;
    if (params.plan)    where.subscriptionPlan = params.plan.toUpperCase();
    if (params.country) where.country = params.country.toUpperCase();

    const [total, rawTenants] = await Promise.all([
      this.prisma.tenant.count({ where }),
      this.prisma.tenant.findMany({
        where,
        select: {
          ...TENANT_LIST_SELECT,
          users: { select: { lastLoginAt: true } },
          _count: { select: { users: true, students: true, classes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const tenants = rawTenants.map(({ users, ...t }) => ({
      ...t,
      healthScore: computeHealthScore({ users, currentStudentCount: t.currentStudentCount, subscriptionStatus: t.subscriptionStatus }),
    }));

    return { data: tenants, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOneTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        ...TENANT_LIST_SELECT,
        address: true, djomyCustomerId: true,
        currentPeriodStart: true, feeConfig: true, paymentFrequency: true,
        notifMonthlyReport: true, notifOverdueAlert: true,
        subscriptionHistory: { orderBy: { createdAt: 'desc' }, take: 10 },
        users: {
          where: { role: { not: 'SUPER_ADMIN' } },
          select: {
            id: true, email: true, firstName: true, lastName: true,
            role: true, isActive: true, emailVerified: true,
            lastLoginAt: true, createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: { select: { users: true, students: true, classes: true, payments: true, attendance: true } },
      },
    });

    if (!tenant) throw new NotFoundException('École non trouvée');

    const { users, ...rest } = tenant;
    return {
      ...rest,
      users,
      healthScore: computeHealthScore({ users, currentStudentCount: rest.currentStudentCount, subscriptionStatus: rest.subscriptionStatus }),
    };
  }

  /** Invalide les caches admin stats après une action qui modifie les données globales. */
  private async invalidateAdminCaches() {
    await Promise.all([
      this.cacheService.del('admin:stats:global'),
      this.cacheService.del('admin:alerts:count'),
      this.cacheService.del('admin:finance:stats'),
    ]).catch(() => {}); // fail-safe : Redis down ne doit pas bloquer l'action
  }

  async updateTenant(id: string, dto: UpdateTenantDto, adminEmail?: string) {
    await this.findOneTenant(id);
    const data: any = {};
    if (dto.isActive           !== undefined) data.isActive          = dto.isActive;
    if (dto.subscriptionPlan   !== undefined) data.subscriptionPlan  = dto.subscriptionPlan;
    if (dto.subscriptionStatus !== undefined) data.subscriptionStatus = dto.subscriptionStatus;
    if (dto.trialEndsAt        !== undefined) data.trialEndsAt       = new Date(dto.trialEndsAt);
    if (dto.currentPeriodStart !== undefined) data.currentPeriodStart = new Date(dto.currentPeriodStart);
    if (dto.currentPeriodEnd   !== undefined) data.currentPeriodEnd   = new Date(dto.currentPeriodEnd);

    const updated = await this.prisma.tenant.update({ where: { id }, data, select: TENANT_LIST_SELECT });

    // Invalider le cache du plan si le plan a changé
    if (dto.subscriptionPlan !== undefined) {
      await this.cacheService.del(`plan:${id}`);
    }

    this.audit({ action: 'UPDATE_TENANT', actorEmail: adminEmail, tenantId: id, tenantName: updated.name, details: data });
    this.invalidateAdminCaches();
    return updated;
  }

  async suspendTenant(id: string, adminEmail?: string) {
    const tenant = await this.findOneTenant(id);
    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id }, data: { isActive: false } }),
      this.prisma.user.updateMany({ where: { tenantId: id }, data: { isActive: false } }),
    ]);
    this.audit({ action: 'SUSPEND', actorEmail: adminEmail, tenantId: id, tenantName: tenant.name });
    this.logger.warn(`Tenant suspendu [${id}] ${tenant.name}`);
    this.invalidateAdminCaches();
    return { message: 'École suspendue avec succès', tenantId: id };
  }

  async activateTenant(id: string, adminEmail?: string) {
    const tenant = await this.findOneTenant(id);
    await this.prisma.$transaction([
      this.prisma.tenant.update({ where: { id }, data: { isActive: true } }),
      this.prisma.user.updateMany({ where: { tenantId: id, role: { not: 'SUPER_ADMIN' } }, data: { isActive: true } }),
    ]);
    this.audit({ action: 'ACTIVATE', actorEmail: adminEmail, tenantId: id, tenantName: tenant.name });
    this.logger.log(`Tenant réactivé [${id}] ${tenant.name}`);
    this.invalidateAdminCaches();
    return { message: 'École réactivée avec succès', tenantId: id };
  }

  async deleteTenant(id: string, adminEmail?: string) {
    const tenant = await this.findOneTenant(id);
    if (tenant.isActive) throw new BadRequestException('Suspendez le tenant avant de le supprimer définitivement');
    await this.prisma.tenant.delete({ where: { id } });
    this.audit({ action: 'DELETE', actorEmail: adminEmail, tenantId: id, tenantName: tenant.name });
    this.logger.warn(`Tenant supprimé [${id}] ${tenant.name}`);
    this.invalidateAdminCaches();
    return { message: 'École supprimée définitivement', tenantId: id };
  }

  // ─── Impersonation ─────────────────────────────────────────────────────────

  /**
   * Génère un code d'impersonation opaque à usage unique (TTL 2min).
   * Le JWT est stocké en Redis sous la clé `impersonate:{uuid}`.
   * Le code est renvoyé au frontend qui ouvre /impersonate?code=<uuid>
   * sur le SaaS frontend. La page /impersonate échange le code contre le JWT
   * via POST /auth/impersonate-exchange.
   *
   * Sécurité : le JWT ne transite jamais dans l'URL —
   *   - jamais dans l'historique du navigateur
   *   - jamais dans les logs nginx (uniquement le code UUID court-vécu)
   */
  async impersonateTenant(adminUserId: string, adminEmail: string, tenantId: string) {
    const tenant   = await this.findOneTenant(tenantId);
    const director = await this.prisma.user.findFirst({ where: { tenantId, role: 'DIRECTOR' } });

    if (!director) throw new NotFoundException('Aucun directeur trouvé pour cette école');

    // Générer le JWT director (15min, non renouvelable)
    const token = this.jwtService.sign(
      { userId: director.id, email: director.email, tenantId: director.tenantId, role: director.role, impersonatedBy: adminUserId },
      { secret: this.configService.get('JWT_SECRET'), expiresIn: '15m' },
    );

    // Stocker le JWT en Redis avec un code opaque UUID (TTL 2min, usage unique)
    const code = randomUUID();
    await this.cacheService.set(`impersonate:${code}`, { token }, 120);

    this.audit({ action: 'IMPERSONATE', actorEmail: adminEmail, actorId: adminUserId, tenantId, tenantName: tenant.name, details: { directorEmail: director.email } });
    this.logger.warn(`Impersonation [${adminEmail}] → [${tenant.name}]`);

    return {
      code,
      expiresIn: 120,
      impersonating: { tenantId, tenantName: tenant.name, directorEmail: director.email },
    };
  }

  /**
   * Échange un code d'impersonation opaque contre le JWT correspondant.
   * Le code est supprimé immédiatement après échange (usage unique).
   * Si Redis est down, le fallback retourne une erreur 401 car la sécurité prime.
   */
  async exchangeImpersonationCode(code: string): Promise<{ token: string }> {
    if (!code || code.length < 10) {
      throw new BadRequestException('Code invalide');
    }
    const key    = `impersonate:${code}`;
    const stored = await this.cacheService.get<{ token: string }>(key);

    if (!stored?.token) {
      throw new BadRequestException('Code d\'impersonation invalide ou expiré');
    }

    // Suppression immédiate — usage unique
    await this.cacheService.del(key);

    return { token: stored.token };
  }

  // ─── Extension du trial ────────────────────────────────────────────────────

  async extendTrial(tenantId: string, dto: ExtendTrialDto, adminEmail?: string) {
    const tenant = await this.findOneTenant(tenantId);

    // Base : si trial actif → partir de trialEndsAt, sinon → maintenant
    const base = (tenant.trialEndsAt && new Date(tenant.trialEndsAt) > new Date())
      ? new Date(tenant.trialEndsAt)
      : new Date();
    const newEnd = new Date(base.getTime() + dto.days * 86_400_000);

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data:  { trialEndsAt: newEnd, subscriptionStatus: 'TRIALING' },
    });

    this.audit({
      action:     'EXTEND_TRIAL',
      actorEmail: adminEmail,
      tenantId,
      tenantName: tenant.name,
      details:    { days: dto.days, newTrialEnd: newEnd.toISOString() },
    });

    this.logger.log(`Trial prolongé [${tenant.name}] +${dto.days}j → ${newEnd.toISOString()}`);
    this.invalidateAdminCaches();
    return { message: `Trial prolongé de ${dto.days} jours`, newTrialEnd: newEnd.toISOString() };
  }

  // ─── Rappel email (depuis le panneau admin) ────────────────────────────────

  async sendReminder(tenantId: string, dto: SendReminderDto, adminEmail?: string) {
    const tenant   = await this.findOneTenant(tenantId);
    const director = await this.prisma.user.findFirst({ where: { tenantId, role: 'DIRECTOR' } });

    if (!director) throw new NotFoundException('Aucun directeur pour cette école');

    const dashUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000') + '/dashboard';

    // Fire-and-forget — ne bloque pas la réponse
    this.emailService.sendNotificationEmail(
      director.email,
      dto.subject,
      dto.message,
      dashUrl,
      'Accéder à Structura',
    ).catch((e) => this.logger.error(`Échec envoi rappel à ${director.email}: ${e.message}`));

    this.audit({
      action:     'SEND_REMINDER',
      actorEmail: adminEmail,
      tenantId,
      tenantName: tenant.name,
      details:    { to: director.email, subject: dto.subject },
    });

    return { message: `Email envoyé à ${director.email}` };
  }

  // ─── Création manuelle d'une école ────────────────────────────────────────

  async createTenant(dto: CreateTenantAdminDto, adminEmail?: string) {
    // Vérification unicité email directeur (règle globale)
    const existing = await this.prisma.user.findFirst({
      where: { email: dto.directorEmail, role: 'DIRECTOR' },
    });
    if (existing) {
      throw new BadRequestException('Un compte directeur existe déjà avec cet email.');
    }

    const trialDays = Math.max(1, Math.min(365, dto.trialDays ?? 14));
    const trialEnd  = new Date(Date.now() + trialDays * 86_400_000);

    // Créer tenant + directeur dans une transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name:               dto.name,
          type:               dto.type ?? 'school',
          country:            dto.country ?? 'GN',
          city:               dto.city ?? null,
          isActive:           true,
          subscriptionPlan:   'FREE',
          subscriptionStatus: 'TRIALING',
          trialEndsAt:        trialEnd,
        },
      });

      // Token d'invitation pour setup-account
      const inviteToken = crypto.randomBytes(32).toString('hex');
      const tempPassword = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
      const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

      const director = await tx.user.create({
        data: {
          email:                 dto.directorEmail,
          password:              tempPassword,
          firstName:             dto.directorFirstName,
          lastName:              dto.directorLastName,
          role:                  'DIRECTOR',
          tenantId:              tenant.id,
          emailVerified:         true,   // L'admin a validé l'adresse
          onboardingCompleted:   false,
          mustChangePassword:    true,
          passwordResetToken:    inviteToken,
          passwordResetExpiry:   tokenExpiry,
        },
      });

      return { tenant, director, inviteToken };
    });

    // Envoyer l'invitation au directeur (fire-and-forget)
    this.emailService.sendTeamInvitationEmail(
      result.director.email,
      result.director.firstName,
      result.tenant.name,
      result.inviteToken,
    ).catch((e) => this.logger.error(`Invitation admin non envoyée : ${e.message}`));

    this.audit({
      action:     'CREATE_TENANT',
      actorEmail: adminEmail,
      tenantId:   result.tenant.id,
      tenantName: result.tenant.name,
      details:    { directorEmail: dto.directorEmail, trialDays },
    });

    this.logger.log(`École créée par admin [${result.tenant.name}] → directeur: ${result.director.email}`);
    this.invalidateAdminCaches();

    return {
      tenant: {
        id:   result.tenant.id,
        name: result.tenant.name,
        trialEndsAt: trialEnd.toISOString(),
      },
      director: {
        email:     result.director.email,
        firstName: result.director.firstName,
        lastName:  result.director.lastName,
      },
      message: `École créée. Invitation envoyée à ${result.director.email}`,
    };
  }

  // ─── Renvoi invitation directeur ──────────────────────────────────────────

  /**
   * POST /admin/tenants/:id/resend-invite
   * Régénère un token d'invitation et renvoie l'email au directeur
   * qui n'a pas encore activé son compte (lastLoginAt === null).
   */
  async resendDirectorInvite(tenantId: string, adminEmail?: string) {
    const director = await this.prisma.user.findFirst({
      where: { tenantId, role: 'DIRECTOR' },
    });

    if (!director) {
      throw new BadRequestException('Aucun directeur trouvé pour cette école.');
    }

    if (director.lastLoginAt !== null) {
      throw new BadRequestException('Le directeur a déjà activé son compte.');
    }

    const inviteToken  = crypto.randomBytes(32).toString('hex');
    const tokenExpiry  = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    await this.prisma.user.update({
      where: { id: director.id },
      data: { passwordResetToken: inviteToken, passwordResetExpiry: tokenExpiry },
    });

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

    await this.emailService.sendTeamInvitationEmail(
      director.email,
      director.firstName,
      tenant?.name ?? 'votre établissement',
      inviteToken,
    );

    this.audit({
      action: 'RESEND_DIRECTOR_INVITE',
      actorEmail: adminEmail,
      tenantId,
      tenantName: tenant?.name,
      details: { directorEmail: director.email },
    });

    return { message: `Invitation renvoyée à ${director.email}` };
  }

  // ─── Statistiques financières ──────────────────────────────────────────────

  /**
   * Données pour la page Finance :
   *   - Revenus mensuels sur les 12 derniers mois (via paiements élèves)
   *   - Répartition du CA par plan d'abonnement
   *   - Totaux cumulés
   * Cache 5 min — données financières ne changent que lors des paiements.
   */
  async getFinanceStats() {
    const CACHE_KEY = 'admin:finance:stats';
    const cached = await this.cacheService.get<object>(CACHE_KEY);
    if (cached) return cached;

    const now         = new Date();
    const twelveAgo   = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    // Abonnements Djomy réussis des 12 derniers mois (revenus Structura, PAS les paiements élèves)
    const payments = await this.prisma.subscriptionPayment.findMany({
      where:  { status: 'SUCCESS', createdAt: { gte: twelveAgo } },
      select: { amount: true, createdAt: true, plan: true },
    });

    // Regroupement par mois (YYYY-MM)
    const byMonth: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      byMonth[key] = 0;
    }
    for (const p of payments) {
      const d   = new Date(p.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (key in byMonth) byMonth[key] += p.amount;
    }

    // Tri chronologique
    const monthly = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, revenue]) => ({ month, revenue }));

    // Revenue par plan d'abonnement Structura
    const byPlan: Record<string, number> = {};
    for (const p of payments) {
      byPlan[p.plan] = (byPlan[p.plan] ?? 0) + p.amount;
    }

    // Total global (tous abonnements SUCCESS, pas seulement 12 mois)
    const totalAgg = await this.prisma.subscriptionPayment.aggregate({ _sum: { amount: true }, where: { status: 'SUCCESS' } });
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mrrAgg = await this.prisma.subscriptionPayment.aggregate({
      _sum: { amount: true },
      where: { status: 'SUCCESS', createdAt: { gte: thisMonthStart } },
    });

    // Tenants payants (ACTIVE ou TRIALING)
    const payingTenants = await this.prisma.tenant.count({
      where: { ...tenantExcludeAdmin, subscriptionStatus: { in: ['ACTIVE', 'TRIALING'] } },
    });

    const result = {
      monthly,
      byPlan: Object.entries(byPlan).map(([plan, revenue]) => ({ plan, revenue })),
      totals: {
        allTime:   totalAgg._sum.amount ?? 0,
        thisMonth: mrrAgg._sum.amount   ?? 0,
        currency:  'GNF',
      },
      payingTenants,
    };

    await this.cacheService.set(CACHE_KEY, result, 300); // TTL 5 min
    return result;
  }

  // ─── Paiements Djomy (SubscriptionPayment) ────────────────────────────────

  /**
   * Liste paginée des transactions Djomy.
   * Filtres : status (SUCCESS | FAILED | PENDING | CREATED | CANCELLED), plan, tenantId.
   */
  async getSubscriptionPayments(params: {
    page?:     number;
    limit?:    number;
    status?:   string;
    plan?:     string;
    tenantId?: string;
  }) {
    const page  = Math.max(1, params.page  ?? 1);
    const limit = Math.min(100, Math.max(1, params.limit ?? 30));
    const skip  = (page - 1) * limit;

    const where: any = {};
    if (params.status)   where.status   = params.status.toUpperCase();
    if (params.plan)     where.plan     = params.plan.toUpperCase();
    if (params.tenantId) where.tenantId = params.tenantId;

    const [total, payments] = await Promise.all([
      this.prisma.subscriptionPayment.count({ where }),
      this.prisma.subscriptionPayment.findMany({
        where,
        include: { tenant: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return {
      data: payments,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
}
