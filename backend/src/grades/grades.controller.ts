import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { GradesService } from './grades.service';
import { CreateEvaluationDto, BulkCreateEvaluationDto } from './dto/create-evaluation.dto';
import { CreateCompositionDto, BulkCreateCompositionDto, UpdateCompositionDto } from './dto/create-composition.dto';
import { SetSubjectCoefficientsDto } from './dto/subject-coefficient.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Throttle } from '@nestjs/throttler';

@Controller('grades')
@UseGuards(JwtAuthGuard)
export class GradesController {
  constructor(private gradesService: GradesService) {}

  // ── ÉVALUATIONS (Notes mensuelles) — PROFESSEUR uniquement en écriture ──

  @Post('evaluations')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'DIRECTOR')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async createEvaluation(@CurrentUser() user: any, @Body() createDto: CreateEvaluationDto) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.createEvaluation(user.tenantId, createDto);
  }

  @Post('evaluations/bulk')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'DIRECTOR')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async bulkCreateEvaluations(@CurrentUser() user: any, @Body() bulkDto: BulkCreateEvaluationDto) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.bulkCreateEvaluations(user.tenantId, bulkDto);
  }

  @Get('evaluations')
  async getEvaluations(@CurrentUser() user: any, @Query() filters: any) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.getEvaluations(user.tenantId, {
      classId: filters.classId,
      subject: filters.subject,
      term: filters.term,
      studentId: filters.studentId,
      academicYear: filters.academicYear,
    });
  }

  // ── COMPOSITIONS (Examens) — PROFESSEUR uniquement en écriture ───────────

  @Post('compositions')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'DIRECTOR')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async createComposition(@CurrentUser() user: any, @Body() createDto: CreateCompositionDto) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.createComposition(user.tenantId, createDto);
  }

  @Post('compositions/bulk')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'DIRECTOR')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async bulkCreateCompositions(@CurrentUser() user: any, @Body() bulkDto: BulkCreateCompositionDto) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.bulkCreateCompositions(user.tenantId, bulkDto);
  }

  @Get('compositions')
  async getCompositions(@CurrentUser() user: any, @Query() filters: any) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.getCompositions(user.tenantId, {
      classId: filters.classId,
      subject: filters.subject,
      term: filters.term,
      studentId: filters.studentId,
      academicYear: filters.academicYear,
    });
  }

  @Patch('compositions/:compositionId')
  @UseGuards(RolesGuard)
  @Roles('TEACHER', 'DIRECTOR')
  async updateComposition(
    @CurrentUser() user: any,
    @Param('compositionId') compositionId: string,
    @Body() updateDto: UpdateCompositionDto,
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.updateComposition(user.tenantId, compositionId, updateDto);
  }

  // ── RAPPORTS (Bulletins) — DIRECTEUR uniquement ──────────────────────────

  @Get('student/:studentId/annual-report')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  async getAnnualReport(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('academicYear') academicYear?: string,
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.getAnnualReport(user.tenantId, studentId, academicYear);
  }

  @Get('student/:studentId/report')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  async getStudentReport(
    @CurrentUser() user: any,
    @Param('studentId') studentId: string,
    @Query('term') term: string,
    @Query('academicYear') academicYear?: string,
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    if (!term) throw new BadRequestException('Term required');
    return this.gradesService.getStudentReport(user.tenantId, studentId, term, academicYear);
  }

  @Get('class/:classId/report')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  async getClassReport(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('term') term: string,
    @Query('academicYear') academicYear?: string,
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    if (!term) throw new BadRequestException('Term required');
    return this.gradesService.getClassReport(user.tenantId, classId, term, academicYear);
  }

  // ── COEFFICIENTS — DIRECTEUR uniquement ──────────────────────────────────

  @Post('subject-coefficients')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async setSubjectCoefficients(
    @CurrentUser() user: any,
    @Body() setDto: SetSubjectCoefficientsDto,
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.setSubjectCoefficients(user.tenantId, setDto);
  }

  @Get('subject-coefficients/:classId')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  async getSubjectCoefficients(
    @CurrentUser() user: any,
    @Param('classId') classId: string,
    @Query('academicYear') academicYear?: string,
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.getSubjectCoefficients(user.tenantId, classId, academicYear);
  }

  // ── VERROUS DE TRIMESTRE — DIRECTEUR uniquement ───────────────────────────

  @Get('trimester-lock')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  async getTrimesterLock(
    @CurrentUser() user: any,
    @Query('classId') classId: string,
    @Query('trimester') trimester: string,
    @Query('academicYear') academicYear: string,
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    if (!classId || !trimester || !academicYear) {
      throw new BadRequestException('classId, trimester, academicYear required');
    }
    // Retourner {} si pas de verrou — évite le corps vide que NestJS envoie pour null
    const lock = await this.gradesService.getTrimesterLock(user.tenantId, classId, trimester, academicYear);
    return lock ?? {};
  }

  @Post('trimester-lock')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  async lockTrimester(
    @CurrentUser() user: any,
    @Body() body: { classId: string; trimester: string; academicYear: string },
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    return this.gradesService.lockTrimester(
      user.tenantId,
      body.classId,
      body.trimester,
      body.academicYear,
      user.firstName ? `${user.firstName} ${user.lastName}` : 'Unknown',
    );
  }

  @Delete('trimester-lock')
  @UseGuards(RolesGuard)
  @Roles('DIRECTOR')
  async unlockTrimester(
    @CurrentUser() user: any,
    @Query('classId') classId: string,
    @Query('trimester') trimester: string,
    @Query('academicYear') academicYear: string,
  ) {
    if (!user?.tenantId) throw new BadRequestException('TenantId missing');
    if (!classId || !trimester || !academicYear) {
      throw new BadRequestException('classId, trimester, academicYear required');
    }
    return this.gradesService.unlockTrimester(user.tenantId, classId, trimester, academicYear);
  }
}
