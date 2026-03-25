import { IsArray, ValidateNested, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateStudentDto } from './create-student.dto';

export class BulkCreateStudentDto {
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @Type(() => CreateStudentDto)
  students: CreateStudentDto[];
}
