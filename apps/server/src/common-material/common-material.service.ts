import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommonMaterial } from './schemas/common-material.schema';
import { CreateCommonMaterialDto } from './dto/create-common-material.dto';
import { UpdateCommonMaterialDto } from './dto/update-common-material.dto';

@Injectable()
export class CommonMaterialService {
  constructor(@InjectModel(CommonMaterial.name) private readonly model: Model<CommonMaterial>) {}

  create(dto: CreateCommonMaterialDto) {
    return this.model.create(dto);
  }

  findAll() {
    return this.model.find().sort({ createdAt: -1 });
  }

  async update(id: string, dto: UpdateCommonMaterialDto) {
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true });
    if (!doc) throw new NotFoundException('通用物料不存在');
    return doc;
  }

  async remove(id: string) {
    const doc = await this.model.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('通用物料不存在');
    return { success: true };
  }
}
