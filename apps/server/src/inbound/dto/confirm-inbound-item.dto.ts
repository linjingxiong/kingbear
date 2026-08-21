import { IsEnum, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { QuantitySource } from '@kingbear/shared';

export class ConfirmInboundItemDto {
  @IsOptional()
  @IsMongoId()
  productId?: string | null;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  weightJin: number;

  @IsNumber()
  @Min(0.1)
  unitWeightG: number;

  @IsOptional()
  @IsNumber()
  qtyDeclared?: number | null;

  @IsEnum(QuantitySource)
  quantitySource: QuantitySource;

  @IsNumber()
  @Min(0)
  factoryPrice: number;

  @IsOptional()
  @IsString()
  remark?: string;
}
