import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CommonMaterialReturn } from './schemas/common-material-return.schema';
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { CommonMaterial } from '../common-material/schemas/common-material.schema';
import { CreateCommonMaterialReturnDto } from './dto/create-common-material-return.dto';
import { UpdateCommonMaterialReturnDto } from './dto/update-common-material-return.dto';

export interface CommonMaterialReturnListItem {
  id: string;
  oemFactoryId: string;
  commonMaterialName: string;
  qty: number;
  returnedDate: Date;
  remark?: string;
  createdAt?: Date;
  updatedAt?: Date;
  oemFactoryName: string;
  unit: string;
}

@Injectable()
export class CommonMaterialReturnService {
  constructor(
    @InjectModel(CommonMaterialReturn.name) private readonly model: Model<CommonMaterialReturn>,
    @InjectModel(OemFactory.name) private readonly oemFactoryModel: Model<OemFactory>,
    @InjectModel(CommonMaterial.name) private readonly commonMaterialModel: Model<CommonMaterial>,
  ) {}

  create(dto: CreateCommonMaterialReturnDto) {
    return this.model.create(dto);
  }

  async findAll(): Promise<CommonMaterialReturnListItem[]> {
    const list = await this.model.find().sort({ returnedDate: -1, createdAt: -1 }).lean();
    const [oemFactories, commonMaterials] = await Promise.all([
      this.oemFactoryModel.find().lean(),
      this.commonMaterialModel.find().lean(),
    ]);
    const factoryNameMap = new Map(oemFactories.map((f) => [String(f._id), f.name]));
    const unitMap = new Map(commonMaterials.map((m) => [m.name, m.unit]));

    return list.map(({ _id, __v, oemFactoryId, ...rest }) => ({
      ...rest,
      id: String(_id),
      oemFactoryId: String(oemFactoryId),
      oemFactoryName: factoryNameMap.get(String(oemFactoryId)) ?? '未知代工厂',
      unit: unitMap.get(rest.commonMaterialName) ?? '',
    }));
  }

  async update(id: string, dto: UpdateCommonMaterialReturnDto) {
    const doc = await this.model.findByIdAndUpdate(id, dto, { new: true });
    if (!doc) throw new NotFoundException('回收记录不存在');
    return doc;
  }

  async remove(id: string) {
    const doc = await this.model.findByIdAndDelete(id);
    if (!doc) throw new NotFoundException('回收记录不存在');
    return { success: true };
  }
}
