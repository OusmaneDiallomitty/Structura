import { IsOptional, IsString, IsIn, IsObject, IsArray } from 'class-validator';

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

  /** Type d'école : privée ou publique */
  @IsOptional()
  @IsString()
  @IsIn(['private', 'public'])
  schoolType?: string;

  /** Postes de frais ponctuels (école publique) */
  @IsOptional()
  @IsArray()
  feeItems?: Record<string, unknown>[];

  /** Jours de cours : samedi et jeudi */
  @IsOptional()
  @IsObject()
  schoolDays?: Record<string, unknown>;
}
