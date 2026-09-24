import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { DuplicateConflictResponse } from '@kingbear/shared';
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

  async create(dto: CreateCommonMaterialReturnDto) {
    if (!dto.force) {
      const { start, end } = dayRange(dto.returnedDate);
      const existing = await this.model.findOne({
        oemFactoryId: dto.oemFactoryId,
        commonMaterialName: dto.commonMaterialName.trim(),
        qty: dto.qty,
        returnedDate: { $gte: start, $lt: end },
      } as never);
      if (existing) {
        throw new ConflictException({
          message: `同一个代工厂、同一天、同样的物料「${dto.commonMaterialName}」、同样的数量，已经录过一条了，是不是重复录入了？`,
          duplicateType: 'item',
          conflictCodes: [existing.returnedDate.toISOString().slice(0, 10)],
        } satisfies DuplicateConflictResponse);
      }
    }
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

/** 某一天的 [00:00, 次日00:00) 区间，用于按天比对是不是"同一天"录入的——跟入库单查重同一个算法 */
function dayRange(dateStr: string) {
  const d = new Date(dateStr);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return { start, end };
}
