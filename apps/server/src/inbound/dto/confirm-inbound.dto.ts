import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsMongoId, IsOptional, ValidateNested } from 'class-validator';
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

  /** 查出疑似重复数据后端会拦一次并返回 409；人工确认过之后带上这个标记再提交一次，跳过检查 */
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
