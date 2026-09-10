import { Type } from 'class-transformer';
import { IsArray, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ProductMaterialDto } from './product-material.dto';

export class CreateProductDto {
  @IsMongoId()
  factoryId: string;

  @IsOptional()
  @IsMongoId()
  productGroupId?: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  factoryPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  processPrice?: number;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductMaterialDto)
  materials?: ProductMaterialDto[];
}
