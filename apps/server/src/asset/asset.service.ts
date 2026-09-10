import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Asset } from './schemas/asset.schema';
import { CreateAssetDto } from './dto/create-asset.dto';
import { UpdateAssetDto } from './dto/update-asset.dto';

@Injectable()
export class AssetService {
  constructor(@InjectModel(Asset.name) private readonly assetModel: Model<Asset>) {}

  create(dto: CreateAssetDto) {
    return this.assetModel.create(dto);
  }

  /** 按领用时间倒序——最近领用的排前面，盘点时最想先看到的是最近发生了什么变化 */
  findAll() {
    return this.assetModel.find().sort({ checkoutDate: -1, createdAt: -1 });
  }

  async findOne(id: string) {
    const asset = await this.assetModel.findById(id);
    if (!asset) throw new NotFoundException('资产记录不存在');
    return asset;
  }

  async update(id: string, dto: UpdateAssetDto) {
    const asset = await this.assetModel.findByIdAndUpdate(id, dto, { new: true });
    if (!asset) throw new NotFoundException('资产记录不存在');
    return asset;
  }

  async remove(id: string) {
    const asset = await this.assetModel.findByIdAndDelete(id);
    if (!asset) throw new NotFoundException('资产记录不存在');
    return { success: true };
  }
}
