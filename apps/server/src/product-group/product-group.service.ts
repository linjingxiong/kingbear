import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ProductGroup } from './schemas/product-group.schema';
import { CreateProductGroupDto } from './dto/create-product-group.dto';
import { UpdateProductGroupDto } from './dto/update-product-group.dto';

@Injectable()
export class ProductGroupService {
  constructor(@InjectModel(ProductGroup.name) private readonly productGroupModel: Model<ProductGroup>) {}

  create(dto: CreateProductGroupDto) {
    return this.productGroupModel.create(dto);
  }

  findByFactory(factoryId: string) {
    return this.productGroupModel.find({ factoryId }).sort({ createdAt: -1 });
  }

  async findOne(id: string) {
    const group = await this.productGroupModel.findById(id);
    if (!group) throw new NotFoundException('产品不存在');
    return group;
  }

  async update(id: string, dto: UpdateProductGroupDto) {
    const group = await this.productGroupModel.findByIdAndUpdate(id, dto, { new: true });
    if (!group) throw new NotFoundException('产品不存在');
    return group;
  }

  async remove(id: string) {
    const group = await this.productGroupModel.findByIdAndDelete(id);
    if (!group) throw new NotFoundException('产品不存在');
    return { success: true };
  }
}
