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

@Controller('students')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  @Post()
  @Roles('DIRECTOR', 'SECRETARY', 'TEACHER')
  @RequirePermission('students', 'create')
  create(@Request() req, @Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(req.user.tenantId, createStudentDto);
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
