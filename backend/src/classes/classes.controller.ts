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
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { CreateClassDto } from './dto/create-class.dto';
import { UpdateClassDto } from './dto/update-class.dto';
import { CreateDefaultClassesDto } from './dto/create-default-classes.dto';
import { ConvertAndCreateClassesDto } from './dto/convert-and-create-classes.dto';
import { SaveClassSubjectsDto } from './dto/save-class-subjects.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { SkipThrottle } from '@nestjs/throttler';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @Roles('DIRECTOR', 'SECRETARY')
  @RequirePermission('classes', 'create')
  create(@Request() req, @Body() createClassDto: CreateClassDto) {
    return this.classesService.create(req.user.tenantId, createClassDto);
  }

  @Post('default')
  @Roles('DIRECTOR', 'SECRETARY')
  @RequirePermission('classes', 'create')
  createDefaultClasses(@Request() req, @Body() createDefaultClassesDto: CreateDefaultClassesDto) {
    return this.classesService.createDefaultClasses(req.user.tenantId, createDefaultClassesDto);
  }

  @Post('convert-and-create')
  @Roles('DIRECTOR', 'SECRETARY')
  @RequirePermission('classes', 'create')
  convertAndCreateClasses(@Request() req, @Body() convertAndCreateDto: ConvertAndCreateClassesDto) {
    return this.classesService.convertAndCreateClasses(req.user.tenantId, convertAndCreateDto);
  }

  @SkipThrottle()
  @Get()
  @RequirePermission('classes', 'view')
  findAll(@Request() req) {
    return this.classesService.findAll(req.user.tenantId, req.user.id, req.user.role);
  }

  @SkipThrottle()
  @Get(':id')
  @RequirePermission('classes', 'view')
  findOne(@Request() req, @Param('id') id: string) {
    return this.classesService.findOne(req.user.tenantId, id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @Roles('DIRECTOR', 'SECRETARY')
  @RequirePermission('classes', 'edit')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateClassDto: UpdateClassDto,
  ) {
    return this.classesService.update(req.user.tenantId, id, updateClassDto);
  }

  @Post(':id/transfer-students')
  @Roles('DIRECTOR', 'SECRETARY')
  @RequirePermission('classes', 'edit')
  transferStudents(
    @Request() req,
    @Param('id') sourceClassId: string,
    @Body('targetClassId') targetClassId: string,
  ) {
    return this.classesService.transferStudents(
      req.user.tenantId,
      sourceClassId,
      targetClassId,
    );
  }

  @Delete(':id')
  @Roles('DIRECTOR')
  @RequirePermission('classes', 'delete')
  remove(@Request() req, @Param('id') id: string) {
    return this.classesService.remove(req.user.tenantId, id);
  }

  // ─── Matières d'une classe ─────────────────────────────────────────────────

  /**
   * GET /classes/:id/subjects
   * Accessible à tous les rôles pouvant voir les classes (TEACHER inclus).
   */
  @SkipThrottle()
  @Get(':id/subjects')
  @RequirePermission('classes', 'view')
  getSubjects(@Request() req, @Param('id') id: string) {
    return this.classesService.getSubjects(req.user.tenantId, id);
  }

  /**
   * POST /classes/:id/subjects
   * Les professeurs peuvent éditer les matières de leur propre classe.
   * Pas de @RequirePermission ici car les TEACHERS ont classes.edit=false par défaut
   * mais sont autorisés via @Roles — le RolesGuard gère cet endpoint.
   */
  @Post(':id/subjects')
  @Roles('DIRECTOR', 'SECRETARY', 'TEACHER')
  saveSubjects(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: SaveClassSubjectsDto,
  ) {
    return this.classesService.saveSubjects(req.user.tenantId, id, dto);
  }
}
