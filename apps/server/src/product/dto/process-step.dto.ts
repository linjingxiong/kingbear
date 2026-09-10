import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsMongoId, IsNotEmpty, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

export class ProcessStepMaterialDto {
  @IsMongoId()
  materialId: string;

  @IsNumber()
  @Min(0)
  qty: number;
}

export class ProcessStepDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ProcessStepMaterialDto)
  materials: ProcessStepMaterialDto[];
}
