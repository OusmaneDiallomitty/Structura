import { IsString, IsOptional, ValidateNested, ArrayMinSize, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiptLineDto {
  @IsString()
  productId: string;

  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsString()
  unit: string; // sac, kg, litre, pièce, etc

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateReceiptDto {
  @IsOptional()
  @IsString()
  supplierId?: string; // ID fournisseur BDD (optionnel)

  @IsString()
  supplierName: string; // Nom fournisseur (obligatoire)

  @IsOptional()
  @IsString()
  referenceNumber?: string; // Numéro BC, facture, etc

  @ValidateNested({ each: true })
  @ArrayMinSize(1, { message: 'Au moins 1 produit requis' })
  @Type(() => ReceiptLineDto)
  lines: ReceiptLineDto[];

  @IsOptional()
  @IsString()
  notes?: string; // Remarques globales

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountDue?: number; // Montant total dû au fournisseur pour cette réception
}
