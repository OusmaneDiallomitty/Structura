import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CacheService } from '../cache/cache.service';
import { StudentStatus } from '@prisma/client';

// Le modèle Payment stocke le statut en chaîne minuscule (ex: 'paid', 'partial')
// → ne pas utiliser l'enum PaymentStatus ici
const PAID_STATUSES   = ['paid', 'partial'] as const;
const PENDING_STATUSES = ['pending', 'overdue'] as const;

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Récupérer les statistiques générales du dashboard
   * Cache Redis 60s — données actualisées chaque minute max
   */
  async getDashboardStats(tenantId: string) {
    const cacheKey = `dashboard:stats:${tenantId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const result = await this.computeDashboardStats(tenantId);
    await this.cache.set(cacheKey, result, 60);
    return result;
  }

  private async computeDashboardStats(tenantId: string) {
    const [
      totalStudents,
      totalClasses,
      todayAttendance,
      pendingPayments,
      monthRevenue,
      recentStudents,
      recentPayments,
    ] = await Promise.all([
      // Total élèves actifs
      this.prisma.student.count({
        where: {
          tenantId,
          status: StudentStatus.ACTIVE,
        },
      }),

      // Total classes
      this.prisma.class.count({
        where: { tenantId },
      }),

      // Présences du jour
      this.getTodayAttendance(tenantId),

      // Paiements en attente
      this.prisma.payment.count({
        where: {
          tenantId,
          status: { in: [...PENDING_STATUSES] },
        },
      }),

      // Revenus du mois en cours
      this.getMonthRevenue(tenantId),

      // 5 derniers élèves inscrits
      this.prisma.student.findMany({
        where: { tenantId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          matricule: true,
          createdAt: true,
        },
      }),

      // 5 derniers paiements
      this.prisma.payment.findMany({
        where: { tenantId },
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    // Calculer les statistiques dérivées
    const totalStudentsLastMonth = await this.getTotalStudentsLastMonth(tenantId);
    const studentsChange = totalStudents - totalStudentsLastMonth;

    const totalClassesLastMonth = await this.getTotalClassesLastMonth(tenantId);
    const classesChange = totalClasses - totalClassesLastMonth;

    const lastMonthRevenue = await this.getLastMonthRevenue(tenantId);
    const revenueChange = lastMonthRevenue > 0
      ? ((monthRevenue - lastMonthRevenue) / lastMonthRevenue * 100).toFixed(1)
      : '0.0';

    const attendanceRate = todayAttendance.total > 0
      ? ((todayAttendance.present / todayAttendance.total) * 100).toFixed(1)
      : '0.0';

    const lastMonthAttendanceRate = await this.getLastMonthAttendanceRate(tenantId);
    const attendanceRateChange = (parseFloat(attendanceRate) - lastMonthAttendanceRate).toFixed(1);

    return {
      stats: {
        totalStudents,
        studentsChange,
        totalClasses,
        classesChange,
        monthRevenue,
        revenueChange: `${revenueChange}%`,
        attendanceRate: `${attendanceRate}%`,
        attendanceRateChange: `${attendanceRateChange}%`,
        presentToday: todayAttendance.present,
        absentToday: todayAttendance.absent,
        pendingPayments,
      },
      recentStudents,
      recentPayments: recentPayments.map(p => ({
        id: p.id,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        studentName: `${p.student.firstName} ${p.student.lastName}`,
        createdAt: p.createdAt,
      })),
    };
  }

  /**
   * Récupérer les présences du jour
   */
  private async getTodayAttendance(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    const present = attendances.filter(a => a.status === 'PRESENT' || a.status === 'present').length;
    const absent  = attendances.filter(a => a.status === 'ABSENT'  || a.status === 'absent').length;

    return {
      total: attendances.length,
      present,
      absent,
    };
  }

  /**
   * Récupérer le revenu du mois en cours
   */
  private async getMonthRevenue(tenantId: string) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const result = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        createdAt: { gte: startOfMonth },
        status: { in: [...PAID_STATUSES] },
      },
      _sum: { amount: true },
    });

    return result._sum.amount ?? 0;
  }

  /**
   * Total élèves le mois dernier
   */
  private async getTotalStudentsLastMonth(tenantId: string) {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    return this.prisma.student.count({
      where: {
        tenantId,
        status: StudentStatus.ACTIVE,
        createdAt: {
          lte: lastMonth,
        },
      },
    });
  }

  /**
   * Total classes le mois dernier
   */
  private async getTotalClassesLastMonth(tenantId: string) {
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    return this.prisma.class.count({
      where: {
        tenantId,
        createdAt: {
          lte: lastMonth,
        },
      },
    });
  }

  /**
   * Revenu du mois dernier
   */
  private async getLastMonthRevenue(tenantId: string) {
    const startOfLastMonth = new Date();
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    startOfLastMonth.setDate(1);
    startOfLastMonth.setHours(0, 0, 0, 0);

    const startOfThisMonth = new Date();
    startOfThisMonth.setDate(1);
    startOfThisMonth.setHours(0, 0, 0, 0);

    const result = await this.prisma.payment.aggregate({
      where: {
        tenantId,
        createdAt: { gte: startOfLastMonth, lt: startOfThisMonth },
        status: { in: [...PAID_STATUSES] },
      },
      _sum: { amount: true },
    });

    return result._sum.amount ?? 0;
  }

  /**
   * Taux de présence du mois dernier
   */
  private async getLastMonthAttendanceRate(tenantId: string) {
    const startOfLastMonth = new Date();
    startOfLastMonth.setMonth(startOfLastMonth.getMonth() - 1);
    startOfLastMonth.setDate(1);
    startOfLastMonth.setHours(0, 0, 0, 0);

    const startOfThisMonth = new Date();
    startOfThisMonth.setDate(1);
    startOfThisMonth.setHours(0, 0, 0, 0);

    const attendances = await this.prisma.attendance.findMany({
      where: {
        tenantId,
        date: {
          gte: startOfLastMonth,
          lt: startOfThisMonth,
        },
      },
    });

    if (attendances.length === 0) return 0;

    const present = attendances.filter(a => a.status === 'PRESENT' || a.status === 'present').length;
    return (present / attendances.length) * 100;
  }

  /**
   * Statistiques pour une période donnée
   */
  async getStatsForPeriod(tenantId: string, startDate: Date, endDate: Date) {
    const [students, payments, attendances] = await Promise.all([
      this.prisma.student.count({
        where: {
          tenantId,
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
      this.prisma.payment.aggregate({
        where: {
          tenantId,
          createdAt: { gte: startDate, lte: endDate },
          status: { in: [...PAID_STATUSES] },
        },
        _sum: { amount: true },
      }),
      this.prisma.attendance.findMany({
        where: {
          tenantId,
          date: {
            gte: startDate,
            lte: endDate,
          },
        },
      }),
    ]);

    const present = attendances.filter(a => a.status === 'present').length;
    const attendanceRate = attendances.length > 0
      ? ((present / attendances.length) * 100).toFixed(1)
      : '0.0';

    return {
      period: {
        startDate,
        endDate,
      },
      newStudents: students,
      totalRevenue: payments._sum.amount || 0,
      attendanceRate: `${attendanceRate}%`,
      totalAttendances: attendances.length,
    };
  }

  /**
   * Activités récentes (dernières actions)
   */
  async getRecentActivities(tenantId: string, limit: number = 10) {
    const [recentStudents, recentPayments, recentAttendances] = await Promise.all([
      // Nouveaux élèves
      this.prisma.student.findMany({
        where: { tenantId },
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          createdAt: true,
        },
      }),

      // Paiements récents
      this.prisma.payment.findMany({
        where: { tenantId },
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          currency: true,
          createdAt: true,
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
        },
      }),

      // Absences récentes
      this.prisma.attendance.findMany({
        where: {
          tenantId,
          status: 'absent',
        },
        take: 3,
        orderBy: { createdAt: 'desc' },
        include: {
          student: {
            select: {
              firstName: true,
              lastName: true,
            },
          },
          class: {
            select: {
              name: true,
            },
          },
        },
      }),
    ]);

    // Combiner et trier toutes les activités
    const activities: any[] = [];

    recentStudents.forEach(student => {
      activities.push({
        type: 'student',
        message: `Nouvel élève inscrit : ${student.firstName} ${student.lastName}`,
        time: student.createdAt,
        icon: 'Users',
        link: `/dashboard/students/${student.id}`,
      });
    });

    recentPayments.forEach(payment => {
      activities.push({
        type: 'payment',
        message: `Paiement reçu : ${payment.amount.toLocaleString()} ${payment.currency} — ${payment.student.firstName} ${payment.student.lastName}`,
        time: payment.createdAt,
        icon: 'DollarSign',
        link: `/dashboard/payments`,
      });
    });

    recentAttendances.forEach(attendance => {
      activities.push({
        type: 'absence',
        message: `Absence signalée : ${attendance.student.firstName} ${attendance.student.lastName} — ${attendance.class.name}`,
        time: attendance.createdAt,
        icon: 'UserX',
        link: `/dashboard/attendance`,
      });
    });

    // Trier par date décroissante et limiter
    return activities
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, limit);
  }

  /**
   * Données graphique paiements (6 derniers mois)
   * Cache Redis 10 min — données historiques, peu volatiles
   */
  async getPaymentsChartData(tenantId: string) {
    const cacheKey = `dashboard:chart:payments:${tenantId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const data = await this.computePaymentsChartData(tenantId);
    await this.cache.set(cacheKey, data, 600);
    return data;
  }

  private async computePaymentsChartData(tenantId: string) {
    const months = [];
    const now = new Date();

    // Générer les 6 derniers mois
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(date);
    }

    const data = await Promise.all(
      months.map(async (month) => {
        const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);

        const payments = await this.prisma.payment.findMany({
          where: {
            tenantId,
            createdAt: {
              gte: month,
              lt: nextMonth,
            },
          },
        });

        const paid = payments
          .filter(p => PAID_STATUSES.includes(p.status as any))
          .reduce((sum, p) => sum + p.amount, 0);

        const pending = payments
          .filter(p => PENDING_STATUSES.includes(p.status as any))
          .reduce((sum, p) => sum + p.amount, 0);

        const total = paid + pending;

        return {
          month: month.toLocaleDateString('fr-FR', { month: 'short' }),
          total,
          paid,
          pending,
        };
      }),
    );

    return data;
  }

  /**
   * Données graphique présences (6 derniers mois)
   * Cache Redis 10 min — données historiques, peu volatiles
   */
  async getAttendanceChartData(tenantId: string) {
    const cacheKey = `dashboard:chart:attendance:${tenantId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const data = await this.computeAttendanceChartData(tenantId);
    await this.cache.set(cacheKey, data, 600);
    return data;
  }

  private async computeAttendanceChartData(tenantId: string) {
    const months = [];
    const now = new Date();

    // Générer les 6 derniers mois
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(date);
    }

    const data = await Promise.all(
      months.map(async (month) => {
        const nextMonth = new Date(month.getFullYear(), month.getMonth() + 1, 1);

        const attendances = await this.prisma.attendance.findMany({
          where: {
            tenantId,
            date: {
              gte: month,
              lt: nextMonth,
            },
          },
        });

        const present = attendances.filter(a => a.status === 'PRESENT' || a.status === 'present').length;
        const absent  = attendances.filter(a => a.status === 'ABSENT'  || a.status === 'absent').length;

        return {
          month: month.toLocaleDateString('fr-FR', { month: 'short' }),
          present,
          absent,
        };
      }),
    );

    return data;
  }

  /**
   * Distribution des élèves par classe
   * Cache Redis 5 min — change seulement lors d'inscriptions
   */
  async getStudentsDistribution(tenantId: string) {
    const cacheKey = `dashboard:distribution:${tenantId}`;
    const cached = await this.cache.get<any>(cacheKey);
    if (cached) return cached;

    const data = await this.computeStudentsDistribution(tenantId);
    await this.cache.set(cacheKey, data, 300);
    return data;
  }

  private async computeStudentsDistribution(tenantId: string) {
    const classes = await this.prisma.class.findMany({
      where: { tenantId },
      include: {
        _count: {
          select: {
            students: {
              where: {
                status: StudentStatus.ACTIVE,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
      take: 10, // Top 10 classes
    });

    return classes.map(c => ({
      name: c.name,
      value: c._count.students,
    }));
  }
}
