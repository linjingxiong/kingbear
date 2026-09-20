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

  @IsString()
  sku: string;

  @IsString()
  name: string;

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
