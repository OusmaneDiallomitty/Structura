import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SubjectItemDto {
  @IsString()
  name: string;

  @IsInt()
  @Min(1)
  @Max(20)
  coefficient: number;

  @IsInt()
  @Min(0)
  order: number;
}

export class SaveClassSubjectsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubjectItemDto)
  subjects: SubjectItemDto[];
}
