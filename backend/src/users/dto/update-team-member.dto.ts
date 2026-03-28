import { IsString, IsOptional, IsBoolean, IsIn, IsEmail, Matches } from 'class-validator';

export class UpdateTeamMemberDto {
  @IsString()
  @IsOptional()
  firstName?: string;

  @IsString()
  @IsOptional()
  lastName?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @IsIn(['TEACHER', 'ACCOUNTANT', 'SUPERVISOR', 'SECRETARY'], {
    message: 'Rôle invalide. Valeurs : TEACHER, ACCOUNTANT, SUPERVISOR, SECRETARY',
  })
  role?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsEmail({}, { message: 'Email invalide' })
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'hireMonth doit être au format YYYY-MM' })
  hireMonth?: string;
}
