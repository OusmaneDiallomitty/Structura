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
import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Post()
  @Roles('DIRECTOR', 'SECRETARY', 'TEACHER')
  @RequirePermission('students', 'create')
  async create(@Request() req, @Body() createStudentDto: CreateStudentDto) {
    const student = await this.studentsService.create(req.user.tenantId, createStudentDto);
    if (req.user.role !== 'DIRECTOR') {
      const actor = `${req.user.firstName} ${req.user.lastName}`;
      this.notificationsService.notifyDirectors(
        req.user.tenantId,
        'NEW_STUDENT',
        'Nouvel élève inscrit',
        `${actor} a inscrit ${createStudentDto.firstName} ${createStudentDto.lastName}.`,
        '/dashboard/students',
      ).catch(() => {});
    }
    return student;
  }

  @SkipThrottle()
  @Get()
  @RequirePermission('students', 'view')
  findAll(@Request() req, @Query() filters: any) {
    return this.studentsService.findAll(req.user.tenantId, filters, req.user);
  }

  @SkipThrottle()
  @Get('stats')
  @RequirePermission('students', 'view')
  getStats(@Request() req) {
    return this.studentsService.getStats(req.user.tenantId);
  }

  @SkipThrottle()
  @Get(':id')
  @RequirePermission('students', 'view')
  findOne(@Request() req, @Param('id') id: string) {
    return this.studentsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @Roles('DIRECTOR', 'SECRETARY', 'TEACHER')
  @RequirePermission('students', 'edit')
  update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
  ) {
    return this.studentsService.update(req.user.tenantId, id, updateStudentDto);
  }

  @Delete(':id')
  @Roles('DIRECTOR')
  @RequirePermission('students', 'delete')
  remove(@Request() req, @Param('id') id: string) {
    return this.studentsService.remove(req.user.tenantId, id);
  }
}
