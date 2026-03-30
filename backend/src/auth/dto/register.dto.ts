import { IsEmail, IsString, MinLength, IsIn, IsOptional, Matches, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\+[1-9]\d{8,14}$/, {
    message: 'Numéro de téléphone invalide (format international requis)',
  })
  phone: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  organizationName: string;

  @IsString()
  @IsIn(['school', 'business', 'service'])
  organizationType: string;

  @IsString()
  @MinLength(2)
  country: string;

  @IsString()
  @MinLength(2)
  city: string;

  @IsOptional()
  @IsString()
  @IsIn(['SCHOOL', 'COMMERCE'])
  moduleType?: string;
}
