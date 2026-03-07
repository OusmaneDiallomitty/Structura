import {
  IsString,
  IsDateString,
  IsBoolean,
  IsOptional,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export class CreateAcademicYearDto {
  @IsString()
  name: string; // "2026-2027"

  @IsDateString()
  @IsOptional()
  startDate?: string; // Optionnel : date exacte d'ouverture

  @IsDateString()
  @IsOptional()
  endDate?: string; // Optionnel : date exacte de fermeture

  @IsString()
  @IsOptional()
  startMonth?: string; // "Octobre" — mois de rentrée

  @IsInt()
  @Min(1)
  @Max(12)
  @IsOptional()
  durationMonths?: number; // 9 — durée en mois

  @IsBoolean()
  @IsOptional()
  isCurrent?: boolean;
}
