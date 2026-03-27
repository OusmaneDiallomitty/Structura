import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateSalaryConfigDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string; // "GNF" par défaut
}
