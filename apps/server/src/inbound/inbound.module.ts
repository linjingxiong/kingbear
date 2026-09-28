import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboundRecord, InboundRecordSchema } from './schemas/inbound-record.schema';
import { InboundReturn, InboundReturnSchema } from '../inbound-return/schemas/inbound-return.schema';
import { InboundService } from './inbound.service';
import { InboundController } from './inbound.controller';
import { OcrModule } from '../ocr/ocr.module';
import { FactoryModule } from '../factory/factory.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: InboundRecord.name, schema: InboundRecordSchema },
      // 单据相册要把出库单的照片也带上
      { name: InboundReturn.name, schema: InboundReturnSchema },
    ]),
    OcrModule,
    FactoryModule,
    ProductModule,
  ],
  controllers: [InboundController],
  providers: [InboundService],
  exports: [InboundService],
})
export class InboundModule {}
