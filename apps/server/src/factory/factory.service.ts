import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InboundStatus } from '@kingbear/shared';
import { Factory } from './schemas/factory.schema';
import { Product } from '../product/schemas/product.schema';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { CreateFactoryDto } from './dto/create-factory.dto';
import { UpdateFactoryDto } from './dto/update-factory.dto';

// findAll() 用 .lean() 拼接聚合结果，交给 TS 自动推断会因为引用到 mongodb 内部类型而报
// "inferred type cannot be named" / 超出可序列化长度，这里手动给个显式类型
export interface FactoryWithStats {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  address?: string;
  remark?: string;
  createdAt?: Date;
  updatedAt?: Date;
  productCount: number;
  processedAmount: number;
}

@Injectable()
export class FactoryService {
  constructor(
    @InjectModel(Factory.name) private readonly factoryModel: Model<Factory>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
  ) {}

  create(dto: CreateFactoryDto) {
    return this.factoryModel.create(dto);
  }

  /** 列表：附带产品数量、累计加工金额（供概览用，非分页大表） */
  async findAll(): Promise<FactoryWithStats[]> {
    const factories = await this.factoryModel.find().sort({ createdAt: -1 }).lean();

    const [productCounts, amountSums] = await Promise.all([
      this.productModel.aggregate([
        { $group: { _id: '$factoryId', count: { $sum: 1 } } },
      ]),
      this.inboundModel.aggregate([
        { $match: { status: InboundStatus.Completed } },
        { $unwind: '$items' },
        { $group: { _id: '$factoryId', amount: { $sum: '$items.amount' } } },
      ]),
    ]);

    const countMap = new Map(productCounts.map((c) => [String(c._id), c.count]));
    const amountMap = new Map(amountSums.map((a) => [String(a._id), a.amount]));

    // .lean() 拿到的是纯对象，不会走 schema 的 toJSON 转换（那个只把 _id 转成 id 用来给前端），
    // 这里手动补一下，不然这个列表接口会漏出 _id 而不是 id
    return factories.map(({ _id, __v, ...rest }) => ({
      ...rest,
      id: String(_id),
      productCount: countMap.get(String(_id)) ?? 0,
      processedAmount: amountMap.get(String(_id)) ?? 0,
    }));
  }

  async findOne(id: string) {
    const factory = await this.factoryModel.findById(id);
    if (!factory) throw new NotFoundException('玩具厂不存在');
    return factory;
  }

  async update(id: string, dto: UpdateFactoryDto) {
    const factory = await this.factoryModel.findByIdAndUpdate(id, dto, { new: true });
    if (!factory) throw new NotFoundException('玩具厂不存在');
    return factory;
  }

  async remove(id: string) {
    const factory = await this.factoryModel.findByIdAndDelete(id);
    if (!factory) throw new NotFoundException('玩具厂不存在');
    return { success: true };
  }

  /** 供 inbound 模块做模糊匹配（OCR 识别到的玩具厂名称 → 已有玩具厂） */
  async findByFuzzyName(name: string) {
    return this.factoryModel.findOne({ name: new RegExp(escapeRegExp(name), 'i') });
  }

  async exists(id: string) {
    return this.factoryModel.exists({ _id: new Types.ObjectId(id) });
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
