import { IsArray, IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAssetDto {
  @IsString()
  @IsNotEmpty()
  custodian: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  qty: number;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsDateString()
  checkoutDate: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}
