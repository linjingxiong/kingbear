import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MaterialIssuance } from './schemas/material-issuance.schema';
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { ProductGroup } from '../product-group/schemas/product-group.schema';
import { CreateMaterialIssuanceDto } from './dto/create-material-issuance.dto';
import { UpdateMaterialIssuanceDto } from './dto/update-material-issuance.dto';

// findAll() 用 .lean() 拼接聚合结果，交给 TS 自动推断会因为引用到 mongodb 内部类型而报
// "inferred type cannot be named" / 超出可序列化长度，这里手动给个显式类型（跟 factory.service 同样的坑）
export interface MaterialIssuanceListItem {
  id: string;
  oemFactoryId: string;
  productGroupId: string;
  materialName: string;
  qty: number;
  issuedDate: Date;
  remark?: string;
  createdAt?: Date;
  updatedAt?: Date;
  oemFactoryName: string;
  productGroupName: string;
  unit: string;
}

@Injectable()
export class MaterialIssuanceService {
  constructor(
    @InjectModel(MaterialIssuance.name) private readonly issuanceModel: Model<MaterialIssuance>,
    @InjectModel(OemFactory.name) private readonly oemFactoryModel: Model<OemFactory>,
    @InjectModel(ProductGroup.name) private readonly productGroupModel: Model<ProductGroup>,
  ) {}

  create(dto: CreateMaterialIssuanceDto) {
    return this.issuanceModel.create(dto);
  }

  /** 列表带上代工厂/产品名称和物料单位——单位从对应产品的物料清单里查 */
  async findAll(): Promise<MaterialIssuanceListItem[]> {
    const list = await this.issuanceModel.find().sort({ issuedDate: -1, createdAt: -1 }).lean();
    const [oemFactories, productGroups] = await Promise.all([
      this.oemFactoryModel.find().lean(),
      this.productGroupModel.find().lean(),
    ]);
    const factoryNameMap = new Map(oemFactories.map((f) => [String(f._id), f.name]));
    const groupMap = new Map(productGroups.map((g) => [String(g._id), g]));

    return list.map(({ _id, __v, oemFactoryId, productGroupId, ...rest }) => {
      const group = groupMap.get(String(productGroupId));
      const unit = group?.materials?.find((m) => m.name === rest.materialName)?.unit ?? '';
      return {
        ...rest,
        id: String(_id),
        oemFactoryId: String(oemFactoryId),
        productGroupId: String(productGroupId),
        oemFactoryName: factoryNameMap.get(String(oemFactoryId)) ?? '未知代工厂',
        productGroupName: group?.name ?? '未知产品',
        unit,
      };
    });
  }

  async findOne(id: string) {
    const record = await this.issuanceModel.findById(id);
    if (!record) throw new NotFoundException('发料记录不存在');
    return record;
  }

  async update(id: string, dto: UpdateMaterialIssuanceDto) {
    const record = await this.issuanceModel.findByIdAndUpdate(id, dto, { new: true });
    if (!record) throw new NotFoundException('发料记录不存在');
    return record;
  }

  async remove(id: string) {
    const record = await this.issuanceModel.findByIdAndDelete(id);
    if (!record) throw new NotFoundException('发料记录不存在');
    return { success: true };
  }
}
