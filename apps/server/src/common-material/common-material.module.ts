import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonMaterial, CommonMaterialSchema } from './schemas/common-material.schema';
import { CommonMaterialService } from './common-material.service';
import { CommonMaterialController } from './common-material.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: CommonMaterial.name, schema: CommonMaterialSchema }])],
  controllers: [CommonMaterialController],
  providers: [CommonMaterialService],
  exports: [CommonMaterialService],
})
export class CommonMaterialModule {}
