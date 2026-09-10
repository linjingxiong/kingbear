import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateProductGroupDto } from './create-product-group.dto';

// 归属的玩具厂不可改，跟 Product 一样
export class UpdateProductGroupDto extends PartialType(OmitType(CreateProductGroupDto, ['factoryId'] as const)) {}
