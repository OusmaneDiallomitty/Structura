import {
  IsArray,
  IsString,
  IsOptional,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Une classe avec les matières que le prof y enseigne */
export class ClassSubjectAssignmentDto {
  @IsString()
  classId: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  subjects: string[];
}

export class AssignClassesDto {
  /** IDs des classes assignées (doit correspondre aux classIds dans classAssignments) */
  @IsArray()
  @IsString({ each: true })
  classIds: string[];

  /**
   * Détail des matières par classe — obligatoire pour les profs de collège/lycée.
   * Si absent ou vide, le prof voit toutes les matières de chaque classe.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ClassSubjectAssignmentDto)
  classAssignments?: ClassSubjectAssignmentDto[];
}
