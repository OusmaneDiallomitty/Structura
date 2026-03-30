import { IsNumber, IsString, IsOptional, IsDateString, Min } from 'class-validator';

export class CreateExpenseDto {
  @IsNumber()
  @Min(1)
  amount: number;

  @IsString()
  category: string; // loyer | salaire | transport | achat_divers | autre

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
