import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { EmailService } from '../email/email.service';

export class ContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(150)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(3000)
  message: string;
}

@Controller('contact')
@UseGuards(ThrottlerGuard)
@Throttle({ auth: { limit: 3, ttl: 60_000 } })
export class ContactController {
  constructor(private readonly emailService: EmailService) {}

  /**
   * POST /contact
   * Endpoint public — aucune authentification requise.
   * Transmet le message au support Structura via Brevo.
   */
  @Post()
  async send(@Body() dto: ContactDto) {
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#2563EB">Nouveau message de contact — Structura</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
          <tr><td style="padding:6px 0;color:#6b7280;width:120px">Nom</td><td style="padding:6px 0;font-weight:600">${dto.name}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Email</td><td style="padding:6px 0"><a href="mailto:${dto.email}">${dto.email}</a></td></tr>
          ${dto.phone ? `<tr><td style="padding:6px 0;color:#6b7280">Téléphone</td><td style="padding:6px 0">${dto.phone}</td></tr>` : ''}
          <tr><td style="padding:6px 0;color:#6b7280">Sujet</td><td style="padding:6px 0;font-weight:600">${dto.subject}</td></tr>
        </table>
        <div style="background:#f3f4f6;border-radius:8px;padding:16px">
          <p style="margin:0;white-space:pre-wrap;color:#1f2937">${dto.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
        </div>
        <p style="margin-top:16px;color:#9ca3af;font-size:12px">
          Reçu le ${new Date().toLocaleDateString('fr-FR', { dateStyle: 'long' })} à ${new Date().toLocaleTimeString('fr-FR', { timeStyle: 'short' })}
        </p>
      </div>
    `;

    await this.emailService.sendNotificationEmail(
      'support@structura.app',
      `[Contact] ${dto.subject} — ${dto.name}`,
      html,
    );

    return { success: true };
  }
}
