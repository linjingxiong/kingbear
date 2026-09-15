import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** 跟 ContactablePartyBase 对应的公共创建 DTO 字段，见该文件顶部注释 */
export class CreateContactablePartyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
