import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboundRecord, InboundRecordSchema } from '../inbound/schemas/inbound-record.schema';
import { Factory, FactorySchema } from '../factory/schemas/factory.schema';
import { MonthlyBillStatus, MonthlyBillStatusSchema } from '../billing/schemas/monthly-bill-status.schema';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InboundRecord.name, schema: InboundRecordSchema },
      { name: Factory.name, schema: FactorySchema },
      { name: MonthlyBillStatus.name, schema: MonthlyBillStatusSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
