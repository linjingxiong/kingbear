import { IsArray, IsDateString, IsIn, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateInboundReturnDto {
  @IsOptional()
  @IsIn(['issue', 'return'])
  kind?: 'issue' | 'return';

  @IsMongoId()
  factoryId: string;

  @IsOptional()
  @IsMongoId()
  productId?: string | null;

  // 退货必填（货号），发料不填（原材料没有货号，用 materialName）
  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  name?: string;

  // 发料必填（物料名称），退货不填
  @IsOptional()
  @IsString()
  materialName?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  weightJin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  unitWeightG?: number;

  @IsOptional()
  @IsNumber()
  qtyDeclared?: number | null;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  factoryPrice?: number;

  @IsDateString()
  returnDate: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  remark?: string;
}
