import { IsEnum } from 'class-validator';
import { SchoolType } from '../templates/school-templates';

export class ApplyTemplateDto {
  @IsEnum(SchoolType)
  templateType: SchoolType;
}
