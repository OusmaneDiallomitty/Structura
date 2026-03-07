import { IsEmail, IsNotEmpty } from 'class-validator';

/**
 * DTO pour renvoyer l'email de vérification
 */
export class ResendVerificationDto {
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}
