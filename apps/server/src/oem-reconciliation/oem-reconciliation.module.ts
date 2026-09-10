import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MaterialIssuance, MaterialIssuanceSchema } from '../material-issuance/schemas/material-issuance.schema';
import { OemReceipt, OemReceiptSchema } from '../oem-receipt/schemas/oem-receipt.schema';
import { OemFactory, OemFactorySchema } from '../oem-factory/schemas/oem-factory.schema';
import { ProductGroup, ProductGroupSchema } from '../product-group/schemas/product-group.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { CommonMaterial, CommonMaterialSchema } from '../common-material/schemas/common-material.schema';
import {
  CommonMaterialReturn,
  CommonMaterialReturnSchema,
} from '../common-material-return/schemas/common-material-return.schema';
import { OemReconciliationService } from './oem-reconciliation.service';
import { OemReconciliationController } from './oem-reconciliation.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MaterialIssuance.name, schema: MaterialIssuanceSchema },
      { name: OemReceipt.name, schema: OemReceiptSchema },
      { name: OemFactory.name, schema: OemFactorySchema },
      { name: ProductGroup.name, schema: ProductGroupSchema },
      { name: Product.name, schema: ProductSchema },
      { name: CommonMaterial.name, schema: CommonMaterialSchema },
      { name: CommonMaterialReturn.name, schema: CommonMaterialReturnSchema },
    ]),
  ],
  controllers: [OemReconciliationController],
  providers: [OemReconciliationService],
})
export class OemReconciliationModule {}
