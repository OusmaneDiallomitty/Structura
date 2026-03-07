import { IsEnum, IsIn, IsString, Matches } from 'class-validator';

export class CreateCheckoutDto {
  @IsEnum(['PRO', 'PRO_PLUS'], { message: 'Plan invalide. Valeurs acceptées: PRO, PRO_PLUS' })
  plan: 'PRO' | 'PRO_PLUS';

  @IsIn(['monthly', 'annual'], { message: 'Période invalide. Valeurs acceptées: monthly, annual' })
  period: 'monthly' | 'annual';

  /**
   * Numéro de téléphone du payeur au format international.
   * Requis par Djomy même pour les paiements gateway (pré-remplit leur portail).
   * Ex : 00224623707722
   */
  @IsString()
  @Matches(/^\+?[0-9]{10,15}$/, {
    message: 'Numéro de téléphone invalide. Format attendu: 00224XXXXXXXXX ou 6XXXXXXXX',
  })
  payerNumber: string;
}
