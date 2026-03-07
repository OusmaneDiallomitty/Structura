import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { PlanFeatures, hasFeature, PLAN_NAMES, Plan } from '../constants/plans.constants';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheService } from '../../cache/cache.service';

/**
 * Guard qui bloque l'accès si le plan du tenant ne permet pas la feature.
 * Utilise le décorateur @RequireFeature('payments') pour définir la feature requise.
 * Cache Redis 2min — évite 1 requête BDD par appel API protégé.
 *
 * IMPORTANT : doit être utilisé APRÈS JwtAuthGuard pour que req.user soit défini.
 */
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<keyof PlanFeatures>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException({ message: 'Non authentifié', code: 'UNAUTHORIZED' });
    }

    // Cache Redis 2min — évite 1 requête SQL par appel API protégé
    const cacheKey = `plan:${tenantId}`;
    let plan = await this.cache.get<Plan>(cacheKey);

    if (!plan) {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { subscriptionPlan: true },
      });

      if (!tenant) {
        throw new ForbiddenException({ message: 'Organisation non trouvée', code: 'TENANT_NOT_FOUND' });
      }

      plan = tenant.subscriptionPlan as Plan;
      await this.cache.set(cacheKey, plan, 120); // TTL 2 minutes
    }

    if (!hasFeature(plan, feature)) {
      throw new ForbiddenException({
        message: `Cette fonctionnalité n'est pas disponible dans votre plan ${PLAN_NAMES[plan]}. Passez au plan Pro pour y accéder.`,
        code: 'FEATURE_NOT_AVAILABLE',
        feature,
        plan,
        upgradeRequired: true,
        upgradeUrl: '/dashboard/billing',
      });
    }

    return true;
  }
}
