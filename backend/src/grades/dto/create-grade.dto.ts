import { IsString, IsNumber, IsOptional, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateGradeDto {
    @IsString()
    subject: string; // "Mathématiques", "Français", etc.

    @IsNumber()
    @Min(0)
    score: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    maxScore?: number; // Par défaut 20

    @IsNumber()
    @Min(0)
    @IsOptional()
    coefficient?: number; // Par défaut 1

    @IsString()
    term: string; // "Trimestre 1", "Trimestre 2", "Trimestre 3"

    @IsString()
    @IsOptional()
    academicYear?: string; // Par défaut année en cours

    @IsString()
    studentId: string;

    @IsString()
    classId: string;

    @IsString()
    @IsOptional()
    teacherId?: string;

    @IsString()
    @IsOptional()
    teacherName?: string;

    @IsString()
    @IsOptional()
    notes?: string; // Commentaires du professeur
}

// DTO pour création en masse (plusieurs élèves, même matière)
export class BulkGradeItemDto {
    @IsString()
    studentId: string;

    @IsNumber()
    @Min(0)
    score: number;

    @IsString()
    @IsOptional()
    notes?: string;
}

export class CreateBulkGradeDto {
    @IsString()
    subject: string;

    @IsNumber()
    @Min(0)
    @IsOptional()
    maxScore?: number;

    @IsNumber()
    @Min(0)
    @IsOptional()
    coefficient?: number;

    @IsString()
    term: string;

    @IsString()
    @IsOptional()
    academicYear?: string;

    @IsString()
    classId: string;

    @IsString()
    @IsOptional()
    teacherId?: string;

    @IsString()
    @IsOptional()
    teacherName?: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => BulkGradeItemDto)
    grades: BulkGradeItemDto[];
}
