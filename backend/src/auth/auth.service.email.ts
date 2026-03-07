/**
 * SNIPPETS EMAIL SERVICE - À copier dans auth.service.ts
 * 
 * Ce fichier contient des exemples de méthodes pour gérer les emails.
 * Copie-colle ces méthodes dans la classe AuthService principale.
 * 
 * IMPORTANT: Ce fichier n'est PAS un service complet, juste des exemples!
 */

// ============================================
// IMPORTS NÉCESSAIRES (à ajouter dans auth.service.ts)
// ============================================
/*
import { BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
*/

// ============================================
// PROPRIÉTÉ À AJOUTER DANS LA CLASSE AuthService
// ============================================
/*
private readonly logger = new Logger(AuthService.name);
*/

// ============================================
// MÉTHODES À COPIER DANS LA CLASSE AuthService
// ============================================

/*
// Vérifier l'email avec un token
async verifyEmail(token: string) {
  this.logger.log(`Verifying email with token: ${token.substring(0, 10)}...`);

  const user = await this.prisma.user.findFirst({
    where: { verificationToken: token },
  });

  if (!user) {
    throw new BadRequestException('Invalid verification token');
  }

  const tokenAge = Date.now() - user.verificationTokenCreatedAt.getTime();
  const tokenExpiry = 24 * 60 * 60 * 1000; // 24 heures

  if (tokenAge > tokenExpiry) {
    throw new BadRequestException('Verification token has expired');
  }

  if (user.emailVerified) {
    throw new BadRequestException('Email is already verified');
  }

  const updatedUser = await this.prisma.user.update({
    where: { id: user.id },
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationTokenCreatedAt: null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      emailVerified: true,
    },
  });

  try {
    await this.emailService.sendWelcomeEmail(user.email, user.firstName);
  } catch (error) {
    this.logger.error('Failed to send welcome email', error);
  }

  return {
    message: 'Email verified successfully',
    user: updatedUser,
  };
}

// Demander une réinitialisation de mot de passe
async forgotPassword(email: string) {
  const user = await this.prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return; // Ne pas révéler si l'email existe
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');

  await this.prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetToken: resetTokenHash,
      passwordResetTokenCreatedAt: new Date(),
    },
  });

  await this.emailService.sendPasswordResetEmail(user.email, resetToken, user.firstName);
}

// Réinitialiser le mot de passe
async resetPassword(token: string, newPassword: string) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const user = await this.prisma.user.findFirst({
    where: { passwordResetToken: tokenHash },
  });

  if (!user) {
    throw new BadRequestException('Invalid password reset token');
  }

  const tokenAge = Date.now() - user.passwordResetTokenCreatedAt.getTime();
  const tokenExpiry = 60 * 60 * 1000; // 1 heure

  if (tokenAge > tokenExpiry) {
    throw new BadRequestException('Password reset token has expired');
  }

  const hashedPassword = await this.hashPassword(newPassword);

  const updatedUser = await this.prisma.user.update({
    where: { id: user.id },
    data: {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetTokenCreatedAt: null,
    },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  });

  return {
    message: 'Password reset successfully',
    user: updatedUser,
  };
}

// Renvoyer l'email de vérification
async resendVerificationEmail(email: string) {
  const user = await this.prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new BadRequestException('User not found');
  }

  if (user.emailVerified) {
    throw new BadRequestException('Email is already verified');
  }

  const verificationToken = crypto.randomBytes(32).toString('hex');

  await this.prisma.user.update({
    where: { id: user.id },
    data: {
      verificationToken,
      verificationTokenCreatedAt: new Date(),
    },
  });

  await this.emailService.sendVerificationEmail(user.email, verificationToken, user.firstName);
}

// Envoyer l'email de vérification après registration
private async sendVerificationEmailAfterRegister(user: any) {
  try {
    const verificationToken = crypto.randomBytes(32).toString('hex');

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        verificationToken,
        verificationTokenCreatedAt: new Date(),
      },
    });

    await this.emailService.sendVerificationEmail(user.email, verificationToken, user.firstName);
  } catch (error) {
    this.logger.error('Failed to send verification email', error);
  }
}
*/

export {}; // Pour que TypeScript considère ce fichier comme un module
