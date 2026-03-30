import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

const UNITS = [
  // Général
  'pièce', 'paire', 'forfait',
  // Poids / masse
  'kg', 'tonne',
  // Volume liquide
  'litre', 'bidon', 'bouteille', 'flacon', 'pot', 'jerrican',
  // Conditionnement solide
  'sac', 'sachet', 'boîte', 'carton', 'caisse', 'botte',
  // Construction / matériaux
  'barre', 'planche', 'mètre', 'm²', 'rouleau',
];

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  @IsIn(UNITS)
  unit?: string;

  @IsNumber()
  @Min(0)
  buyPrice: number;

  @IsNumber()
  @Min(0)
  sellPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockQty?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stockAlert?: number;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
