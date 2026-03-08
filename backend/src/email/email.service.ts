import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Brevo from '@getbrevo/brevo';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private apiInstance: Brevo.TransactionalEmailsApi | null = null;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly frontendUrl: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('BREVO_API_KEY');
    const emailFrom = this.configService.get<string>('EMAIL_FROM', 'Structura <ousmanedmitty@gmail.com>');

    // Extraire nom et email depuis "Nom <email>"
    const match = emailFrom.match(/^(.+?)\s*<(.+?)>$/);
    this.fromName = match ? match[1].trim() : 'Structura';
    this.fromEmail = match ? match[2].trim() : emailFrom;

    this.frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:3000');

    if (!apiKey) {
      this.logger.warn('BREVO_API_KEY non configurée. Envoi email désactivé.');
    } else {
      this.apiInstance = new Brevo.TransactionalEmailsApi();
      this.apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
      this.logger.log(`Brevo API email service initialisé (from: ${this.fromEmail})`);
    }
  }

  private async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.apiInstance) {
      this.logger.warn(`Email non configuré. Ignoré : ${to} — ${subject}`);
      return;
    }

    const email = new Brevo.SendSmtpEmail();
    email.sender = { name: this.fromName, email: this.fromEmail };
    email.to = [{ email: to }];
    email.subject = subject;
    email.htmlContent = html;

    await this.apiInstance.sendTransacEmail(email);
  }

  /**
   * Email de vérification pour les nouveaux comptes
   */
  async sendVerificationEmail(email: string, token: string, firstName: string): Promise<void> {
    const verificationUrl = `${this.frontendUrl}/verify-email?token=${token}`;
    try {
      await this.send(email, 'Vérifiez votre adresse email - Structura', this.getVerificationEmailTemplate(firstName, verificationUrl));
      this.logger.log(`Email de vérification envoyé à ${email}`);
    } catch (error) {
      this.logger.error(`Échec envoi email vérification à ${email}`, error?.body || error);
      throw new Error('Échec envoi email de vérification');
    }
  }

  /**
   * Email de réinitialisation de mot de passe
   */
  async sendPasswordResetEmail(email: string, token: string, firstName: string): Promise<void> {
    const resetUrl = `${this.frontendUrl}/reset-password?token=${token}`;
    try {
      await this.send(email, 'Réinitialisation de votre mot de passe - Structura', this.getPasswordResetEmailTemplate(firstName, resetUrl));
      this.logger.log(`Email reset mot de passe envoyé à ${email}`);
    } catch (error) {
      this.logger.error(`Échec envoi email reset à ${email}`, error?.body || error);
      throw new Error('Échec envoi email de réinitialisation');
    }
  }

  /**
   * Email de bienvenue après vérification
   */
  async sendWelcomeEmail(email: string, firstName: string): Promise<void> {
    try {
      await this.send(email, 'Bienvenue sur Structura !', this.getWelcomeEmailTemplate(firstName));
      this.logger.log(`Email de bienvenue envoyé à ${email}`);
    } catch (error) {
      this.logger.error(`Échec envoi email bienvenue à ${email}`, error?.body || error);
    }
  }

  /**
   * Email de notification générique
   */
  async sendNotificationEmail(
    email: string,
    subject: string,
    message: string,
    actionUrl?: string,
    actionText?: string,
  ): Promise<void> {
    try {
      await this.send(email, `${subject} - Structura`, this.getNotificationEmailTemplate(message, actionUrl, actionText));
      this.logger.log(`Email de notification envoyé à ${email}`);
    } catch (error) {
      this.logger.error(`Échec envoi email notification à ${email}`, error?.body || error);
    }
  }

  /**
   * Email d'invitation pour un nouveau membre de l'équipe.
   * Envoie un lien sécurisé vers /setup-account (valide 7 jours).
   */
  async sendTeamInvitationEmail(
    email: string,
    firstName: string,
    schoolName: string,
    inviteToken: string,
  ): Promise<void> {
    try {
      await this.send(
        email,
        `Invitation à rejoindre ${schoolName} sur Structura`,
        this.getTeamInvitationEmailTemplate(firstName, schoolName, email, inviteToken),
      );
      this.logger.log(`Email d'invitation envoyé à ${email}`);
    } catch (error) {
      this.logger.error(`Échec envoi email invitation à ${email}`, error?.body || error);
    }
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  private getTeamInvitationEmailTemplate(
    firstName: string,
    schoolName: string,
    email: string,
    inviteToken: string,
  ): string {
    const setupUrl = `${this.frontendUrl}/setup-account?token=${inviteToken}`;
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invitation Structura</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Structura</h1>
                    <p style="margin: 8px 0 0; color: rgba(255,255,255,0.85); font-size: 15px;">${schoolName}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Bonjour ${firstName} !</h2>
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Vous avez été invité(e) à rejoindre <strong>${schoolName}</strong> sur <strong>Structura</strong>, la plateforme de gestion scolaire.
                    </p>
                    <p style="margin: 0 0 16px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                      Votre adresse email de connexion : <strong style="color: #111827;">${email}</strong>
                    </p>
                    <p style="margin: 0 0 30px; color: #4b5563; font-size: 15px; line-height: 1.6;">
                      Cliquez sur le bouton ci-dessous pour créer votre mot de passe et accéder à votre compte. Ce lien est valable <strong>7 jours</strong>.
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 10px 0 30px;">
                          <a href="${setupUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);">
                            Configurer mon compte
                          </a>
                        </td>
                      </tr>
                    </table>
                    <div style="margin: 0 0 20px; padding: 15px; background-color: #f0f9ff; border-left: 4px solid #0ea5e9; border-radius: 4px;">
                      <p style="margin: 0; color: #0c4a6e; font-size: 13px; line-height: 1.5;">
                        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
                        <a href="${setupUrl}" style="color: #0ea5e9; word-break: break-all;">${setupUrl}</a>
                      </p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">© ${new Date().getFullYear()} Structura. Tous droits réservés.</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">Si vous n'attendiez pas cet email, vous pouvez l'ignorer en toute sécurité.</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  private getVerificationEmailTemplate(firstName: string, verificationUrl: string): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Vérification Email</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Structura</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Bonjour ${firstName} !</h2>
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Merci de vous être inscrit sur <strong>Structura</strong>, votre plateforme de gestion scolaire moderne.
                    </p>
                    <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Pour activer votre compte, veuillez vérifier votre adresse email :
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${verificationUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);">
                            Vérifier mon email
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
                    </p>
                    <p style="margin: 10px 0 0; color: #6366f1; font-size: 14px; word-break: break-all;">
                      <a href="${verificationUrl}" style="color: #6366f1; text-decoration: underline;">${verificationUrl}</a>
                    </p>
                    <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #e5e7eb;">
                      <p style="margin: 0; color: #9ca3af; font-size: 13px; line-height: 1.6;">
                        <strong>Note de sécurité :</strong> Ce lien expire dans 24 heures.
                      </p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">© ${new Date().getFullYear()} Structura. Tous droits réservés.</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">Plateforme de gestion scolaire moderne</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  private getPasswordResetEmailTemplate(firstName: string, resetUrl: string): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Réinitialisation Mot de Passe</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); padding: 40px 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Structura</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Bonjour ${firstName},</h2>
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Vous avez demandé à réinitialiser votre mot de passe sur <strong>Structura</strong>.
                    </p>
                    <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);">
                            Réinitialiser mon mot de passe
                          </a>
                        </td>
                      </tr>
                    </table>
                    <p style="margin: 30px 0 0; color: #6b7280; font-size: 14px; line-height: 1.6;">
                      Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :
                    </p>
                    <p style="margin: 10px 0 0; color: #ef4444; font-size: 14px; word-break: break-all;">
                      <a href="${resetUrl}" style="color: #ef4444; text-decoration: underline;">${resetUrl}</a>
                    </p>
                    <div style="margin-top: 40px; padding: 20px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
                      <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                        <strong>Important :</strong> Ce lien expire dans <strong>1 heure</strong>. Si vous n'avez pas fait cette demande, ignorez cet email.
                      </p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">© ${new Date().getFullYear()} Structura. Tous droits réservés.</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">Plateforme de gestion scolaire moderne</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  private getWelcomeEmailTemplate(firstName: string): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Bienvenue sur Structura</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Bienvenue !</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Félicitations ${firstName} !</h2>
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Votre compte <strong>Structura</strong> a été vérifié avec succès !
                    </p>
                    <div style="margin: 30px 0; padding: 25px; background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border-radius: 8px; border-left: 4px solid #10b981;">
                      <h3 style="margin: 0 0 15px; color: #065f46; font-size: 18px; font-weight: 600;">Que faire maintenant ?</h3>
                      <ul style="margin: 0; padding-left: 20px; color: #047857; font-size: 15px; line-height: 1.8;">
                        <li>Complétez votre profil</li>
                        <li>Ajoutez votre première classe</li>
                        <li>Invitez des membres de votre équipe</li>
                        <li>Explorez le tableau de bord</li>
                      </ul>
                    </div>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 20px 0;">
                          <a href="${this.frontendUrl}/dashboard" style="display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(16, 185, 129, 0.3);">
                            Accéder au tableau de bord
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">© ${new Date().getFullYear()} Structura. Tous droits réservés.</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">Plateforme de gestion scolaire moderne</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  private getNotificationEmailTemplate(message: string, actionUrl?: string, actionText?: string): string {
    const actionButton = actionUrl && actionText ? `
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center" style="padding: 20px 0;">
            <a href="${actionUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(99, 102, 241, 0.3);">
              ${actionText}
            </a>
          </td>
        </tr>
      </table>
    ` : '';

    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Notification Structura</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); padding: 40px 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Structura</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">${message}</p>
                    ${actionButton}
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">© ${new Date().getFullYear()} Structura. Tous droits réservés.</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">Plateforme de gestion scolaire moderne</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  /**
   * Alerte nouvelle connexion depuis un autre appareil
   */
  async sendNewLoginNotificationEmail(
    email: string,
    firstName: string,
    ip: string,
    userAgent: string,
    revokeUrl: string,
    loginTime: string,
  ): Promise<void> {
    try {
      await this.send(
        email,
        '⚠️ Nouvelle connexion détectée sur votre compte Structura',
        this.getNewLoginNotificationTemplate(firstName, ip, userAgent, revokeUrl, loginTime),
      );
      this.logger.log(`Email alerte connexion envoyé à ${email}`);
    } catch (error) {
      this.logger.error(`Échec envoi alerte connexion à ${email}`, error?.body || error);
    }
  }

  private getNewLoginNotificationTemplate(
    firstName: string,
    ip: string,
    userAgent: string,
    revokeUrl: string,
    loginTime: string,
  ): string {
    return `
      <!DOCTYPE html>
      <html lang="fr">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nouvelle connexion détectée</title>
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 0;">
          <tr>
            <td align="center">
              <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden;">
                <tr>
                  <td style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); padding: 40px 40px 30px; text-align: center;">
                    <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">Structura</h1>
                    <p style="margin: 10px 0 0; color: #fef3c7; font-size: 16px;">⚠️ Alerte de sécurité</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding: 40px;">
                    <h2 style="margin: 0 0 20px; color: #111827; font-size: 22px; font-weight: 600;">Bonjour ${firstName},</h2>
                    <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      Une <strong>nouvelle connexion</strong> a été détectée sur votre compte Structura.
                    </p>
                    <div style="margin: 0 0 30px; padding: 20px; background-color: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px;">
                      <p style="margin: 0 0 10px; color: #92400e; font-size: 14px; font-weight: 600;">Détails de la connexion :</p>
                      <p style="margin: 0 0 6px; color: #4b5563; font-size: 14px;">🕐 <strong>Date :</strong> ${loginTime}</p>
                      <p style="margin: 0 0 6px; color: #4b5563; font-size: 14px;">🌐 <strong>Adresse IP :</strong> ${ip}</p>
                      <p style="margin: 0; color: #4b5563; font-size: 14px;">💻 <strong>Appareil :</strong> ${userAgent}</p>
                    </div>
                    <p style="margin: 0 0 10px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      <strong>C'était vous ?</strong> Vous pouvez ignorer cet email en toute sécurité.
                    </p>
                    <p style="margin: 0 0 30px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                      <strong>Ce n'était pas vous ?</strong> Cliquez immédiatement sur le bouton ci-dessous pour sécuriser votre compte :
                    </p>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding: 10px 0 30px;">
                          <a href="${revokeUrl}" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);">
                            🔒 Ce n'était pas moi — Sécuriser mon compte
                          </a>
                        </td>
                      </tr>
                    </table>
                    <div style="margin-top: 10px; padding: 16px; background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px;">
                      <p style="margin: 0; color: #991b1b; font-size: 13px; line-height: 1.6;">
                        Ce lien expire dans <strong>24 heures</strong>. En cliquant dessus, la session en cours sera immédiatement révoquée et vous devrez vous reconnecter.
                      </p>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="background-color: #f9fafb; padding: 30px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 10px; color: #6b7280; font-size: 14px;">© ${new Date().getFullYear()} Structura. Tous droits réservés.</p>
                    <p style="margin: 0; color: #9ca3af; font-size: 12px;">Plateforme de gestion scolaire moderne</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }
}
