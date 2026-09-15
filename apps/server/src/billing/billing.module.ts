import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboundRecord, InboundRecordSchema } from '../inbound/schemas/inbound-record.schema';
import { InboundReturn, InboundReturnSchema } from '../inbound-return/schemas/inbound-return.schema';
import { Factory, FactorySchema } from '../factory/schemas/factory.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { MonthlyBillStatus, MonthlyBillStatusSchema } from './schemas/monthly-bill-status.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InboundRecord.name, schema: InboundRecordSchema },
      { name: InboundReturn.name, schema: InboundReturnSchema },
      { name: Factory.name, schema: FactorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: MonthlyBillStatus.name, schema: MonthlyBillStatusSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
