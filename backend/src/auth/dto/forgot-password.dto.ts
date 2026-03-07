import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * DTO pour demander une réinitialisation de mot de passe
 */
export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}
