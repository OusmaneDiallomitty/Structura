import { Type } from 'class-transformer';
import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max } from 'class-validator';

export class CreateCompositionDto {
  @IsString()
  studentId: string;

  @IsString()
  classId: string;

  @IsString()
  subject: string;

  @IsString()
  term: string;

  @IsNumber()
  @Min(0)
  @Max(20)
  compositionScore: number;

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

class CompositionItemDto {
  @IsString()
  studentId: string;

  @IsNumber()
  @Min(0)
  @Max(20)
  compositionScore: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class BulkCreateCompositionDto {
  @IsString()
  classId: string;

  @IsString()
  subject: string;

  @IsString()
  term: string;

  @IsOptional()
  @IsString()
  academicYear?: string;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompositionItemDto)
  compositions: CompositionItemDto[];
}

export class UpdateCompositionDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  compositionScore?: number;

  @IsOptional()
  @IsString()
  teacherName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
