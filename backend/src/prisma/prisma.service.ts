import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Configuration Prisma avec logs
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });

    this.logger.log(`✅ PrismaClient initialized (URL hardcoded in schema.prisma for Windows)`);
  }

  async onModuleInit() {
    try {
      // Connecter explicitement à la base de données
      await this.$connect();
      this.logger.log('✅ Database connected successfully');

      // Tester la connexion avec une requête simple
      await this.$queryRaw`SELECT 1`;
      this.logger.log('✅ Database connection test passed');
    } catch (error) {
      this.logger.error('❌ Failed to connect to database', error.message);
      throw error;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('🔌 Database disconnected');
  }

  /**
   * Masquer le mot de passe dans l'URL pour les logs
   */
  private maskDatabaseUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.password) {
        urlObj.password = '****';
      }
      return urlObj.toString();
    } catch {
      return 'postgresql://***:***@localhost:5432/***';
    }
  }
}
