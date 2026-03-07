import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto, CreateBulkAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';

@Injectable()
export class AttendanceService {
    constructor(private prisma: PrismaService) { }

    async create(tenantId: string, createAttendanceDto: CreateAttendanceDto) {
        return this.prisma.attendance.create({
            data: {
                date: new Date(createAttendanceDto.date),
                status: createAttendanceDto.status as any,
                studentId: createAttendanceDto.studentId,
                classId: createAttendanceDto.classId,
                notes: createAttendanceDto.notes,
                markedBy: createAttendanceDto.markedBy,
                tenantId,
            },
            include: {
                student: true,
                class: true,
            },
        });
    }

    async createBulk(tenantId: string, createBulkDto: CreateBulkAttendanceDto) {
        const attendances = createBulkDto.attendances.map((item) => ({
            date: new Date(createBulkDto.date),
            classId: createBulkDto.classId,
            markedBy: createBulkDto.markedBy,
            studentId: item.studentId,
            status: item.status as any,
            notes: item.notes,
            tenantId,
        }));

        // Utiliser createMany pour insérer en masse
        const result = await this.prisma.attendance.createMany({
            data: attendances,
            skipDuplicates: true, // Éviter les doublons (même élève, même date)
        });

        return {
            count: result.count,
            message: `${result.count} présences enregistrées`,
        };
    }

    async findAll(
        tenantId: string,
        filters?: {
            date?: string;
            classId?: string;
            studentId?: string;
            status?: string;
            startDate?: string;
            endDate?: string;
            // Pagination — limit: max résultats (défaut 500, max 5000 pour export)
            limit?: string | number;
            skip?: string | number;
        },
    ) {
        // Sécurité anti-OOM : jamais plus de 5000 enregistrements d'un coup
        const take = Math.min(Number(filters?.limit) || 500, 5000);
        const skip = Number(filters?.skip) || 0;

        const where: any = { tenantId };

        if (filters?.date) {
            const date = new Date(filters.date);
            where.date = {
                gte: new Date(date.setHours(0, 0, 0, 0)),
                lte: new Date(date.setHours(23, 59, 59, 999)),
            };
        }

        if (filters?.startDate && filters?.endDate) {
            where.date = {
                gte: new Date(filters.startDate),
                lte: new Date(filters.endDate),
            };
        }

        if (filters?.classId)  where.classId  = filters.classId;
        if (filters?.studentId) where.studentId = filters.studentId;
        if (filters?.status)   where.status   = filters.status;

        return this.prisma.attendance.findMany({
            where,
            take,
            skip,
            include: {
                student: true,
                class: true,
            },
            orderBy: { date: 'desc' },
        });
    }

    async findOne(tenantId: string, id: string) {
        const attendance = await this.prisma.attendance.findFirst({
            where: {
                id,
                tenantId,
            },
            include: {
                student: true,
                class: true,
            },
        });

        if (!attendance) {
            throw new NotFoundException('Présence non trouvée');
        }

        return attendance;
    }

    async update(tenantId: string, id: string, updateAttendanceDto: UpdateAttendanceDto) {
        // Vérifier que la présence appartient au tenant
        await this.findOne(tenantId, id);

        const data: any = { ...updateAttendanceDto };
        if (updateAttendanceDto.date) {
            data.date = new Date(updateAttendanceDto.date);
        }

        return this.prisma.attendance.update({
            where: { id },
            data,
            include: {
                student: true,
                class: true,
            },
        });
    }

    async remove(tenantId: string, id: string) {
        // Vérifier que la présence appartient au tenant
        await this.findOne(tenantId, id);

        return this.prisma.attendance.delete({
            where: { id },
        });
    }

    async getStats(tenantId: string, filters?: { classId?: string; studentId?: string }) {
        const where: any = { tenantId };

        if (filters?.classId) {
            where.classId = filters.classId;
        }

        if (filters?.studentId) {
            where.studentId = filters.studentId;
        }

        const [total, present, absent, late, excused] = await Promise.all([
            this.prisma.attendance.count({ where }),
            this.prisma.attendance.count({ where: { ...where, status: 'PRESENT' } }),
            this.prisma.attendance.count({ where: { ...where, status: 'ABSENT' } }),
            this.prisma.attendance.count({ where: { ...where, status: 'LATE' } }),
            this.prisma.attendance.count({ where: { ...where, status: 'EXCUSED' } }),
        ]);

        const attendanceRate = total > 0 ? ((present + late) / total) * 100 : 0;

        return {
            total,
            present,
            absent,
            late,
            excused,
            attendanceRate: Math.round(attendanceRate * 100) / 100,
        };
    }

    async getByDate(tenantId: string, date: string, classId?: string) {
        const where: any = {
            tenantId,
            date: {
                gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
                lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
            },
        };

        if (classId) {
            where.classId = classId;
        }

        return this.prisma.attendance.findMany({
            where,
            include: {
                student: true,
                class: true,
            },
            orderBy: {
                student: {
                    lastName: 'asc',
                },
            },
        });
    }
}
