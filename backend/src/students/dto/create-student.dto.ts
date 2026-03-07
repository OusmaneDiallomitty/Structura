import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';

export class CreateStudentDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsDateString()
  @IsOptional()
  dateOfBirth?: string;

  @IsString()
  @IsIn(['M', 'F'])
  @IsOptional()
  gender?: string;

  @IsString()
  classId: string;

  @IsString()
  @IsOptional()
  parentName?: string;

  @IsString()
  @IsOptional()
  parentPhone?: string;

  @IsString()
  @IsOptional()
  parentEmail?: string;

  @IsString()
  @IsOptional()
  parentProfession?: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  photo?: string;
}
