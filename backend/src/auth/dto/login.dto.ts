import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsString()
  deviceId?: string;  // UUID persistant localStorage — skip approbation si même appareil

  @IsOptional()
  @IsString()
  tenantId?: string;  // Sélection explicite d'un tenant quand plusieurs espaces existent
}
