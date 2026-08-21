import { IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductDto {
  @IsMongoId()
  factoryId: string;

  @IsString()
  @IsNotEmpty()
  sku: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  factoryPrice: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  processPrice?: number;

  @IsOptional()
  @IsString()
  remark?: string;
}
