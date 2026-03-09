import { Controller, Post, Delete, Body, Get, Query, Patch, UseGuards, UseInterceptors, UploadedFile, Request, Req, HttpCode, HttpStatus, BadRequestException, Header, Redirect } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AcceptInviteDto } from './dto/accept-invite.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateSchoolDto } from './dto/update-school.dto';
import { UpdateFeesDto } from './dto/update-fees.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { UploadService } from '../upload/upload.service';

// ThrottlerGuard appliqué uniquement ici — seuls les endpoints d'auth sont rate-limités.
// Les endpoints de données (classes, élèves, notes…) sont protégés par JWT + tenantId,
// pas par du rate limiting qui bloquerait les utilisateurs légitimes.
@Controller('auth')
@UseGuards(ThrottlerGuard)
export class AuthController {
  constructor(
    private readonly authService:  AuthService,
    private readonly uploadService: UploadService,
  ) {}

  // 3 inscriptions max par minute par IP (création de compte)
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  // 5 tentatives de connexion max par minute par IP (anti brute-force)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('login')
  async login(@Body() loginDto: LoginDto, @Req() req: any) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || 'IP inconnue';
    const userAgent = (req.headers['user-agent'] || 'Appareil inconnu').substring(0, 120);
    return this.authService.login(loginDto, { ip, userAgent });
  }

  // Révocation de session via lien email ("Ce n'était pas moi") — sans JWT
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Get('revoke-session')
  @Redirect()
  async revokeSession(@Query('token') token: string) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    try {
      await this.authService.revokeSession(token);
      return { url: `${frontendUrl}/login?revoked=1` };
    } catch {
      return { url: `${frontendUrl}/login?revoke_error=1` };
    }
  }

  // ─── Option B : endpoints d'approbation de connexion ──────────────────────

  // Poll depuis le nouvel appareil — vérifie si la demande a été approuvée/refusée
  @SkipThrottle({ auth: true })
  @Get('check-approval')
  async checkApproval(@Query('token') token: string) {
    return this.authService.checkApproval(token);
  }

  // Lien "Approuver" dans l'email — page de confirmation HTML (pas de redirect vers /login)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Get('approve-login')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async approveLogin(@Query('token') token: string): Promise<string> {
    try {
      await this.authService.approveLogin(token);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return htmlPageWithRedirect('Connexion autorisée', '#16a34a', '#dcfce7', checkIcon(),
        'Connexion autorisée !',
        "L'autre appareil va être redirigé vers le tableau de bord.<br><br>Vous allez être redirigé vers la page de connexion dans <strong id=\"c\">3</strong>s…",
        `${frontendUrl}/login`, 3
      );
    } catch {
      return htmlPage('Lien invalide', '#dc2626', '#fee2e2', crossIcon(),
        'Lien expiré',
        "Ce lien d'approbation est invalide ou a déjà été utilisé."
      );
    }
  }

  // Lien "Refuser" dans l'email — page de confirmation HTML (pas de redirect vers /login)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Get('deny-login')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async denyLogin(@Query('token') token: string): Promise<string> {
    try {
      await this.authService.denyLogin(token);
      return htmlPage('Connexion refusée', '#dc2626', '#fee2e2', crossIcon(),
        'Connexion refusée',
        "Vous avez refusé cette demande de connexion.<br><br>L'autre appareil a été informé. Vous pouvez fermer cette page."
      );
    } catch {
      return htmlPage('Lien invalide', '#6b7280', '#f3f4f6', clockIcon(),
        'Lien expiré',
        'Ce lien est invalide ou a déjà été utilisé.'
      );
    }
  }

  // Déconnexion — invalide la session immédiatement côté serveur
  @SkipThrottle({ auth: true })
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Request() req) {
    await this.authService.logout(req.user.id);
    return { message: 'Déconnecté avec succès' };
  }

  // Endpoint protégé par JWT — pas de throttle (lecture de profil, très fréquent)
  // Le rôle est renvoyé en minuscules pour correspondre au type User du frontend.
  // (En interne les guards utilisent les MAJUSCULES depuis req.user.role directement.)
  @SkipThrottle({ auth: true })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getProfile(@Request() req: { user: Record<string, unknown> }) {
    return {
      ...req.user,
      role: typeof req.user.role === 'string' ? req.user.role.toLowerCase() : req.user.role,
    };
  }

  // 10 refresh tokens max par minute par IP
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Body() body: RefreshTokenDto) {
    return this.authService.refreshToken(body.refreshToken);
  }

  // Vérification email — throttle global suffisant
  @Post('verify-email')
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto) {
    return this.authService.verifyEmail(verifyEmailDto.token);
  }

  // 3 demandes de reset par minute par IP (anti-spam)
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @Post('request-password-reset')
  async requestPasswordReset(@Body() requestPasswordResetDto: RequestPasswordResetDto) {
    return this.authService.requestPasswordReset(requestPasswordResetDto.email);
  }

  // Reset de mot de passe — throttle global suffisant (token à usage unique)
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto.token, resetPasswordDto.newPassword);
  }

  // Activation d'invitation — 3 tentatives max par minute par IP (anti brute-force token)
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @Post('accept-invite')
  async acceptInvite(@Body() body: AcceptInviteDto) {
    return this.authService.acceptInvite(body.token, body.password);
  }

  // 3 renvois max par minute par IP (anti-spam email)
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  async resendVerification(@Body() body: { email: string }) {
    return this.authService.resendVerificationEmail(body.email);
  }

  // ─── Échange de code d'impersonation ────────────────────────────────────────

  /**
   * Échange un code d'impersonation opaque (UUID, généré par /admin/tenants/:id/impersonate)
   * contre le JWT du directeur impersonné.
   * Le code est à usage unique et expire en 2 min.
   * Limité à 5 tentatives/min pour empêcher l'énumération des codes.
   */
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('impersonate-exchange')
  @HttpCode(HttpStatus.OK)
  async exchangeImpersonationCode(@Body() body: { code: string }) {
    return this.authService.exchangeImpersonationCode(body.code);
  }

  // ─── Compte connecté ────────────────────────────────────────────────────

  // 5 tentatives max par minute (anti brute-force sur le mot de passe actuel)
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  async changePassword(
    @Request() req,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.id, dto);
  }

  // ─── Infos de l'école ───────────────────────────────────────────────────

  // Lecture des infos école — accessible à tous les rôles authentifiés
  @SkipThrottle({ auth: true })
  @Get('school')
  @UseGuards(JwtAuthGuard)
  async getSchoolInfo(@Request() req) {
    return this.authService.getSchoolInfo(req.user.tenantId);
  }

  // Mise à jour des infos école — DIRECTOR uniquement
  @SkipThrottle({ auth: true })
  @Patch('school')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DIRECTOR')
  async updateSchoolInfo(
    @Request() req,
    @Body() dto: UpdateSchoolDto,
  ) {
    return this.authService.updateSchoolInfo(req.user.tenantId, dto);
  }

  // ─── Logo de l'école ────────────────────────────────────────────────────

  /**
   * Upload du logo — DIRECTOR uniquement, max 2 Mo, formats JPEG/PNG/WebP/SVG.
   * L'ancien logo est supprimé de R2 automatiquement.
   */
  @SkipThrottle({ auth: true })
  @Post('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DIRECTOR')
  @UseInterceptors(FileInterceptor('logo', {
    storage: memoryStorage(),
    limits:  { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_, file, cb) => {
      if (!file.mimetype.startsWith('image/')) {
        cb(new BadRequestException('Seules les images sont acceptées (JPEG, PNG, WebP, SVG)'), false);
      } else {
        cb(null, true);
      }
    },
  }))
  async uploadLogo(
    @Request() req,
    @UploadedFile() file: any,
  ) {
    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    return this.authService.uploadLogo(req.user.tenantId, file, this.uploadService);
  }

  /** Supprime le logo de l'école — DIRECTOR uniquement. */
  @SkipThrottle({ auth: true })
  @Delete('logo')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DIRECTOR')
  async deleteLogo(@Request() req) {
    return this.authService.deleteLogo(req.user.tenantId, this.uploadService);
  }

  // ─── Configuration des frais de scolarité ───────────────────────────────

  /**
   * Lecture de la config frais — accessible à tous les rôles authentifiés du tenant.
   * Le comptable doit pouvoir lire les frais pour enregistrer des paiements.
   */
  @SkipThrottle({ auth: true })
  @Get('fees')
  @UseGuards(JwtAuthGuard)
  async getFeesConfig(@Request() req) {
    return this.authService.getFeesConfig(req.user.tenantId);
  }

  /**
   * Mise à jour de la config frais — DIRECTOR ou membre avec payments.configure = true.
   * Le directeur peut déléguer cette permission via la page Équipe → Permissions.
   */
  @SkipThrottle({ auth: true })
  @Patch('fees')
  @UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
  @RequirePermission('payments', 'configure')
  async updateFeesConfig(
    @Request() req,
    @Body() dto: UpdateFeesDto,
  ) {
    return this.authService.updateFeesConfig(req.user.tenantId, dto);
  }
}

