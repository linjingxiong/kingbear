import { IsArray, IsDateString, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOemReceiptDto {
  @IsMongoId()
  oemFactoryId: string;

  @IsMongoId()
  productId: string;

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

  @IsDateString()
  receivedDate: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  remark?: string;
}
