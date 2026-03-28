import { IsString, IsEmail, IsOptional, IsIn, MinLength, Matches } from 'class-validator';

export class CreateTeamMemberDto {
  @IsString()
  @MinLength(2)
  firstName: string;

  @IsString()
  @MinLength(2)
  lastName: string;

  @IsEmail({}, { message: 'Email invalide' })
  email: string;

  @IsString()
  @IsIn(['TEACHER', 'ACCOUNTANT', 'SUPERVISOR', 'SECRETARY'], {
    message: 'Rôle invalide. Valeurs : TEACHER, ACCOUNTANT, SUPERVISOR, SECRETARY',
  })
  role: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'hireMonth doit être au format YYYY-MM' })
  hireMonth?: string;
}
