import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CommonMaterialReturn, CommonMaterialReturnSchema } from './schemas/common-material-return.schema';
import { OemFactory, OemFactorySchema } from '../oem-factory/schemas/oem-factory.schema';
import { CommonMaterial, CommonMaterialSchema } from '../common-material/schemas/common-material.schema';
import { CommonMaterialReturnService } from './common-material-return.service';
import { CommonMaterialReturnController } from './common-material-return.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: CommonMaterialReturn.name, schema: CommonMaterialReturnSchema },
      { name: OemFactory.name, schema: OemFactorySchema },
      { name: CommonMaterial.name, schema: CommonMaterialSchema },
    ]),
  ],
  controllers: [CommonMaterialReturnController],
  providers: [CommonMaterialReturnService],
  exports: [CommonMaterialReturnService],
})
export class CommonMaterialReturnModule {}
