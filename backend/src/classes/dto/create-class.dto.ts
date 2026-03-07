import { IsString, IsNumber, IsOptional, Min, ValidateIf } from 'class-validator';

export class CreateClassDto {
  @IsString()
  name: string;

  @IsString()
  level: string;

  @ValidateIf((o) => o.section !== null)
  @IsString()
  @IsOptional()
  section?: string | null;

  @IsNumber()
  @Min(1)
  @IsOptional()
  capacity?: number;

  @IsString()
  @IsOptional()
  teacherId?: string;

  @IsString()
  @IsOptional()
  teacherName?: string;

  @IsString()
  @IsOptional()
  room?: string;

  @IsString()
  @IsOptional()
  academicYear?: string;
}
