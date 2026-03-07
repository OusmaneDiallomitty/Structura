import { IsString, IsNumber, IsDateString, IsIn, IsOptional } from 'class-validator';

export class CreatePaymentDto {
    @IsNumber()
    amount: number;

    @IsString()
    @IsOptional()
    currency?: string; // Par défaut GNF dans le service

    @IsString()
    @IsIn(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHECK'])
    method: string;

    @IsString()
    @IsOptional()
    status?: string; // Par défaut "paid"

    @IsString()
    studentId: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsDateString()
    @IsOptional()
    dueDate?: string;

    @IsDateString()
    @IsOptional()
    paidDate?: string;

    @IsString()
    @IsOptional()
    academicYear?: string;

    @IsString()
    @IsOptional()
    term?: string; // "Trimestre 1", "Trimestre 2", "Trimestre 3"
}
