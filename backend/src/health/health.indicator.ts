import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private prisma: PrismaService) {
    super();
  }

  async pingCheck(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true);
    } catch {
      // Neon (serverless PG) ferme les connexions inactives après un timeout.
      // Prisma recrée automatiquement une connexion au prochain appel — un retry
      // simple suffit. On évite $disconnect()/$connect() qui est un singleton
      // partagé et couperait les requêtes en cours des autres utilisateurs.
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        return this.getStatus(key, true);
      } catch (retryError: any) {
        return this.getStatus(key, false, { error: retryError.message });
      }
    }
  }
}