// ─── Helpers HTML pour les pages de confirmation email ───────────────────────

function htmlPage(title: string, color: string, bg: string, icon: string, heading: string, body: string): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px 32px;max-width:400px;width:100%;text-align:center}.icon{width:64px;height:64px;background:${bg};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}svg{width:32px;height:32px;color:${color}}h1{font-size:20px;font-weight:700;color:#111827;margin-bottom:12px}p{font-size:14px;color:#6b7280;line-height:1.7}.brand{margin-top:32px;font-size:12px;color:#d1d5db;font-weight:600;letter-spacing:.05em}
</style></head><body><div class="card"><div class="icon">${icon}</div><h1>${heading}</h1><p>${body}</p><p class="brand">STRUCTURA</p></div></body></html>`;
}

function htmlPageWithRedirect(title: string, color: string, bg: string, icon: string, heading: string, body: string, redirectUrl: string, delaySec: number): string {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:16px}.card{background:#fff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,.08);padding:40px 32px;max-width:400px;width:100%;text-align:center}.icon{width:64px;height:64px;background:${bg};border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}svg{width:32px;height:32px;color:${color}}h1{font-size:20px;font-weight:700;color:#111827;margin-bottom:12px}p{font-size:14px;color:#6b7280;line-height:1.7}.brand{margin-top:32px;font-size:12px;color:#d1d5db;font-weight:600;letter-spacing:.05em}
</style></head><body><div class="card"><div class="icon">${icon}</div><h1>${heading}</h1><p>${body}</p><p class="brand">STRUCTURA</p></div>
<script>var s=${delaySec};var t=setInterval(function(){s--;var el=document.getElementById('c');if(el)el.textContent=s;if(s<=0){clearInterval(t);window.location.href='${redirectUrl}';}},1000);</script>
</body></html>`;
}

function checkIcon(): string {
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>`;
}

function crossIcon(): string {
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>`;
}

function clockIcon(): string {
  return `<svg fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
}
