import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  ValidateNested,
} from 'class-validator';

class PermissionDto {
  @IsBoolean()
  view: boolean;

  @IsBoolean()
  create: boolean;

  @IsBoolean()
  edit: boolean;

  @IsBoolean()
  delete: boolean;
}

/** Paiements : champ supplémentaire "configure" (frais de scolarité) */
class PaymentsPermissionDto extends PermissionDto {
  @IsOptional()
  @IsBoolean()
  configure?: boolean;
}

class ReportsPermissionDto {
  @IsBoolean()
  view: boolean;

  @IsBoolean()
  export: boolean;
}

class AccountingPermissionDto {
  @IsBoolean()
  view: boolean;
}

export class UpdatePermissionsDto {
  /** Délégation complète : ce membre a les mêmes droits qu'un directeur */
  @IsOptional()
  @IsBoolean()
  isCoDirector?: boolean;

  /** Accès comptabilité : paie du personnel + stats financières globales */
  @IsOptional()
  @ValidateNested()
  @Type(() => AccountingPermissionDto)
  accounting?: AccountingPermissionDto;

  @ValidateNested()
  @Type(() => PaymentsPermissionDto)
  payments: PaymentsPermissionDto;

  @ValidateNested()
  @Type(() => PermissionDto)
  expenses: PermissionDto;

  @ValidateNested()
  @Type(() => PermissionDto)
  students: PermissionDto;

  @ValidateNested()
  @Type(() => PermissionDto)
  classes: PermissionDto;

  @ValidateNested()
  @Type(() => PermissionDto)
  attendance: PermissionDto;

  @ValidateNested()
  @Type(() => PermissionDto)
  grades: PermissionDto;

  @ValidateNested()
  @Type(() => PermissionDto)
  team: PermissionDto;

  @ValidateNested()
  @Type(() => ReportsPermissionDto)
  reports: ReportsPermissionDto;
}
