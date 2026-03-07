import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DjomyService } from '../djomy/djomy.service';
import {
  PLAN_LIMITS,
  PLAN_NAMES,
  PLAN_PRICES_GNF,
  PLAN_DESCRIPTIONS,
  Plan,
  hasFeature,
  PlanFeatures,
} from '../common/constants/plans.constants';

// ─── Types webhook Djomy ─────────────────────────────────────────────────────

export interface DjomyWebhookData {
  transactionId: string;
  status: string;
  paidAmount: number;
  receivedAmount: number;
  fees: number;
  paymentMethod: string;
  merchantPaymentReference: string;
  payerIdentifier: string;
  currency: string;
  createdAt: string;
}

export interface DjomyWebhookEvent {
  message: string;
  eventType: 'payment.created' | 'payment.pending' | 'payment.success' | 'payment.failed' | 'payment.cancelled' | 'payment.redirected';
  eventId: string;
  data: DjomyWebhookData;
  paymentLinkReference?: string;
  timestamp: string;
  metadata?: Record<string, string | number | boolean>;
}

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly djomy: DjomyService,
    private readonly config: ConfigService,
  ) {}

  // ─────────────────────────────────────────────
  // CHECKOUT — Créer un paiement d'abonnement
  // ─────────────────────────────────────────────

  /**
   * Crée un paiement d'abonnement via Djomy.
   * Retourne l'URL de redirection vers la page de paiement Djomy.
   */
  async createCheckout(
    tenantId: string,
    plan: 'PRO' | 'PRO_PLUS',
    period: 'monthly' | 'annual',
    payerNumber: string,
  ): Promise<{ paymentUrl: string; transactionId: string; amount: number }> {
    // Vérifier si le tenant a déjà un abonnement actif non expiré
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionPlan: true, subscriptionStatus: true, currentPeriodEnd: true },
    });

    if (tenant && tenant.subscriptionStatus === 'ACTIVE' && tenant.subscriptionPlan === plan) {
      const expiresAt = tenant.currentPeriodEnd ? new Date(tenant.currentPeriodEnd) : null;
      if (expiresAt && expiresAt > new Date()) {
        const formatted = expiresAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
        throw new BadRequestException({
          message: `Vous avez déjà un abonnement ${PLAN_NAMES[plan as Plan]} actif jusqu'au ${formatted}. Vous pourrez renouveler à cette date.`,
          code: 'SUBSCRIPTION_ALREADY_ACTIVE',
          expiresAt: expiresAt.toISOString(),
        });
      }
    }

    const amount = PLAN_PRICES_GNF[plan as Exclude<Plan, Plan.FREE>][period];
    const planName = PLAN_NAMES[plan as Plan];
    const periodLabel = period === 'monthly' ? 'Mensuel' : 'Annuel';

    // Référence unique marchande : SUB-{8 premiers chars tenantId}-{timestamp}
    const merchantRef = `SUB-${tenantId.substring(0, 8).toUpperCase()}-${Date.now()}`;

    // APP_PUBLIC_URL surcharge FRONTEND_URL pour les redirects Djomy (HTTPS requis)
    // BACKEND_PUBLIC_URL est l'URL HTTPS publique du backend pour le webhook callback
    const frontendUrl =
      this.config.get<string>('APP_PUBLIC_URL') ||
      this.config.getOrThrow<string>('FRONTEND_URL');

    const backendUrl =
      this.config.get<string>('BACKEND_PUBLIC_URL') ||
      `http://localhost:${this.config.get<string>('PORT') || '3001'}`;

    const callbackUrl = `${backendUrl}/api/subscriptions/webhook`;

    this.logger.log(`Djomy callbackUrl: ${callbackUrl}`);

    // Créer le paiement chez Djomy
    const payment = await this.djomy.createGatewayPayment({
      amount,
      countryCode: 'GN',
      payerNumber,
      description: `Abonnement Structura ${planName} — ${periodLabel}`,
      merchantPaymentReference: merchantRef,
      returnUrl: `${frontendUrl}/dashboard/billing/success?ref=${merchantRef}`,
      cancelUrl: `${frontendUrl}/dashboard/billing?cancelled=1`,
      callbackUrl,
      allowedPaymentMethods: ['OM', 'PAYCARD', 'CARD'],
      metadata: {
        tenantId,
        plan,
        period,
      },
    });

    // Sauvegarder le paiement en attente en BDD
    await this.prisma.subscriptionPayment.create({
      data: {
        tenantId,
        djomyTransactionId: payment.transactionId,
        merchantPaymentReference: merchantRef,
        amount,
        currency: 'GNF',
        status: 'CREATED',
        plan,
        period,
      },
    });

    this.logger.log(
      `Checkout créé — tenant: ${tenantId} | plan: ${plan} | période: ${period} | ref: ${merchantRef}`,
    );

    return {
      paymentUrl: payment.redirectUrl,
      transactionId: payment.transactionId,
      amount,
    };
  }

  // ─────────────────────────────────────────────
  // WEBHOOK — Traiter les événements Djomy
  // ─────────────────────────────────────────────

  /**
   * Traite un événement webhook reçu de Djomy.
   * Vérifie la signature HMAC avant tout traitement.
   * Idempotent : ignore les événements déjà traités.
   */
  async handleWebhookEvent(
    event: DjomyWebhookEvent,
    rawBody: string,
    signatureHeader: string,
  ): Promise<void> {
    // 1. Vérification de la signature HMAC — sécurité critique
    const isDev = this.config.get<string>('NODE_ENV') !== 'production';
    const sigValid = this.djomy.verifyWebhookSignature(rawBody, signatureHeader);

    if (!sigValid) {
      // DEBUG — affiche les 2 signatures pour comprendre la divergence
      const crypto = await import('crypto');
      const secret = this.config.get<string>('DJOMY_CLIENT_SECRET') ?? '';
      const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
      this.logger.warn(
        `Webhook: signature invalide\n` +
        `  Reçue    : ${signatureHeader}\n` +
        `  Calculée : v1:${computed}\n` +
        `  RawBody  : ${rawBody.substring(0, 200)}`,
      );

      if (!isDev) {
        // En production : rejeter les signatures invalides
        throw new UnauthorizedException('Webhook signature invalide');
      }
      // En développement : on continue malgré la signature invalide (sandbox Djomy)
      this.logger.warn('⚠️  Mode DEV : signature ignorée — NE PAS faire en production');
    }

    this.logger.log(`Webhook reçu: ${event.eventType} | eventId: ${event.eventId}`);

    // 2. On ne traite que les paiements réussis
    if (event.eventType !== 'payment.success') {
      // Mettre à jour le statut du paiement si on a une référence
      if (event.data?.merchantPaymentReference) {
        const statusMap: Record<string, string> = {
          'payment.created':    'CREATED',
          'payment.pending':    'PENDING',
          'payment.failed':     'FAILED',
          'payment.cancelled':  'CANCELLED',
          'payment.redirected': 'REDIRECTED',
        };
        const newStatus = statusMap[event.eventType];
        if (newStatus) {
          await this.prisma.subscriptionPayment
            .update({
              where: { merchantPaymentReference: event.data.merchantPaymentReference },
              data: { status: newStatus },
            })
            .catch(() => {}); // Silencieux si le paiement n'existe pas
        }
      }
      return;
    }

    // 3. Dédoublonnage par eventId Djomy
    if (event.eventId) {
      const existingByEvent = await this.prisma.subscriptionPayment.findFirst({
        where: { webhookEventId: event.eventId },
      });
      if (existingByEvent) {
        this.logger.log(`Webhook: eventId ${event.eventId} déjà traité — ignoré`);
        return;
      }
    }

    // 4. Trouver le paiement en BDD par référence marchande
    const merchantRef = event.data?.merchantPaymentReference;
    if (!merchantRef) {
      this.logger.warn('Webhook: merchantPaymentReference absent');
      return;
    }

    const subPayment = await this.prisma.subscriptionPayment.findUnique({
      where: { merchantPaymentReference: merchantRef },
    });

    if (!subPayment) {
      this.logger.warn(`Webhook: aucun paiement trouvé pour ref: ${merchantRef}`);
      return;
    }

    // 5. Idempotence : skip si déjà SUCCESS
    if (subPayment.status === 'SUCCESS') {
      this.logger.log(`Webhook: paiement ${merchantRef} déjà activé — ignoré`);
      return;
    }

    // 6. Calcul de la date de fin de période
    const now = new Date();
    const periodEnd = new Date(now);
    if (subPayment.period === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    // 7. Activer le plan en transaction atomique
    await this.prisma.$transaction([
      // Mettre à jour le paiement
      this.prisma.subscriptionPayment.update({
        where: { merchantPaymentReference: merchantRef },
        data: {
          status: 'SUCCESS',
          paymentMethod: event.data?.paymentMethod,
          payerIdentifier: event.data?.payerIdentifier,
          webhookEventId: event.eventId,
        },
      }),
      // Activer le plan sur le tenant
      this.prisma.tenant.update({
        where: { id: subPayment.tenantId },
        data: {
          subscriptionPlan: subPayment.plan as any,
          subscriptionStatus: 'ACTIVE',
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          trialEndsAt: null,
        },
      }),
      // Enregistrer dans l'historique
      this.prisma.subscriptionHistory.create({
        data: {
          tenantId: subPayment.tenantId,
          plan: subPayment.plan as any,
          status: 'ACTIVE',
          startDate: now,
          endDate: periodEnd,
          amount: subPayment.amount,
          currency: 'GNF',
          paymentMethod: event.data?.paymentMethod ?? 'DJOMY',
          paymentId: event.data?.transactionId,
        },
      }),
    ]);

    this.logger.log(
      `✅ Plan ${subPayment.plan} activé — tenant: ${subPayment.tenantId} | jusqu'au: ${periodEnd.toISOString()}`,
    );
  }

  // ─────────────────────────────────────────────
  // VÉRIFIER STATUT APRÈS RETOUR DE PAIEMENT
  // ─────────────────────────────────────────────

  /**
   * Vérifie le statut d'un paiement via sa référence marchande.
   * Utilisé sur la page de retour après paiement Djomy.
   * Double vérification : BDD interne + API Djomy si nécessaire.
   */
  async verifyPaymentByRef(
    merchantRef: string,
    tenantId: string,
  ): Promise<{ success: boolean; plan?: string; period?: string; amount?: number }> {
    const subPayment = await this.prisma.subscriptionPayment.findUnique({
      where: { merchantPaymentReference: merchantRef },
    });

    if (!subPayment || subPayment.tenantId !== tenantId) {
      return { success: false };
    }

    // Si déjà SUCCESS en BDD, on est bon
    if (subPayment.status === 'SUCCESS') {
      return { success: true, plan: subPayment.plan, period: subPayment.period, amount: subPayment.amount };
    }

    // Sinon, interroger Djomy pour avoir le statut en temps réel
    if (subPayment.djomyTransactionId) {
      try {
        const djomyStatus = await this.djomy.getPaymentStatus(subPayment.djomyTransactionId);
        if (djomyStatus?.status === 'SUCCESS') {
          // Activer le plan — même logique que le webhook (cas tunnel mort)
          const now = new Date();
          const periodEnd = new Date(now);
          if (subPayment.period === 'annual') {
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
          } else {
            periodEnd.setMonth(periodEnd.getMonth() + 1);
          }

          await this.prisma.$transaction([
            this.prisma.subscriptionPayment.update({
              where: { merchantPaymentReference: merchantRef },
              data: { status: 'SUCCESS', paymentMethod: djomyStatus.paymentMethod, payerIdentifier: djomyStatus.payerIdentifier },
            }),
            this.prisma.tenant.update({
              where: { id: subPayment.tenantId },
              data: {
                subscriptionPlan: subPayment.plan as any,
                subscriptionStatus: 'ACTIVE',
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                trialEndsAt: null,
              },
            }),
            this.prisma.subscriptionHistory.create({
              data: {
                tenantId: subPayment.tenantId,
                plan: subPayment.plan as any,
                status: 'ACTIVE',
                startDate: now,
                endDate: periodEnd,
                amount: subPayment.amount,
                currency: 'GNF',
                paymentMethod: djomyStatus.paymentMethod ?? 'DJOMY',
                paymentId: djomyStatus.transactionId,
              },
            }),
          ]).catch(() => {}); // Silencieux si déjà activé (race condition)

          this.logger.log(`✅ Plan ${subPayment.plan} activé via verify — tenant: ${subPayment.tenantId}`);
          return { success: true, plan: subPayment.plan, period: subPayment.period, amount: subPayment.amount };
        }
      } catch (err) {
        this.logger.warn(`Impossible de vérifier le statut Djomy: ${(err as Error).message}`);
      }
    }

    return { success: false };
  }

  // ─────────────────────────────────────────────
  // STATUT ABONNEMENT COURANT
  // ─────────────────────────────────────────────

  async getSubscriptionStatus(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        subscriptionPlan: true,
        subscriptionStatus: true,
        currentStudentCount: true,
        currentClassCount: true,
        currentUserCount: true,
        trialEndsAt: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
      },
    });

    if (!tenant) throw new BadRequestException('Organisation non trouvée');

    const plan = tenant.subscriptionPlan as Plan;
    const limits = PLAN_LIMITS[plan];

    // Vérifier expiration automatique
    const isExpired =
      tenant.subscriptionStatus === 'ACTIVE' &&
      plan !== Plan.FREE &&
      tenant.currentPeriodEnd &&
      new Date(tenant.currentPeriodEnd) < new Date();

    if (isExpired) {
      // Rétrograder vers FREE si période expirée
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { subscriptionPlan: 'FREE', subscriptionStatus: 'EXPIRED' },
      });
    }

    const effectivePlan = isExpired ? Plan.FREE : plan;
    const effectiveLimits = PLAN_LIMITS[effectivePlan];

    return {
      plan: {
        key: effectivePlan,
        name: PLAN_NAMES[effectivePlan],
        description: PLAN_DESCRIPTIONS[effectivePlan],
      },
      status: isExpired ? 'EXPIRED' : tenant.subscriptionStatus,
      trial: {
        isTrialing: tenant.subscriptionStatus === 'TRIALING',
        endsAt: tenant.trialEndsAt,
      },
      period: {
        start: tenant.currentPeriodStart,
        end: tenant.currentPeriodEnd,
      },
      usage: {
        students: {
          current: tenant.currentStudentCount,
          limit: effectiveLimits.maxStudents === Number.MAX_SAFE_INTEGER ? null : effectiveLimits.maxStudents,
        },
        classes: {
          current: tenant.currentClassCount,
          limit: effectiveLimits.maxClasses === Number.MAX_SAFE_INTEGER ? null : effectiveLimits.maxClasses,
        },
        users: {
          current: tenant.currentUserCount,
          limit: effectiveLimits.maxUsers === Number.MAX_SAFE_INTEGER ? null : effectiveLimits.maxUsers,
        },
      },
      features: effectiveLimits.features,
      pricing: {
        PRO: PLAN_PRICES_GNF[Plan.PRO],
        PRO_PLUS: PLAN_PRICES_GNF[Plan.PRO_PLUS],
      },
    };
  }

  // ─────────────────────────────────────────────
  // ENFORCEMENT DES LIMITES
  // ─────────────────────────────────────────────

  async checkUserLimit(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionPlan: true, currentUserCount: true },
    });
    if (!tenant) throw new BadRequestException('Organisation non trouvée');

    const plan = tenant.subscriptionPlan as Plan;
    const limits = PLAN_LIMITS[plan];

    if (tenant.currentUserCount >= limits.maxUsers) {
      throw new ForbiddenException({
        message: `Limite atteinte : ${limits.maxUsers} utilisateur(s) maximum pour le plan ${PLAN_NAMES[plan]}`,
        code: 'USER_LIMIT_REACHED',
        plan,
        upgradeRequired: true,
      });
    }
  }

  async checkFeatureAccess(tenantId: string, feature: keyof PlanFeatures): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionPlan: true },
    });
    if (!tenant) throw new BadRequestException('Organisation non trouvée');

    const plan = tenant.subscriptionPlan as Plan;

    if (!hasFeature(plan, feature)) {
      throw new ForbiddenException({
        message: `Cette fonctionnalité n'est pas disponible dans votre plan ${PLAN_NAMES[plan]}. Passez au plan Pro pour y accéder.`,
        code: 'FEATURE_NOT_AVAILABLE',
        feature,
        plan,
        upgradeRequired: true,
      });
    }
  }

  // ─────────────────────────────────────────────
  // COMPTEURS
  // ─────────────────────────────────────────────

  async incrementCounter(tenantId: string, type: 'student' | 'class' | 'user'): Promise<void> {
    const fieldMap = {
      student: 'currentStudentCount',
      class: 'currentClassCount',
      user: 'currentUserCount',
    };
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { [fieldMap[type]]: { increment: 1 } },
    });
  }

  async decrementCounter(tenantId: string, type: 'student' | 'class' | 'user'): Promise<void> {
    const fieldMap = {
      student: 'currentStudentCount',
      class: 'currentClassCount',
      user: 'currentUserCount',
    };
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { [fieldMap[type]]: { decrement: 1 } },
    });
  }

  async recalculateCounters(tenantId: string): Promise<void> {
    const [studentsCount, classesCount, usersCount] = await Promise.all([
      this.prisma.student.count({ where: { tenantId } }),
      this.prisma.class.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId } }),
    ]);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        currentStudentCount: studentsCount,
        currentClassCount: classesCount,
        currentUserCount: usersCount,
      },
    });
  }
}
