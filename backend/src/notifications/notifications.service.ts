import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly appId = process.env.ONESIGNAL_APP_ID ?? '';
  private readonly apiKey = process.env.ONESIGNAL_REST_API_KEY ?? '';

  constructor(private readonly prisma: PrismaService) {}

  // ─── Sauvegarde du pushSubscriptionId en BDD ───────────────────────────────

  async saveSubscription(userId: string, tenantId: string, subscriptionId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pushSubscriptionId: subscriptionId },
    });
    this.logger.log(`Push subscription sauvegardée — user: ${userId}`);
  }

  // ─── Envoi via OneSignal REST API ──────────────────────────────────────────

  async sendToSubscription(subscriptionId: string, title: string, body: string, url?: string) {
    if (!this.appId || !this.apiKey) {
      this.logger.warn('OneSignal non configuré (ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY manquants)');
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        app_id: this.appId,
        include_subscription_ids: [subscriptionId],
        headings: { fr: title, en: title },
        contents: { fr: body, en: body },
      };

      if (url) payload.url = url;

      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.error(`OneSignal erreur: ${err}`);
      }
    } catch (error) {
      this.logger.error('Erreur envoi push notification', error);
    }
  }

  async sendToTenant(tenantId: string, title: string, body: string, url?: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, pushSubscriptionId: { not: null }, isActive: true },
      select: { pushSubscriptionId: true },
    });

    const ids = users.map((u) => u.pushSubscriptionId).filter(Boolean) as string[];
    if (!ids.length) return;

    await this.sendBulk(ids, title, body, url);
  }

  async sendToUser(userId: string, title: string, body: string, url?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushSubscriptionId: true },
    });

    if (!user?.pushSubscriptionId) return;
    await this.sendToSubscription(user.pushSubscriptionId, title, body, url);
  }

  private async sendBulk(subscriptionIds: string[], title: string, body: string, url?: string) {
    if (!this.appId || !this.apiKey || !subscriptionIds.length) return;

    try {
      const payload: Record<string, unknown> = {
        app_id: this.appId,
        include_subscription_ids: subscriptionIds,
        headings: { fr: title, en: title },
        contents: { fr: body, en: body },
      };

      if (url) payload.url = url;

      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Key ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.text();
        this.logger.error(`OneSignal bulk erreur: ${err}`);
      }
    } catch (error) {
      this.logger.error('Erreur envoi bulk notifications', error);
    }
  }

  // ─── Cron : Rappel présences non saisies (tous les jours à 9h) ────────────

  @Cron('0 9 * * 1-6') // Lun-Sam à 9h00
  async remindAttendance() {
    this.logger.log('Cron: vérification présences non saisies...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Récupère les profs actifs avec une subscription push
    const teachers = await this.prisma.user.findMany({
      where: {
        role: 'TEACHER',
        isActive: true,
        pushSubscriptionId: { not: null },
      },
      select: { id: true, pushSubscriptionId: true, tenantId: true, classAssignments: true },
    });

    for (const teacher of teachers) {
      const assignments = teacher.classAssignments as Array<{ classId: string }> | null;
      if (!assignments?.length) continue;

      const classIds = assignments.map((a) => a.classId);

      // Vérifie si des présences ont déjà été saisies aujourd'hui pour ses classes
      const existingAttendance = await this.prisma.attendance.findFirst({
        where: {
          classId: { in: classIds },
          tenantId: teacher.tenantId,
          date: { gte: today },
        },
      });

      if (!existingAttendance && teacher.pushSubscriptionId) {
        await this.sendToSubscription(
          teacher.pushSubscriptionId,
          'Rappel : présences',
          "Vous n'avez pas encore saisi les présences d'aujourd'hui.",
          '/dashboard/attendance',
        );
      }
    }
  }

  // ─── Cron : Alerte paiements en retard (1er de chaque mois à 8h) ──────────

  @Cron('0 8 1 * *') // 1er du mois à 8h00
  async remindOverduePayments() {
    this.logger.log('Cron: vérification paiements en retard...');

    // Récupère tous les tenants actifs
    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const tenant of tenants) {
      const overdueCount = await this.prisma.student.count({
        where: {
          tenantId: tenant.id,
          status: 'ACTIVE',
          paymentStatus: { in: ['OVERDUE', 'PENDING'] },
        },
      });

      if (overdueCount === 0) continue;

      // Notifie le(s) directeur(s) du tenant
      const directors = await this.prisma.user.findMany({
        where: {
          tenantId: tenant.id,
          role: 'DIRECTOR',
          isActive: true,
          pushSubscriptionId: { not: null },
        },
        select: { pushSubscriptionId: true },
      });

      for (const director of directors) {
        if (!director.pushSubscriptionId) continue;
        await this.sendToSubscription(
          director.pushSubscriptionId,
          'Paiements en retard',
          `${overdueCount} élève${overdueCount > 1 ? 's ont' : ' a'} des paiements en retard ce mois-ci.`,
          '/dashboard/payments',
        );
      }
    }
  }

  // ─── Cron : Alerte abonnement Structura expire bientôt (J-7 à 10h) ────────

  @Cron('0 10 * * *') // Tous les jours à 10h00
  async remindSubscriptionExpiry() {
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    in7Days.setHours(23, 59, 59, 999);

    const now = new Date();

    const expiringTenants = await this.prisma.tenant.findMany({
      where: {
        isActive: true,
        subscriptionPlan: { not: 'FREE' },
        currentPeriodEnd: { gte: now, lte: in7Days },
      },
      select: { id: true },
    });

    for (const tenant of expiringTenants) {
      const directors = await this.prisma.user.findMany({
        where: {
          tenantId: tenant.id,
          role: 'DIRECTOR',
          isActive: true,
          pushSubscriptionId: { not: null },
        },
        select: { pushSubscriptionId: true },
      });

      for (const director of directors) {
        if (!director.pushSubscriptionId) continue;
        await this.sendToSubscription(
          director.pushSubscriptionId,
          'Abonnement bientôt expiré',
          'Votre abonnement Structura expire dans moins de 7 jours. Renouvelez pour continuer.',
          '/dashboard/billing',
        );
      }
    }
  }
}
