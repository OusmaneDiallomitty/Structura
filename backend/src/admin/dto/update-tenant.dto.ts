import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { SubscriptionPlan, SubscriptionStatus } from '@prisma/client';

export class UpdateTenantDto {
  /** Activer / désactiver l'accès au tenant */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /** Changer le plan d'abonnement */
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  subscriptionPlan?: SubscriptionPlan;

  /** Changer le statut d'abonnement */
  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  /** Date de fin de trial */
  @IsOptional()
  @IsDateString()
  trialEndsAt?: string;

  /** Date de début de la période courante */
  @IsOptional()
  @IsDateString()
  currentPeriodStart?: string;

  /** Date de fin de la période courante */
  @IsOptional()
  @IsDateString()
  currentPeriodEnd?: string;

  /** Note interne admin */
  @IsOptional()
  @IsString()
  notes?: string;
}
