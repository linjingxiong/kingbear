import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProductGroup, ProductGroupSchema } from './schemas/product-group.schema';
import { ProductGroupService } from './product-group.service';
import { ProductGroupController } from './product-group.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: ProductGroup.name, schema: ProductGroupSchema }])],
  controllers: [ProductGroupController],
  providers: [ProductGroupService],
  exports: [ProductGroupService],
})
export class ProductGroupModule {}
