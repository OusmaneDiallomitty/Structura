import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpsertSessionDto {
  @IsString()
  date: string; // 'YYYY-MM-DD'

  @IsNumber()
  @Min(0)
  openingBalance: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
