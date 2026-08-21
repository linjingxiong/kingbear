import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboundRecord, InboundRecordSchema } from './schemas/inbound-record.schema';
import { InboundService } from './inbound.service';
import { InboundController } from './inbound.controller';
import { OcrModule } from '../ocr/ocr.module';
import { FactoryModule } from '../factory/factory.module';
import { ProductModule } from '../product/product.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: InboundRecord.name, schema: InboundRecordSchema }]),
    OcrModule,
    FactoryModule,
    ProductModule,
  ],
  controllers: [InboundController],
  providers: [InboundService],
  exports: [InboundService],
})
export class InboundModule {}
