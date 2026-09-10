import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { OemFactory } from './schemas/oem-factory.schema';
import { CreateOemFactoryDto } from './dto/create-oem-factory.dto';
import { UpdateOemFactoryDto } from './dto/update-oem-factory.dto';

@Injectable()
export class OemFactoryService {
  constructor(@InjectModel(OemFactory.name) private readonly oemFactoryModel: Model<OemFactory>) {}

  create(dto: CreateOemFactoryDto) {
    return this.oemFactoryModel.create(dto);
  }

  findAll() {
    return this.oemFactoryModel.find().sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const oemFactory = await this.oemFactoryModel.findById(id);
    if (!oemFactory) throw new NotFoundException('代工厂不存在');
    return oemFactory;
  }

  async update(id: string, dto: UpdateOemFactoryDto) {
    const oemFactory = await this.oemFactoryModel.findByIdAndUpdate(id, dto, { new: true });
    if (!oemFactory) throw new NotFoundException('代工厂不存在');
    return oemFactory;
  }

  async remove(id: string) {
    const oemFactory = await this.oemFactoryModel.findByIdAndDelete(id);
    if (!oemFactory) throw new NotFoundException('代工厂不存在');
    return { success: true };
  }
}
