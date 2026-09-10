import { IsArray, IsDateString, IsMongoId, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOemReceiptDto {
  @IsMongoId()
  oemFactoryId: string;

  @IsMongoId()
  productId: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsDateString()
  receivedDate: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
