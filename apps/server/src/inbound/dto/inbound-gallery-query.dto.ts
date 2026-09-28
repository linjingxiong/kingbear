import { IsIn, IsMongoId, IsOptional, Matches } from 'class-validator';

export class InboundGalleryQueryDto {
  @IsOptional()
  @IsMongoId()
  factoryId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'yearMonth 格式应为 YYYY-MM' })
  yearMonth?: string;

  // 只看入库单或只看出库单，不传就是两种都要
  @IsOptional()
  @IsIn(['inbound', 'outbound'])
  kind?: 'inbound' | 'outbound';
}
