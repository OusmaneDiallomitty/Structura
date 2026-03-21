import {
  IsString,
  IsDateString,
  IsOptional,
  IsEnum,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum StudentTransitionMode {
  PROMOTE = 'promote', // Passer en classe supérieure
  KEEP = 'keep',       // Garder dans leurs classes actuelles
  NONE = 'none',       // Ne pas transférer
}

export class StudentDecisionDto {
  @IsString()
  studentId: string;

  @IsEnum(['promote', 'repeat', 'graduate'])
  decision: 'promote' | 'repeat' | 'graduate';
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

  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => StudentDecisionDto)
  studentDecisions?: StudentDecisionDto[];
}
