import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

@Injectable()
export class CommerceModuleGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenantId) {
      throw new ForbiddenException('Tenant introuvable');
    }

    // ✅ Fast path : moduleType est déjà dans le JWT (injecté par jwt.strategy.ts)
    // Évite un aller-retour Redis (~22ms) sur chaque requête commerce
    if (user?.moduleType) {
      if (user.moduleType !== 'COMMERCE') {
        throw new ForbiddenException('Accès refusé: module Commerce uniquement');
      }
      return true; // JWT fait foi — pas besoin de toucher Redis/DB
    }

    // Fallback : JWT sans moduleType (anciens tokens) → vérifier en BDD + cache Redis
    const cacheKey = `tenant:moduleType:${user.tenantId}`;
    let moduleType = await this.cache.get<string>(cacheKey);

    if (!moduleType) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: user.tenantId },
        select: { moduleType: true },
      });
      moduleType = tenant?.moduleType ?? 'SCHOOL';
      await this.cache.set(cacheKey, moduleType, 600);
    }

    if (moduleType !== 'COMMERCE') {
      throw new ForbiddenException('Ce tenant est configuré en mode École, pas Commerce');
    }

    return true;
  }
}
