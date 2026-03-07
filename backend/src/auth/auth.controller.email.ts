/**
 * SNIPPETS EMAIL - À copier dans auth.controller.ts
 * 
 * Ce fichier contient des exemples de code pour les endpoints email.
 * Copie-colle ces méthodes dans la classe AuthController principale.
 * 
 * IMPORTANT: Ce fichier n'est PAS un controller complet, juste des exemples!
 */

// ============================================
// IMPORTS NÉCESSAIRES (à ajouter dans auth.controller.ts)
// ============================================
/*
import { Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
*/

// ============================================
// MÉTHODES À COPIER DANS LA CLASSE AuthController
// ============================================

/*
// Vérifier l'email avec un token
// POST /auth/verify-email
@Post('verify-email')
@HttpCode(HttpStatus.OK)
async verifyEmail(@Body() dto: VerifyEmailDto) {
  return this.authService.verifyEmail(dto.token);
}

// Demander une réinitialisation de mot de passe
// POST /auth/forgot-password
@Post('forgot-password')
@HttpCode(HttpStatus.OK)
async forgotPassword(@Body() dto: ForgotPasswordDto) {
  await this.authService.forgotPassword(dto.email);
  return { message: 'Password reset email sent' };
}

// Réinitialiser le mot de passe
// POST /auth/reset-password
@Post('reset-password')
@HttpCode(HttpStatus.OK)
async resetPassword(@Body() dto: ResetPasswordDto) {
  return this.authService.resetPassword(dto.token, dto.newPassword);
}

// Renvoyer l'email de vérification
// POST /auth/resend-verification
@Post('resend-verification')
@HttpCode(HttpStatus.OK)
async resendVerification(@Body() dto: ResendVerificationDto) {
  await this.authService.resendVerificationEmail(dto.email);
  return { message: 'Verification email sent' };
}
*/

// ============================================
// EXEMPLE D'UTILISATION
// ============================================
/*
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ... autres méthodes (register, login, etc.)

  // Copier les méthodes ci-dessus ici
}
*/

export {}; // Pour que TypeScript considère ce fichier comme un module
