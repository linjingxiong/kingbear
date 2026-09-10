import { PartialType } from '@nestjs/mapped-types';
import { CreateCommonMaterialDto } from './create-common-material.dto';

export class UpdateCommonMaterialDto extends PartialType(CreateCommonMaterialDto) {}
