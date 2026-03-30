import { IsString, IsNumber, IsOptional, Min } from 'class-validator';

export class ReceiveStockDto {
  @IsNumber()
  @Min(0.001, { message: 'Quantité doit être > 0' })
  receivedQty: number;

  @IsString()
  receivedUnit: string; // tonne, palette, carton, boîte, etc

  @IsOptional()
  @IsString()
  supplierId?: string; // Fournisseur (optionnel)

  @IsOptional()
  @IsString()
  reference?: string; // Numéro BC, facture, etc

  @IsOptional()
  @IsString()
  notes?: string;
}
