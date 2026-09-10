import { IsDateString, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaterialIssuanceDto {
  @IsMongoId()
  oemFactoryId: string;

  @IsMongoId()
  productGroupId: string;

  @IsString()
  @IsNotEmpty()
  materialName: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsDateString()
  issuedDate: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
