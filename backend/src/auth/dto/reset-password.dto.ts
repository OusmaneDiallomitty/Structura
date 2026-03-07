import { IsString, IsNotEmpty, MinLength, Matches } from 'class-validator';

/**
 * DTO pour réinitialiser le mot de passe
 */
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  @MinLength(32, { message: 'Invalid token' })
  token: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: 'Password must contain uppercase, lowercase, and number',
  })
  newPassword: string;
}
