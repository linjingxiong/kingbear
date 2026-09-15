import { PartialType } from '@nestjs/mapped-types';
import { CreateInboundReturnDto } from './create-inbound-return.dto';

export class UpdateInboundReturnDto extends PartialType(CreateInboundReturnDto) {}
