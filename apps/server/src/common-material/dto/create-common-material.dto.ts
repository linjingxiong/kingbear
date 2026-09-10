import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateCommonMaterialDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  unit: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
