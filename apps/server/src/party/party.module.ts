import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Factory, FactorySchema } from '../factory/schemas/factory.schema';
import { OemFactory, OemFactorySchema } from '../oem-factory/schemas/oem-factory.schema';
import { InboundRecord, InboundRecordSchema } from '../inbound/schemas/inbound-record.schema';
import { InboundReturn, InboundReturnSchema } from '../inbound-return/schemas/inbound-return.schema';
import { MaterialIssuance, MaterialIssuanceSchema } from '../material-issuance/schemas/material-issuance.schema';
import { OemReceipt, OemReceiptSchema } from '../oem-receipt/schemas/oem-receipt.schema';
import {
  CommonMaterialReturn,
  CommonMaterialReturnSchema,
} from '../common-material-return/schemas/common-material-return.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { ProductGroup, ProductGroupSchema } from '../product-group/schemas/product-group.schema';
import { FactoryModule } from '../factory/factory.module';
import { PartyService } from './party.service';
import { PartyController } from './party.controller';

@Module({
  imports: [
    // 玩具厂的"产品数量/累计加工金额"直接用 FactoryService.findAll()，不再抄第五份加工金额的算法
    FactoryModule,
    MongooseModule.forFeature([
      { name: Factory.name, schema: FactorySchema },
      { name: OemFactory.name, schema: OemFactorySchema },
      { name: InboundRecord.name, schema: InboundRecordSchema },
      { name: InboundReturn.name, schema: InboundReturnSchema },
      { name: MaterialIssuance.name, schema: MaterialIssuanceSchema },
      { name: OemReceipt.name, schema: OemReceiptSchema },
      { name: CommonMaterialReturn.name, schema: CommonMaterialReturnSchema },
      { name: Product.name, schema: ProductSchema },
      { name: ProductGroup.name, schema: ProductGroupSchema },
    ]),
  ],
  controllers: [PartyController],
  providers: [PartyService],
})
export class PartyModule {}
