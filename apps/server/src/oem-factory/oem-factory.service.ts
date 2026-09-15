import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ContactablePartyCrudService } from '../common/services/contactable-party-crud.service';
import { OemFactory } from './schemas/oem-factory.schema';

@Injectable()
export class OemFactoryService extends ContactablePartyCrudService<OemFactory> {
  protected readonly notFoundMessage = '代工厂不存在';

  constructor(@InjectModel(OemFactory.name) oemFactoryModel: Model<OemFactory>) {
    super(oemFactoryModel);
  }

  findAll() {
    return this.model.find().sort({ createdAt: -1 });
  }
}
