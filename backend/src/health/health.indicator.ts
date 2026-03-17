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
      // Neon ferme les connexions inactives — on force une reconnexion et on réessaie
      try {
        await this.prisma.$disconnect();
        await this.prisma.$connect();
        await this.prisma.$queryRaw`SELECT 1`;
        return this.getStatus(key, true);
      } catch (retryError: any) {
        return this.getStatus(key, false, { error: retryError.message });
      }
    }
  }
}
