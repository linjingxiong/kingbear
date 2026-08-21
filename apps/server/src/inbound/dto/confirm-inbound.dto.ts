import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsMongoId, ValidateNested } from 'class-validator';
import { ConfirmInboundItemDto } from './confirm-inbound-item.dto';

export class ConfirmInboundDto {
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
