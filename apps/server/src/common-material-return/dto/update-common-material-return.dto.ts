import { PartialType } from '@nestjs/mapped-types';
import { CreateCommonMaterialReturnDto } from './create-common-material-return.dto';

export class UpdateCommonMaterialReturnDto extends PartialType(CreateCommonMaterialReturnDto) {}
