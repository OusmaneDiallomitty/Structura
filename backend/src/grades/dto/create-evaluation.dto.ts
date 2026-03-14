import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max } from 'class-validator';

export class CreateEvaluationDto {
  @IsString()
  studentId: string;

  @IsString()
  classId: string;

  @IsString()
  subject: string;

  @IsString()
  term: string;

  @IsString()
  month: string;

  @IsNumber()
  @Min(0)
  @Max(20)
  score: number;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

class EvaluationItemDto {
  @IsString()
  studentId: string;

  @IsNumber()
  @Min(0)
  @Max(20)
  score: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCreateEvaluationDto {
  @IsString()
  classId: string;

  @IsString()
  subject: string;

  @IsString()
  term: string;

  @IsString()
  month: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  maxScore?: number;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EvaluationItemDto)
  evaluations: EvaluationItemDto[];
}
