import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MaterialIssuance } from './schemas/material-issuance.schema';
import { OemFactory } from '../oem-factory/schemas/oem-factory.schema';
import { ProductGroup } from '../product-group/schemas/product-group.schema';
import { CommonMaterial } from '../common-material/schemas/common-material.schema';
import { CreateMaterialIssuanceDto } from './dto/create-material-issuance.dto';
import { UpdateMaterialIssuanceDto } from './dto/update-material-issuance.dto';

export interface MaterialIssuanceListItem {
  id: string;
  oemFactoryId: string;
  productGroupId?: string;
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
    @InjectModel(CommonMaterial.name) private readonly commonMaterialModel: Model<CommonMaterial>,
  ) {}

  create(dto: CreateMaterialIssuanceDto) {
    return this.issuanceModel.create(dto);
  }

  /**
   * 列表带上代工厂/产品名称和物料单位。
   * - 产品物料：单位从对应产品的物料清单里查，产品名显示产品名
   * - 通用物料（productGroupId 为空）：单位从通用物料目录查，产品名显示"通用物料"
   */
  async findAll(): Promise<MaterialIssuanceListItem[]> {
    const list = await this.issuanceModel.find().sort({ issuedDate: -1, createdAt: -1 }).lean();
    const [oemFactories, productGroups, commonMaterials] = await Promise.all([
      this.oemFactoryModel.find().lean(),
      this.productGroupModel.find().lean(),
      this.commonMaterialModel.find().lean(),
    ]);
    const factoryNameMap = new Map(oemFactories.map((f) => [String(f._id), f.name]));
    const groupMap = new Map(productGroups.map((g) => [String(g._id), g]));
    const commonUnitMap = new Map(commonMaterials.map((m) => [m.name, m.unit]));

    return list.map(({ _id, __v, oemFactoryId, productGroupId, ...rest }) => {
      const gid = productGroupId ? String(productGroupId) : undefined;
      const group = gid ? groupMap.get(gid) : undefined;
      const unit = gid
        ? (group?.materials?.find((m) => m.name === rest.materialName)?.unit ?? '')
        : (commonUnitMap.get(rest.materialName) ?? '');
      return {
        ...rest,
        id: String(_id),
        oemFactoryId: String(oemFactoryId),
        productGroupId: gid,
        oemFactoryName: factoryNameMap.get(String(oemFactoryId)) ?? '未知代工厂',
        productGroupName: gid ? (group?.name ?? '未知产品') : '通用物料',
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
