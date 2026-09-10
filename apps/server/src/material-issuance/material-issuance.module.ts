import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MaterialIssuance, MaterialIssuanceSchema } from './schemas/material-issuance.schema';
import { OemFactory, OemFactorySchema } from '../oem-factory/schemas/oem-factory.schema';
import { ProductGroup, ProductGroupSchema } from '../product-group/schemas/product-group.schema';
import { CommonMaterial, CommonMaterialSchema } from '../common-material/schemas/common-material.schema';
import { MaterialIssuanceService } from './material-issuance.service';
import { MaterialIssuanceController } from './material-issuance.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MaterialIssuance.name, schema: MaterialIssuanceSchema },
      { name: OemFactory.name, schema: OemFactorySchema },
      { name: ProductGroup.name, schema: ProductGroupSchema },
      { name: CommonMaterial.name, schema: CommonMaterialSchema },
    ]),
  ],
  controllers: [MaterialIssuanceController],
  providers: [MaterialIssuanceService],
  exports: [MaterialIssuanceService],
})
export class MaterialIssuanceModule {}
