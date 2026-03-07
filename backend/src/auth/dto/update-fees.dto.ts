import { IsOptional, IsString, IsIn, IsObject } from 'class-validator';

export class UpdateFeesDto {
  /** Configuration des frais : global, par niveau ou par classe */
  @IsOptional()
  @IsObject()
  feeConfig?: Record<string, unknown>;

  /** Fréquence de paiement */
  @IsOptional()
  @IsString()
  @IsIn(['monthly', 'quarterly', 'annual'])
  paymentFrequency?: string;

  /** Calendrier scolaire : mois de début et durée */
  @IsOptional()
  @IsObject()
  schoolCalendar?: Record<string, unknown>;
}
