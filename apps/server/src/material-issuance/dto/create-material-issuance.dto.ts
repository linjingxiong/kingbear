import { IsDateString, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateMaterialIssuanceDto {
  @IsMongoId()
  oemFactoryId: string;

  @IsMongoId()
  materialId: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsDateString()
  issuedDate: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
