import { PartialType } from '@nestjs/mapped-types';
import { CreateOemReceiptDto } from './create-oem-receipt.dto';

export class UpdateOemReceiptDto extends PartialType(CreateOemReceiptDto) {}
