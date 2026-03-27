import {
  IsString,
  IsNumber,
  IsIn,
  IsOptional,
  Min,
  MaxLength,
  Matches,
} from 'class-validator';

export class PaySalaryDto {
  @IsString()
  staffId: string;

  /** Format "YYYY-MM" ex: "2026-03" */
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month doit être au format YYYY-MM' })
  month: string;

  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  @IsIn(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER', 'CHECK'])
  @IsOptional()
  method?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  note?: string;

  @IsString()
  @IsOptional()
  academicYear?: string;
}
