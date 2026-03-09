import {
  Controller, Get, Patch, Post, Delete,
  Param, Body, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard }          from '../auth/guards/jwt-auth.guard';
import { SuperAdminGuard }       from '../common/guards/super-admin.guard';
import { CurrentUser }           from '../common/decorators/current-user.decorator';
import { AdminService }          from './admin.service';
import { UpdateTenantDto }       from './dto/update-tenant.dto';
import { ExtendTrialDto }        from './dto/extend-trial.dto';
import { SendReminderDto }        from './dto/send-reminder.dto';
import { CreateTenantAdminDto }  from './dto/create-tenant-admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Stats globales ────────────────────────────────────────────────────────

  @Get('stats')
  getGlobalStats() {
    return this.adminService.getGlobalStats();
  }

  // ─── Alertes ───────────────────────────────────────────────────────────────

  /** GET /api/admin/alerts — Alertes triées par urgence */
  @Get('alerts')
  getAlerts() {
    return this.adminService.getAlerts();
  }

  /**
   * GET /api/admin/alerts/count — Comptage rapide pour le badge sidebar.
   * 3 requêtes COUNT au lieu des 7 findMany de /alerts.
   */
  @Get('alerts/count')
  getAlertsCount() {
    return this.adminService.getAlertsCount();
  }

  // ─── Journal d'activité ────────────────────────────────────────────────────

  /** GET /api/admin/activity — Journal d'audit paginé */
  @Get('activity')
  getActivity(
    @Query('page')     page?:     string,
    @Query('limit')    limit?:    string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.adminService.getActivity({
      page:     page    ? parseInt(page,  10) : 1,
      limit:    limit   ? parseInt(limit, 10) : 30,
      tenantId,
    });
  }

  // ─── Finance ───────────────────────────────────────────────────────────────

  /** GET /api/admin/finance — Statistiques financières (MRR + répartition par plan) */
  @Get('finance')
  getFinanceStats() {
    return this.adminService.getFinanceStats();
  }

  // ─── Gestion des tenants ───────────────────────────────────────────────────

  @Get('tenants')
  findAllTenants(
    @Query('page')    page?:    string,
    @Query('limit')   limit?:   string,
    @Query('search')  search?:  string,
    @Query('status')  status?:  'active' | 'inactive',
    @Query('plan')    plan?:    string,
    @Query('country') country?: string,
  ) {
    return this.adminService.findAllTenants({
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
      search, status, plan, country,
    });
  }

  /** POST /api/admin/tenants — Créer une école manuellement */
  @Post('tenants')
  @HttpCode(HttpStatus.CREATED)
  createTenant(@Body() dto: CreateTenantAdminDto, @CurrentUser() admin: any) {
    return this.adminService.createTenant(dto, admin.email);
  }

  @Get('tenants/:id')
  findOneTenant(@Param('id') id: string) {
    return this.adminService.findOneTenant(id);
  }

  @Patch('tenants/:id')
  updateTenant(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @CurrentUser() admin: any,
  ) {
    return this.adminService.updateTenant(id, dto, admin.email);
  }

  @Post('tenants/:id/suspend')
  @HttpCode(HttpStatus.OK)
  suspendTenant(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.adminService.suspendTenant(id, admin.email);
  }

  @Post('tenants/:id/activate')
  @HttpCode(HttpStatus.OK)
  activateTenant(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.adminService.activateTenant(id, admin.email);
  }

  @Delete('tenants/:id')
  @HttpCode(HttpStatus.OK)
  deleteTenant(@Param('id') id: string, @CurrentUser() admin: any) {
    return this.adminService.deleteTenant(id, admin.email);
  }

  // ─── Extension trial ───────────────────────────────────────────────────────

  /**
   * POST /api/admin/tenants/:id/extend-trial
   * Body : { days: number }
   * Prolonge le trial d'une école en 1 clic (+7j / +14j / +30j).
   */
  @Post('tenants/:id/extend-trial')
  @HttpCode(HttpStatus.OK)
  extendTrial(
    @Param('id') tenantId: string,
    @Body() dto: ExtendTrialDto,
    @CurrentUser() admin: any,
  ) {
    return this.adminService.extendTrial(tenantId, dto, admin.email);
  }

  // ─── Renvoi invitation directeur ──────────────────────────────────────────

  /**
   * POST /api/admin/tenants/:id/resend-invite
   * Régénère le token et renvoie l'email d'activation au directeur
   * (uniquement si son compte n'est pas encore activé).
   */
  @Post('tenants/:id/resend-invite')
  @HttpCode(HttpStatus.OK)
  resendDirectorInvite(@Param('id') tenantId: string, @CurrentUser() admin: any) {
    return this.adminService.resendDirectorInvite(tenantId, admin.email);
  }

  // ─── Rappel email ──────────────────────────────────────────────────────────

  /**
   * POST /api/admin/tenants/:id/send-reminder
   * Body : { subject: string, message: string }
   * Envoie un email de rappel au directeur de l'école depuis le panneau admin.
   */
  @Post('tenants/:id/send-reminder')
  @HttpCode(HttpStatus.OK)
  sendReminder(
    @Param('id') tenantId: string,
    @Body() dto: SendReminderDto,
    @CurrentUser() admin: any,
  ) {
    return this.adminService.sendReminder(tenantId, dto, admin.email);
  }

  // ─── Paiements Djomy ───────────────────────────────────────────────────────

  /**
   * GET /api/admin/payments — Liste paginée des transactions Djomy.
   * Filtres query : status, plan, tenantId, page, limit.
   */
  @Get('payments')
  getSubscriptionPayments(
    @Query('page')     page?:     string,
    @Query('limit')    limit?:    string,
    @Query('status')   status?:   string,
    @Query('plan')     plan?:     string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.adminService.getSubscriptionPayments({
      page:     page  ? parseInt(page,  10) : 1,
      limit:    limit ? parseInt(limit, 10) : 30,
      status, plan, tenantId,
    });
  }

  // ─── Impersonation ─────────────────────────────────────────────────────────

  /**
   * POST /api/admin/tenants/:id/impersonate
   * Génère un code d'impersonation opaque (UUID, TTL 2min, usage unique).
   * Le JWT ne transite JAMAIS dans l'URL — sécurité améliorée.
   */
  @Post('tenants/:id/impersonate')
  @HttpCode(HttpStatus.OK)
  impersonateTenant(@Param('id') tenantId: string, @CurrentUser() admin: any) {
    return this.adminService.impersonateTenant(admin.id, admin.email, tenantId);
  }
}
