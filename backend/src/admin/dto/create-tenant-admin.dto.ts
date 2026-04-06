import { IsString, IsNotEmpty, IsEmail, IsOptional, MaxLength } from 'class-validator';

export class CreateTenantAdminDto {
  /** Nom de l'établissement */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** Email du directeur (recevra l'invitation) */
  @IsEmail()
  directorEmail: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  directorFirstName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  directorLastName: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  /** Nombre de jours d'essai (défaut : 14) */
  @IsOptional()
  trialDays?: number;

  /** Module principal : SCHOOL (défaut) ou COMMERCE */
  @IsOptional()
  @IsString()
  moduleType?: string;
}
