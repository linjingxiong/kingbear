import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMaterialDto {
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
