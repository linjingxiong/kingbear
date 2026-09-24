import { IsBoolean, IsDateString, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCommonMaterialReturnDto {
  @IsMongoId()
  oemFactoryId: string;

  @IsString()
  @IsNotEmpty()
  commonMaterialName: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsDateString()
  returnedDate: string;

  @IsOptional()
  @IsString()
  remark?: string;

  // 后端查出疑似重复数据会拦一次（409），人工确认过之后带上这个标记再提交一次，跳过检查
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
