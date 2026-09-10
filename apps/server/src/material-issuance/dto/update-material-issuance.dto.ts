import { PartialType } from '@nestjs/mapped-types';
import { CreateMaterialIssuanceDto } from './create-material-issuance.dto';

export class UpdateMaterialIssuanceDto extends PartialType(CreateMaterialIssuanceDto) {}
