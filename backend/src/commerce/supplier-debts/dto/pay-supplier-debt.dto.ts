import { IsNumber, IsOptional, IsString, Min, IsIn } from 'class-validator';

export class PaySupplierDebtDto {
  @IsNumber()
  @Min(1, { message: 'Le montant doit être supérieur à 0' })
  amount: number;

  @IsOptional()
  @IsString()
  @IsIn(['CASH', 'MOBILE_MONEY', 'BANK_TRANSFER'])
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
