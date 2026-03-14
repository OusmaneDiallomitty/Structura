import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';

export class SetSubjectCoefficientsDto {
  @IsString()
  classId: string;

  @IsString()
  academicYear?: string; // Défaut: année courante

  coefficients: {
    subject: string;
    coefficient: number;
  }[];
}

export class UpdateSubjectCoefficientDto {
  @IsNumber()
  @Min(0.5)
  @Max(10)
  coefficient: number;
}
