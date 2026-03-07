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
    HttpCode,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { GradesService } from './grades.service';
import { CreateGradeDto, CreateBulkGradeDto } from './dto/create-grade.dto';
import { UpdateGradeDto } from './dto/update-grade.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { PlanFeatureGuard } from '../common/guards/plan-feature.guard';
import { RequireFeature } from '../common/decorators/require-feature.decorator';

/**
 * Grades Controller
 *
 * Plan FREE  → saisie + consultation des notes (POST, GET, PATCH, DELETE)
 * Plan PRO   → rapports détaillés + bulletins + verrou trimestre (@RequireFeature('bulletins'))
 * Plan PRO+  → toutes les fonctionnalités
 */
@Controller('grades')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard, PlanFeatureGuard)
export class GradesController {
    constructor(private readonly gradesService: GradesService) {}

    // ── Saisie des notes — disponible sur FREE ──────────────────────────────────

    @Post()
    @Roles('TEACHER')
    @RequirePermission('grades', 'create')
    create(@Request() req, @Body() createGradeDto: CreateGradeDto) {
        return this.gradesService.create(req.user.tenantId, createGradeDto);
    }

    @Post('bulk')
    @Roles('TEACHER')
    @RequirePermission('grades', 'create')
    createBulk(@Request() req, @Body() createBulkDto: CreateBulkGradeDto) {
        return this.gradesService.createBulk(req.user.tenantId, createBulkDto);
    }

    // ── Consultation des notes — disponible sur FREE ────────────────────────────

    @SkipThrottle()
    @Get()
    @RequirePermission('grades', 'view')
    findAll(@Request() req, @Query() filters: any) {
        return this.gradesService.findAll(req.user.tenantId, filters);
    }

    @SkipThrottle()
    @Get(':id')
    @RequirePermission('grades', 'view')
    findOne(@Request() req, @Param('id') id: string) {
        return this.gradesService.findOne(req.user.tenantId, id);
    }

    @SkipThrottle()
    @Get('stats')
    @RequirePermission('grades', 'view')
    getStats(@Request() req, @Query() filters: any) {
        return this.gradesService.getStats(req.user.tenantId, filters);
    }

    @Patch(':id')
    @Roles('TEACHER')
    @RequirePermission('grades', 'edit')
    update(
        @Request() req,
        @Param('id') id: string,
        @Body() updateGradeDto: UpdateGradeDto,
    ) {
        return this.gradesService.update(req.user.tenantId, id, updateGradeDto);
    }

    @Delete(':id')
    @Roles('DIRECTOR')
    @RequirePermission('grades', 'delete')
    remove(@Request() req, @Param('id') id: string) {
        return this.gradesService.remove(req.user.tenantId, id);
    }

    // ── Rapports détaillés — PRO requis (alimentent les bulletins PDF) ──────────

    @SkipThrottle()
    @Get('student/:studentId/report')
    @RequireFeature('bulletins')
    @RequirePermission('grades', 'view')
    getStudentReport(
        @Request() req,
        @Param('studentId') studentId: string,
        @Query('term') term: string,
        @Query('academicYear') academicYear?: string,
    ) {
        return this.gradesService.getStudentReport(req.user.tenantId, studentId, term, academicYear);
    }

    @SkipThrottle()
    @Get('class/:classId/report')
    @RequireFeature('bulletins')
    @RequirePermission('grades', 'view')
    getClassReport(
        @Request() req,
        @Param('classId') classId: string,
        @Query('term') term: string,
        @Query('academicYear') academicYear?: string,
    ) {
        return this.gradesService.getClassReport(req.user.tenantId, classId, term, academicYear);
    }

    // ── Verrou de trimestre — PRO requis (inutile sans bulletins) ───────────────

    @SkipThrottle()
    @Get('trimester-lock')
    @RequireFeature('bulletins')
    @RequirePermission('grades', 'view')
    getTrimesterLock(
        @Request() req,
        @Query('classId') classId: string,
        @Query('trimester') trimester: string,
        @Query('academicYear') academicYear: string,
    ) {
        return this.gradesService.getTrimesterLock(req.user.tenantId, classId, trimester, academicYear);
    }

    @Post('trimester-lock')
    @RequireFeature('bulletins')
    @Roles('TEACHER')
    @RequirePermission('grades', 'edit')
    lockTrimester(
        @Request() req,
        @Body() body: { classId: string; trimester: string; academicYear: string },
    ) {
        const lockedByName = `${req.user.firstName ?? ''} ${req.user.lastName ?? ''}`.trim() || undefined;
        return this.gradesService.lockTrimester(
            req.user.tenantId,
            body.classId,
            body.trimester,
            body.academicYear,
            lockedByName,
        );
    }

    @Delete('trimester-lock')
    @RequireFeature('bulletins')
    @Roles('TEACHER', 'DIRECTOR')
    @RequirePermission('grades', 'edit')
    @HttpCode(200)
    unlockTrimester(
        @Request() req,
        @Query('classId') classId: string,
        @Query('trimester') trimester: string,
        @Query('academicYear') academicYear: string,
    ) {
        return this.gradesService.unlockTrimester(req.user.tenantId, classId, trimester, academicYear);
    }
}
