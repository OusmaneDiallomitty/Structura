import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { AcademicYearsService } from './academic-years.service';
import { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import { CreateNewYearTransitionDto } from './dto/create-new-year-transition.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('academic-years')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  /**
   * GET /academic-years
   * Récupérer toutes les années académiques
   */
  @SkipThrottle()
  @Get()
  findAll(@Request() req) {
    return this.academicYearsService.findAll(req.user.tenantId);
  }

  /**
   * GET /academic-years/current
   * Récupérer l'année académique courante
   */
  @SkipThrottle()
  @Get('current')
  findCurrent(@Request() req) {
    return this.academicYearsService.findCurrent(req.user.tenantId);
  }

  /**
   * GET /academic-years/promotion-preview
   * Aperçu de promotion : moyennes et décisions suggérées par élève
   */
  @SkipThrottle()
  @Get('promotion-preview')
  @Roles('DIRECTOR')
  getPromotionPreview(@CurrentUser() user: any) {
    return this.academicYearsService.getPromotionPreview(user.tenantId);
  }

  /**
   * GET /academic-years/:id
   * Récupérer une année académique par ID
   */
  @SkipThrottle()
  @Get(':id')
  findOne(@Request() req, @Param('id') id: string) {
    return this.academicYearsService.findOne(req.user.tenantId, id);
  }

  /**
   * POST /academic-years
   * Créer une nouvelle année académique simple
   */
  @Post()
  @Roles('DIRECTOR')
  create(@Request() req, @Body() createDto: CreateAcademicYearDto) {
    return this.academicYearsService.create(req.user.tenantId, createDto);
  }

  /**
   * POST /academic-years/transition
   * Créer une nouvelle année avec transition automatique (WIZARD)
   * C'est l'endpoint principal utilisé par le wizard frontend
   */
  @Post('transition')
  @Roles('DIRECTOR')
  createWithTransition(
    @Request() req,
    @Body() createDto: CreateNewYearTransitionDto,
  ) {
    return this.academicYearsService.createWithTransition(
      req.user.tenantId,
      createDto,
    );
  }

  /**
   * PATCH /academic-years/:id/set-current
   * Définir une année comme année courante
   */
  @Patch(':id/set-current')
  @Roles('DIRECTOR')
  setCurrent(@Request() req, @Param('id') id: string) {
    return this.academicYearsService.setCurrent(req.user.tenantId, id);
  }

  /**
   * DELETE /academic-years/:id
   * Supprimer une année académique
   */
  @Delete(':id')
  @Roles('DIRECTOR')
  remove(@Request() req, @Param('id') id: string) {
    return this.academicYearsService.remove(req.user.tenantId, id);
  }
}
