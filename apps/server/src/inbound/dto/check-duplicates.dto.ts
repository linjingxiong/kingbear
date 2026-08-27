import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsMongoId, ValidateNested } from 'class-validator';
import { ConfirmInboundItemDto } from './confirm-inbound-item.dto';

/**
 * 确认页实时校验用：字段跟 ConfirmInboundDto 一样，但这个接口只查不落库，
 * 用户还在填、明细可能还没填满就已经在调用了
 */
export class CheckDuplicatesDto {
  @IsMongoId()
  factoryId: string;

  @IsDateString()
  inboundDate: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ConfirmInboundItemDto)
  items: ConfirmInboundItemDto[];
}
