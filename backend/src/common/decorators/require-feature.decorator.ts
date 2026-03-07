import { SetMetadata } from '@nestjs/common';
import { PlanFeatures } from '../constants/plans.constants';

export const FEATURE_KEY = 'require_feature';

/**
 * Marque une route comme nécessitant une feature spécifique du plan.
 * Utilisé avec PlanFeatureGuard.
 *
 * Exemple :
 *   @UseGuards(JwtAuthGuard, PlanFeatureGuard)
 *   @RequireFeature('payments')
 *   @Post()
 *   createPayment() { ... }
 */
export const RequireFeature = (feature: keyof PlanFeatures) =>
  SetMetadata(FEATURE_KEY, feature);
