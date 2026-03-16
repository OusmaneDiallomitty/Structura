import { IsString, IsOptional, IsBoolean, IsIn, IsEmail } from 'class-validator';

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
}
