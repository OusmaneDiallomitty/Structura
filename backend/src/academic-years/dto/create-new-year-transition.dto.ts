import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
} from 'class-validator';

export enum StudentTransitionMode {
  PROMOTE = 'promote', // Passer en classe supérieure
  KEEP = 'keep',       // Garder dans leurs classes actuelles
  NONE = 'none',       // Ne pas transférer
}

export class CreateNewYearTransitionDto {
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

  @IsEnum(StudentTransitionMode)
  @IsOptional()
  studentTransitionMode?: StudentTransitionMode;
}
