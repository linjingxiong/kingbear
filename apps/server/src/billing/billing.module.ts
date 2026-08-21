import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboundRecord, InboundRecordSchema } from '../inbound/schemas/inbound-record.schema';
import { Factory, FactorySchema } from '../factory/schemas/factory.schema';
import { MonthlyBillStatus, MonthlyBillStatusSchema } from './schemas/monthly-bill-status.schema';
import { BillingService } from './billing.service';
import { BillingController } from './billing.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InboundRecord.name, schema: InboundRecordSchema },
      { name: Factory.name, schema: FactorySchema },
      { name: MonthlyBillStatus.name, schema: MonthlyBillStatusSchema },
    ]),
  ],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
