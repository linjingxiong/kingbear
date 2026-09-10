import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MaterialIssuance, MaterialIssuanceSchema } from '../material-issuance/schemas/material-issuance.schema';
import { OemReceipt, OemReceiptSchema } from '../oem-receipt/schemas/oem-receipt.schema';
import { OemFactory, OemFactorySchema } from '../oem-factory/schemas/oem-factory.schema';
import { Material, MaterialSchema } from '../material/schemas/material.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { OemReconciliationService } from './oem-reconciliation.service';
import { OemReconciliationController } from './oem-reconciliation.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MaterialIssuance.name, schema: MaterialIssuanceSchema },
      { name: OemReceipt.name, schema: OemReceiptSchema },
      { name: OemFactory.name, schema: OemFactorySchema },
      { name: Material.name, schema: MaterialSchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [OemReconciliationController],
  providers: [OemReconciliationService],
})
export class OemReconciliationModule {}
