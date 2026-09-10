import { Type } from 'class-transformer';
import { IsArray, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { ProcessStepDto } from './process-step.dto';

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessStepDto)
  processes?: ProcessStepDto[];
}
