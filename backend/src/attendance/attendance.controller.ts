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
import { AttendanceService } from './attendance.service';
import { CreateAttendanceDto, CreateBulkAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';

@Controller('attendance')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class AttendanceController {
    constructor(private readonly attendanceService: AttendanceService) { }

    @Post()
    @Roles('TEACHER', 'SUPERVISOR', 'DIRECTOR')
    @RequirePermission('attendance', 'create')
    create(@Request() req, @Body() createAttendanceDto: CreateAttendanceDto) {
        return this.attendanceService.create(req.user.tenantId, createAttendanceDto);
    }

    @Post('bulk')
    @Roles('TEACHER', 'SUPERVISOR', 'DIRECTOR')
    @RequirePermission('attendance', 'create')
    createBulk(@Request() req, @Body() createBulkDto: CreateBulkAttendanceDto) {
        return this.attendanceService.createBulk(req.user.tenantId, createBulkDto);
    }

    @SkipThrottle()
    @Get()
    @RequirePermission('attendance', 'view')
    findAll(@Request() req, @Query() filters: any) {
        return this.attendanceService.findAll(req.user.tenantId, filters);
    }

    @SkipThrottle()
    @Get('stats')
    @RequirePermission('attendance', 'view')
    getStats(@Request() req, @Query() filters: any) {
        return this.attendanceService.getStats(req.user.tenantId, filters);
    }

    @SkipThrottle()
    @Get('date/:date')
    @RequirePermission('attendance', 'view')
    getByDate(@Request() req, @Param('date') date: string, @Query('classId') classId?: string) {
        return this.attendanceService.getByDate(req.user.tenantId, date, classId);
    }

    @SkipThrottle()
    @Get(':id')
    @RequirePermission('attendance', 'view')
    findOne(@Request() req, @Param('id') id: string) {
        return this.attendanceService.findOne(req.user.tenantId, id);
    }

    @Patch(':id')
    @Roles('TEACHER', 'SUPERVISOR', 'DIRECTOR')
    @RequirePermission('attendance', 'edit')
    update(
        @Request() req,
        @Param('id') id: string,
        @Body() updateAttendanceDto: UpdateAttendanceDto,
    ) {
        return this.attendanceService.update(req.user.tenantId, id, updateAttendanceDto);
    }

    @Delete(':id')
    @Roles('DIRECTOR')
    @RequirePermission('attendance', 'delete')
    remove(@Request() req, @Param('id') id: string) {
        return this.attendanceService.remove(req.user.tenantId, id);
    }
}
