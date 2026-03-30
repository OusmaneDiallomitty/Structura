import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class ConfigureConversionDto {
  @IsString()
  purchaseUnit: string; // tonne, palette, carton, boîte, etc

  @IsNumber()
  @Min(0.001, { message: 'Facteur de conversion doit être > 0' })
  conversionFactor: number; // Ex: 1 tonne = 1000 sacs → 1000

  @IsString()
  conversionNote: string; // Ex: "1 tonne de riz = 1000 sacs"
}
