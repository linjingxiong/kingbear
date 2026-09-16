import { IsMongoId, IsOptional, Matches } from 'class-validator';

export class InboundGalleryQueryDto {
  @IsOptional()
  @IsMongoId()
  factoryId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'yearMonth 格式应为 YYYY-MM' })
  yearMonth?: string;
}
