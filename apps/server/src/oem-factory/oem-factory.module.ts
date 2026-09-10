import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { OemFactory, OemFactorySchema } from './schemas/oem-factory.schema';
import { OemFactoryService } from './oem-factory.service';
import { OemFactoryController } from './oem-factory.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: OemFactory.name, schema: OemFactorySchema }])],
  controllers: [OemFactoryController],
  providers: [OemFactoryService],
  exports: [OemFactoryService],
})
export class OemFactoryModule {}
