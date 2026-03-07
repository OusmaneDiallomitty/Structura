import { PartialType } from '@nestjs/mapped-types';
import { CreateStudentDto } from './create-student.dto';
import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdateStudentDto extends PartialType(CreateStudentDto) {
  @IsString()
  @IsIn(['ACTIVE', 'INACTIVE', 'GRADUATED', 'TRANSFERRED', 'EXPELLED'])
  @IsOptional()
  status?: string;

  @IsString()
  @IsIn(['PAID', 'PENDING', 'OVERDUE', 'PARTIAL'])
  @IsOptional()
  paymentStatus?: string;
}
