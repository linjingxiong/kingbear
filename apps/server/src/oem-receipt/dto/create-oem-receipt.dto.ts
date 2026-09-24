import { IsArray, IsBoolean, IsDateString, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

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

  // 后端查出疑似重复数据会拦一次（409），人工确认过之后带上这个标记再提交一次，跳过检查
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
