import { IsDateString, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateCommonMaterialReturnDto {
  @IsMongoId()
  oemFactoryId: string;

  @IsString()
  @IsNotEmpty()
  commonMaterialName: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsDateString()
  returnedDate: string;

  @IsOptional()
  @IsString()
  remark?: string;
}
