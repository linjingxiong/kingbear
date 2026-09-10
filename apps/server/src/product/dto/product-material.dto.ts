import { IsMongoId, IsNumber, Min } from 'class-validator';

export class ProductMaterialDto {
  @IsMongoId()
  materialId: string;

  @IsNumber()
  @Min(0)
  qty: number;
}
