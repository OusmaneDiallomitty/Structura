import { Type } from 'class-transformer';
import {
  IsArray,
  IsNumber,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SubjectItemDto {
  @IsString()
  name: string;

  @IsNumber()
  @Min(0)    // 0 = matière sans coefficient (ex: EPS, Dessin)
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
