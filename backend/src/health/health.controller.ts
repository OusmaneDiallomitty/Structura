import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './health.indicator';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaIndicator: PrismaHealthIndicator,
  ) {}

  /**
   * GET /api/health
   * Endpoint de vérification de santé — utilisé par les load balancers et outils de monitoring.
   * Vérifie : base de données PostgreSQL
   */
  @Get()
  @SkipThrottle()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaIndicator.pingCheck('database'),
    ]);
  }
}
