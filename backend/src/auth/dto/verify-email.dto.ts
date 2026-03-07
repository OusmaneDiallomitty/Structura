import { IsString, IsNotEmpty, MinLength } from 'class-validator';

/**
 * DTO pour vérifier l'email avec un token
 */
export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  @MinLength(32, { message: 'Invalid token' })
  token: string;
}
