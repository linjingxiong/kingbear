import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InboundReturn, InboundReturnSchema } from './schemas/inbound-return.schema';
import { Factory, FactorySchema } from '../factory/schemas/factory.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { OcrModule } from '../ocr/ocr.module';
import { InboundReturnService } from './inbound-return.service';
import { InboundReturnController } from './inbound-return.controller';

@Module({
  imports: [
    OcrModule,
    MongooseModule.forFeature([
      { name: InboundReturn.name, schema: InboundReturnSchema },
      { name: Factory.name, schema: FactorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [InboundReturnController],
  providers: [InboundReturnService],
  exports: [InboundReturnService],
})
export class InboundReturnModule {}
