import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OemReceipt, OemReceiptSchema } from './schemas/oem-receipt.schema';
import { OemFactory, OemFactorySchema } from '../oem-factory/schemas/oem-factory.schema';
import { Product, ProductSchema } from '../product/schemas/product.schema';
import { OcrModule } from '../ocr/ocr.module';
import { OemReceiptService } from './oem-receipt.service';
import { OemReceiptController } from './oem-receipt.controller';

@Module({
  imports: [
    OcrModule,
    MongooseModule.forFeature([
      { name: OemReceipt.name, schema: OemReceiptSchema },
      { name: OemFactory.name, schema: OemFactorySchema },
      { name: Product.name, schema: ProductSchema },
    ]),
  ],
  controllers: [OemReceiptController],
  providers: [OemReceiptService],
  exports: [OemReceiptService],
})
export class OemReceiptModule {}
