import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { UsersModule } from './users/users.module';
import { StudentsModule } from './students/students.module';
import { ClassesModule } from './classes/classes.module';
import { AttendanceModule } from './attendance/attendance.module';
import { PaymentsModule } from './payments/payments.module';
import { GradesModule } from './grades/grades.module';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { SetupModule } from './setup/setup.module';
import { AcademicYearsModule } from './academic-years/academic-years.module';
import { CacheModule } from './cache/cache.module';
import { HealthModule } from './health/health.module';
import { AdminModule } from './admin/admin.module';
import { ContactModule } from './contact/contact.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExpensesModule } from './expenses/expenses.module';
import { PayrollModule } from './payroll/payroll.module';

@Module({
  imports: [
    // Configuration globale
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate limiting (ThrottlerModule v6 — ttl en millisecondes)
    // Protège contre les abus sans bloquer les utilisateurs légitimes
    ThrottlerModule.forRoot([
      {
        // Limite légère globale par IP — ne bloque pas le dashboard (10 appels parallèles)
        name: 'global',
        ttl: 60_000,   // 60 secondes
        limit: 600,    // 600 req/IP/min = 10 req/sec — confortable pour un dashboard
      },
      {
        // Fenêtre courte : anti-burst agressif (ex: script qui spamme en 1 seconde)
        name: 'burst',
        ttl: 1_000,    // 1 seconde
        limit: 30,     // Max 30 req/IP/sec — bloque les bots, pas les users réels
      },
      {
        // Auth strict : brute-force protection (login, register, forgot-password)
        name: 'auth',
        ttl: 60_000,   // 60 secondes
        limit: 5,      // 5 tentatives par minute — inchangé ✅
      },
    ]),
    // Cron jobs (notifications push)
    ScheduleModule.forRoot(),
    // Infrastructure
    CacheModule,
    HealthModule,
    // Modules
    PrismaModule,
    AuthModule,
    UsersModule,
    StudentsModule,
    ClassesModule,
    AttendanceModule,
    PaymentsModule,
    GradesModule,
    SubscriptionsModule,
    DashboardModule,
    SetupModule,
    AcademicYearsModule,
    AdminModule,
    ContactModule,
    NotificationsModule,
    ExpensesModule,
    PayrollModule,
  ],
  providers: [
    // ThrottlerGuard appliqué UNIQUEMENT sur les endpoints auth et checkout via @UseGuards()
    // Les endpoints data (classes, élèves, notes…) sont protégés par JWT — pas besoin de throttle.
    {
      provide: APP_INTERCEPTOR,
      useClass: TenantInterceptor,
    },
  ],
})
export class AppModule { }
