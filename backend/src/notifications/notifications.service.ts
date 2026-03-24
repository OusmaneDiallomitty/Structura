import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as webpush from 'web-push';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const publicKey  = this.config.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.config.get<string>('VAPID_PRIVATE_KEY');
    const subject    = this.config.get<string>('VAPID_SUBJECT') ?? 'mailto:admin@structura.app';

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('Web Push VAPID configuré ✓');
    } else {
      this.logger.warn('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquants — push désactivé');
    }
  }

  // ─── Clé publique VAPID (frontend en a besoin pour s'abonner) ─────────────

  getVapidPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY') ?? '';
  }

  // ─── Sauvegarde subscription push ─────────────────────────────────────────

  async saveSubscription(
    userId: string,
    tenantId: string,
    endpoint: string,
    p256dh: string,
    auth: string,
    userAgent?: string,
  ) {
    await this.prisma.pushSubscription.upsert({
      where: { userId_endpoint: { userId, endpoint } },
      create: { userId, tenantId, endpoint, p256dh, auth, userAgent },
      update: { p256dh, auth, userAgent, updatedAt: new Date() },
    });
    this.logger.log(`Push subscription sauvegardée — user: ${userId}`);
  }

  // ─── Suppression subscription (déconnexion ou révocation) ─────────────────

  async removeSubscription(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint },
    });
  }

  // ─── Créer notification in-app + envoyer push ──────────────────────────────

  async notify(
    userId: string,
    tenantId: string,
    type: string,
    title: string,
    body: string,
    url?: string,
  ) {
    // 1. Sauvegarder en BDD (in-app)
    await this.prisma.notification.create({
      data: { userId, tenantId, type, title, body, url },
    });

    // 2. Envoyer push sur tous les appareils de l'utilisateur
    await this.sendPushToUser(userId, title, body, url);
  }

  // ─── Notifier tous les directeurs d'un tenant ─────────────────────────────

  async notifyDirectors(
    tenantId: string,
    type: string,
    title: string,
    body: string,
    url?: string,
  ) {
    const directors = await this.prisma.user.findMany({
      where: { tenantId, role: 'DIRECTOR', isActive: true },
      select: { id: true },
    });

    await Promise.all(
      directors.map((d) => this.notify(d.id, tenantId, type, title, body, url)),
    );
  }

  // ─── Notifier tous les profs d'une classe ─────────────────────────────────

  async notifyTeachersOfClass(
    tenantId: string,
    classId: string,
    type: string,
    title: string,
    body: string,
    url?: string,
  ) {
    const teachers = await this.prisma.user.findMany({
      where: { tenantId, role: 'TEACHER', isActive: true },
      select: { id: true, classAssignments: true },
    });

    const relevant = teachers.filter((t) => {
      const assignments = t.classAssignments as Array<{ classId: string }> | null;
      return assignments?.some((a) => a.classId === classId);
    });

    await Promise.all(
      relevant.map((t) => this.notify(t.id, tenantId, type, title, body, url)),
    );
  }

  // ─── Récupérer notifications d'un utilisateur ─────────────────────────────

  async getNotifications(userId: string, limit = 30) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async markAsRead(userId: string, notificationId: string) {
    return this.prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { read: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  async deleteNotification(userId: string, notificationId: string) {
    return this.prisma.notification.deleteMany({
      where: { id: notificationId, userId },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, read: false },
    });
  }

  // ─── Envoi Web Push bas niveau ────────────────────────────────────────────

  private async sendPushToUser(userId: string, title: string, body: string, url?: string) {
    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId },
    });

    await Promise.all(
      subscriptions.map((sub) => this.sendPush(sub, title, body, url)),
    );
  }

  private async sendPush(
    sub: { endpoint: string; p256dh: string; auth: string; id: string; userId: string },
    title: string,
    body: string,
    url?: string,
  ) {
    const payload = JSON.stringify({ title, body, url, icon: '/logo.png', badge: '/logo.png' });

    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
    } catch (err: any) {
      // 410 Gone = subscription expirée → supprimer
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await this.prisma.pushSubscription.deleteMany({
          where: { id: sub.id },
        });
        this.logger.log(`Subscription expirée supprimée — user: ${sub.userId}`);
      } else {
        this.logger.error(`Erreur push: ${err?.message}`);
      }
    }
  }

  // ─── Helper : vérifie si aujourd'hui est un jour de cours pour un tenant ──

  private isTodaySchoolDay(schoolDays: Record<string, unknown> | null): boolean {
    const day = new Date().getDay(); // 0=Dim, 1=Lun, 2=Mar, 3=Mer, 4=Jeu, 5=Ven, 6=Sam
    if (day === 0) return false; // Dimanche toujours congé

    // Nouveau format : { monday, tuesday, wednesday, thursday, friday, saturday }
    const keys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const key = keys[day];
    if (schoolDays && key in schoolDays) {
      return schoolDays[key] === true;
    }

    // Ancien format : { saturday?, thursdayOff? }
    if (day === 6 && !schoolDays?.saturday) return false;
    if (day === 4 && schoolDays?.thursdayOff) return false;
    return true;
  }

  // ─── Cron : Rappel présences non saisies (Lun–Sam à 9h) ──────────────────

  @Cron('0 9 * * 1-6')
  async remindAttendance() {
    this.logger.log('Cron: vérification présences non saisies...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const teachers = await this.prisma.user.findMany({
      where: { role: 'TEACHER', isActive: true },
      select: { id: true, tenantId: true, classAssignments: true },
    });

    // Regrouper les profs par tenant pour éviter de charger le tenant plusieurs fois
    const tenantCache = new Map<string, Record<string, unknown> | null>();

    for (const teacher of teachers) {
      const assignments = teacher.classAssignments as Array<{ classId: string }> | null;
      if (!assignments?.length) continue;

      // Vérifier si aujourd'hui est un jour de cours pour ce tenant
      if (!tenantCache.has(teacher.tenantId)) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: teacher.tenantId },
          select: { schoolDays: true },
        });
        tenantCache.set(
          teacher.tenantId,
          (tenant?.schoolDays as Record<string, unknown> | null) ?? null,
        );
      }
      const schoolDays = tenantCache.get(teacher.tenantId) ?? null;
      if (!this.isTodaySchoolDay(schoolDays)) continue;

      const classIds = assignments.map((a) => a.classId);

      const existing = await this.prisma.attendance.findFirst({
        where: { classId: { in: classIds }, tenantId: teacher.tenantId, date: { gte: today } },
      });

      if (!existing) {
        await this.notify(
          teacher.id,
          teacher.tenantId,
          'ATTENDANCE',
          'Rappel : présences',
          "Vous n'avez pas encore saisi les présences d'aujourd'hui.",
          '/dashboard/attendance',
        );
      }
    }
  }

  // ─── Cron : Alerte paiements en retard (1er du mois à 8h) ────────────────

  @Cron('0 8 1 * *')
  async remindOverduePayments() {
    this.logger.log('Cron: vérification paiements en retard...');

    const tenants = await this.prisma.tenant.findMany({
      where: { isActive: true },
      select: { id: true },
    });

    for (const tenant of tenants) {
      const overdueCount = await this.prisma.student.count({
        where: { tenantId: tenant.id, status: 'ACTIVE', paymentStatus: { in: ['OVERDUE', 'PENDING'] } },
      });

      if (overdueCount === 0) continue;

      await this.notifyDirectors(
        tenant.id,
        'PAYMENT_OVERDUE',
        'Paiements en retard',
        `${overdueCount} élève${overdueCount > 1 ? 's ont' : ' a'} des paiements en retard ce mois-ci.`,
        '/dashboard/payments',
      );
    }
  }

  // ─── Cron : Abonnement Structura expire bientôt (tous les jours à 10h) ────

  @Cron('0 10 * * *')
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
      await this.notifyDirectors(
        tenant.id,
        'SUBSCRIPTION_EXPIRY',
        'Abonnement bientôt expiré',
        'Votre abonnement Structura expire dans moins de 7 jours. Renouvelez pour continuer.',
        '/dashboard/billing',
      );
    }
  }
}
