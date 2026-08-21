import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Factory, FactorySchema } from './schemas/factory.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { InboundRecord, InboundRecordSchema } from '../inbound/schemas/inbound-record.schema';
import { FactoryService } from './factory.service';
import { FactoryController } from './factory.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Factory.name, schema: FactorySchema },
      { name: Product.name, schema: ProductSchema },
      { name: InboundRecord.name, schema: InboundRecordSchema },
    ]),
  ],
  controllers: [FactoryController],
  providers: [FactoryService],
  exports: [FactoryService],
})
export class FactoryModule {}
