import { IsString, IsEmail, IsOptional, IsIn, MinLength } from 'class-validator';

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
}
