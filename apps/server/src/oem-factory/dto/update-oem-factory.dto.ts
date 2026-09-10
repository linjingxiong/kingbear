import { PartialType } from '@nestjs/mapped-types';
import { CreateOemFactoryDto } from './create-oem-factory.dto';

export class UpdateOemFactoryDto extends PartialType(CreateOemFactoryDto) {}
