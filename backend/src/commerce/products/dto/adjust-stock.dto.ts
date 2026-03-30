import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class AdjustStockDto {
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsString()
  @IsIn(['IN', 'OUT', 'ADJUSTMENT', 'RETURN'])
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'RETURN';

  @IsOptional()
  @IsString()
  reason?: string;
}
