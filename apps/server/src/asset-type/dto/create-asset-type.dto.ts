import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateAssetTypeDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
