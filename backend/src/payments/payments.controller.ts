import {
    Controller,
    Get,
    Post,
    Body,
    Patch,
    Param,
    Delete,
    UseGuards,
    Request,
    Query,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PlanFeatureGuard } from '../common/guards/plan-feature.guard';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

/**
 * Payments Controller
 *
 * Plan FREE  → CRUD complet (marquer payé/impayé, consulter) — sans reçu PDF
 * Plan PRO   → Reçu PDF individuel (@RequireFeature('bulletins') sur /receipt)
 * Plan PRO+  → Rapports avancés (@RequireFeature('advancedReports') sur /stats avancées)
 *
 * Note : la génération PDF des reçus est côté frontend (pdf-generator.ts).
 * Le backend /receipt retourne les données brutes nécessaires au PDF.
 * En FREE, le bouton "Reçu PDF" est caché dans l'UI — pas de blocage backend nécessaire
 * pour les données, mais on protège quand même la route /receipt pour cohérence.
 */
@Controller('payments')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, PlanFeatureGuard)
export class PaymentsController {
    constructor(private readonly paymentsService: PaymentsService) {}

    // ── CRUD paiements — disponible sur FREE ────────────────────────────────────

    @Post()
    @Roles('ACCOUNTANT', 'DIRECTOR', 'SECRETARY')
    @RequirePermission('payments', 'create')
    create(@Request() req, @Body() createPaymentDto: CreatePaymentDto) {
        return this.paymentsService.create(req.user.tenantId, createPaymentDto);
    }

    @SkipThrottle()
    @Get()
    @RequirePermission('payments', 'view')
    findAll(@Request() req, @Query() filters: any) {
        return this.paymentsService.findAll(req.user.tenantId, filters);
    }

    @SkipThrottle()
    @Get('student/:studentId')
    @RequirePermission('payments', 'view')
    getByStudent(@Request() req, @Param('studentId') studentId: string) {
        return this.paymentsService.getByStudent(req.user.tenantId, studentId);
    }

    @SkipThrottle()
    @Get(':id')
    @RequirePermission('payments', 'view')
    findOne(@Request() req, @Param('id') id: string) {
        return this.paymentsService.findOne(req.user.tenantId, id);
    }

    @Patch(':id')
    @Roles('ACCOUNTANT', 'DIRECTOR')
    @RequirePermission('payments', 'edit')
    update(
        @Request() req,
        @Param('id') id: string,
        @Body() updatePaymentDto: UpdatePaymentDto,
    ) {
        return this.paymentsService.update(req.user.tenantId, id, updatePaymentDto);
    }

    @Delete(':id')
    @Roles('DIRECTOR')
    @RequirePermission('payments', 'delete')
    remove(@Request() req, @Param('id') id: string) {
        return this.paymentsService.remove(req.user.tenantId, id);
    }

    // ── Statistiques — disponible sur FREE ─────────────────────────────────────

    @SkipThrottle()
    @Get('stats')
    @RequirePermission('payments', 'view')
    getStats(@Request() req, @Query() filters: any) {
        return this.paymentsService.getStats(req.user.tenantId, filters);
    }

    // ── Données reçu PDF — PRO requis ───────────────────────────────────────────

    @SkipThrottle()
    @Get(':id/receipt')
    @RequireFeature('bulletins')
    @RequirePermission('payments', 'view')
    getReceipt(@Request() req, @Param('id') id: string) {
        return this.paymentsService.getReceipt(req.user.tenantId, id);
    }
}
