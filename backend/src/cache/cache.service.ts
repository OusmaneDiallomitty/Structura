import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Service de cache Redis.
 * Fail-safe : si Redis est down, les méthodes retournent null/void sans planter.
 * L'application continue à fonctionner, sans cache.
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: Redis | null = null;

  constructor(private config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn('REDIS_URL non configuré — cache Redis désactivé');
      return;
    }

    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: true,  // File d'attente activée : les commandes attendent la connexion
      maxRetriesPerRequest: 1,
      retryStrategy: () => null, // Ne pas réessayer indéfiniment si Redis est vraiment down
    });

    this.client.on('connect', () => this.logger.log('✅ Redis connecté'));
    this.client.on('error', (err) =>
      this.logger.warn(`Redis indisponible : ${err.message}`),
    );

    // Connexion proactive au démarrage — évite le rejet des premières commandes
    // (avec lazyConnect + TLS Upstash, la connexion peut prendre ~100ms)
    this.client.connect().catch(() => {});
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds = 300): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
    } catch {
      // Redis down — on continue sans cache
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.client || keys.length === 0) return;
    try {
      await this.client.del(...keys);
    } catch {
      // Silencieux
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
  }
}
