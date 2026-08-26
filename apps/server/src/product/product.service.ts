import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Product } from './schemas/product.schema';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@Injectable()
export class ProductService {
  constructor(@InjectModel(Product.name) private readonly productModel: Model<Product>) {}

  create(dto: CreateProductDto) {
    return this.productModel.create(dto);
  }

  findByFactory(factoryId: string) {
    return this.productModel.find({ factoryId }).sort({ createdAt: -1 });
  }

  /**
   * 不限玩具厂，全量按货号查。用于入库确认页：OCR 只认出了货号、没认出玩具厂时，
   * 拿货号反查产品库，猜出这个货号属于哪个玩具厂。
   */
  findBySku(sku: string) {
    return this.productModel.find({ sku });
  }

  async findOne(id: string) {
    const product = await this.productModel.findById(id);
    if (!product) throw new NotFoundException('产品不存在');
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    const product = await this.productModel.findByIdAndUpdate(id, dto, { new: true });
    if (!product) throw new NotFoundException('产品不存在');
    return product;
  }

  async remove(id: string) {
    const product = await this.productModel.findByIdAndDelete(id);
    if (!product) throw new NotFoundException('产品不存在');
    return { success: true };
  }
}
