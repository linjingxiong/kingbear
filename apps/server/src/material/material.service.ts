import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Material } from './schemas/material.schema';
import { CreateMaterialDto } from './dto/create-material.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';

@Injectable()
export class MaterialService {
  constructor(@InjectModel(Material.name) private readonly materialModel: Model<Material>) {}

  create(dto: CreateMaterialDto) {
    return this.materialModel.create(dto);
  }

  findAll() {
    return this.materialModel.find().sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const material = await this.materialModel.findById(id);
    if (!material) throw new NotFoundException('物料不存在');
    return material;
  }

  async update(id: string, dto: UpdateMaterialDto) {
    const material = await this.materialModel.findByIdAndUpdate(id, dto, { new: true });
    if (!material) throw new NotFoundException('物料不存在');
    return material;
  }

  async remove(id: string) {
    const material = await this.materialModel.findByIdAndDelete(id);
    if (!material) throw new NotFoundException('物料不存在');
    return { success: true };
  }
}
