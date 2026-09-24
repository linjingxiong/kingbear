import { IsBoolean, IsDateString, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaterialIssuanceDto {
  @IsMongoId()
  oemFactoryId: string;

  @IsOptional()
  @IsMongoId()
  productGroupId?: string;

  @IsString()
  @IsNotEmpty()
  materialName: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsDateString()
  issuedDate: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  // 后端查出疑似重复数据会拦一次（409），人工确认过之后带上这个标记再提交一次，跳过检查
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
