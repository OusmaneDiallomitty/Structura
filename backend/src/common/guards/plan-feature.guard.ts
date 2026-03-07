import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/require-feature.decorator';
import { PlanFeatures, hasFeature, PLAN_NAMES, Plan } from '../constants/plans.constants';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Guard qui bloque l'accès si le plan du tenant ne permet pas la feature.
 * Utilise le décorateur @RequireFeature('payments') pour définir la feature requise.
 *
 * IMPORTANT : doit être utilisé APRÈS JwtAuthGuard pour que req.user soit défini.
 */
@Injectable()
export class PlanFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Lire la feature requise depuis les métadonnées du handler ou de la classe
    const feature = this.reflector.getAllAndOverride<keyof PlanFeatures>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Si aucune feature requise, laisser passer
    if (!feature) return true;

    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.user?.tenantId;

    // Pas de tenantId = pas authentifié (JwtAuthGuard doit avoir été placé avant)
    if (!tenantId) {
      throw new ForbiddenException({
        message: 'Non authentifié',
        code: 'UNAUTHORIZED',
      });
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { subscriptionPlan: true },
    });

    if (!tenant) {
      throw new ForbiddenException({
        message: 'Organisation non trouvée',
        code: 'TENANT_NOT_FOUND',
      });
    }

    const plan = tenant.subscriptionPlan as Plan;

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
