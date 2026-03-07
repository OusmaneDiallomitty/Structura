import { IsString, IsDateString, IsIn, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAttendanceDto {
    @IsDateString()
    date: string;

    @IsString()
    @IsIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
    status: string;

    @IsString()
    studentId: string;

    @IsString()
    classId: string;

    @IsString()
    @IsOptional()
    notes?: string;

    @IsString()
    markedBy: string;
}

// DTO pour création en masse (toute une classe)
export class BulkAttendanceItemDto {
    @IsString()
    studentId: string;

    @IsString()
    @IsIn(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'])
    status: string;

    @IsString()
    @IsOptional()
    notes?: string;
}

export class CreateBulkAttendanceDto {
    @IsDateString()
    date: string;

    @IsString()
    classId: string;

    @IsString()
    markedBy: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkAttendanceItemDto)
    attendances: BulkAttendanceItemDto[];
}
