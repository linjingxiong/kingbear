import { IsMongoId, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProductGroupDto {
  @IsMongoId()
  factoryId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
