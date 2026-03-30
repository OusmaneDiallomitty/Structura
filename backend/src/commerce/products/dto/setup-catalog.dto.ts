import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CatalogItemDto {
  @IsString() @IsNotEmpty()
  categoryName: string;

  @IsString() @IsNotEmpty()
  name: string;

  @IsString() @IsNotEmpty()
  unit: string;

  @IsNumber() @Min(0)
  buyPrice: number;

  @IsNumber() @Min(0)
  sellPrice: number;

  @IsOptional() @IsNumber() @Min(0)
  stockQty?: number;

  @IsOptional() @IsNumber() @Min(0)
  stockAlert?: number;
}

export class SetupCatalogDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CatalogItemDto)
  items: CatalogItemDto[];
}
