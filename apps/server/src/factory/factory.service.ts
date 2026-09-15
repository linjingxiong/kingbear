import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { InboundStatus } from '@kingbear/shared';
import { ContactablePartyCrudService } from '../common/services/contactable-party-crud.service';
import { Factory } from './schemas/factory.schema';
import { Product } from '../product/schemas/product.schema';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';

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

// create/findOne/update/remove 这几个基础 CRUD 交给 ContactablePartyCrudService
// （代工厂 OemFactoryService 也是继承同一个基类），这里只保留 Factory 自己独有的：
// 带统计信息的 findAll、OCR 玩具厂名模糊匹配、exists 判断
@Injectable()
export class FactoryService extends ContactablePartyCrudService<Factory> {
  protected readonly notFoundMessage = '玩具厂不存在';

  constructor(
    @InjectModel(Factory.name) factoryModel: Model<Factory>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
  ) {
    super(factoryModel);
  }

  /** 列表：附带产品数量、累计加工金额（供概览用，非分页大表） */
  async findAll(): Promise<FactoryWithStats[]> {
    const factories = await this.model.find().sort({ createdAt: -1 }).lean();

    const [productCounts, amountMap] = await Promise.all([
      this.productModel.aggregate([
        { $group: { _id: '$factoryId', count: { $sum: 1 } } },
      ]),
      this.getAmountByFactory(),
    ]);

    const countMap = new Map(productCounts.map((c) => [String(c._id), c.count]));

    // .lean() 拿到的是纯对象，不会走 schema 的 toJSON 转换（那个只把 _id 转成 id 用来给前端），
    // 这里手动补一下，不然这个列表接口会漏出 _id 而不是 id
    return factories.map(({ _id, __v, ...rest }) => ({
      ...rest,
      id: String(_id),
      productCount: countMap.get(String(_id)) ?? 0,
      processedAmount: amountMap.get(String(_id)) ?? 0,
    }));
  }

  /**
   * 累计加工金额不用入库确认时存死的工厂价快照，改成实时读产品档案当前的价格——
   * 跟 billing.service / inbound.service / dashboard.service 是同一份逻辑，四处口径
   * 必须一致，不然会出现"玩具厂列表说 8 万、应收账单说 9 万"这种同一个数字对不上的情况。
   */
  private async getAmountByFactory(): Promise<Map<string, number>> {
    const records = await this.inboundModel.find({ status: InboundStatus.Completed });

    const factoryIds = [...new Set(records.map((r) => r.factoryId).filter(Boolean).map(String))];
    const priceMaps = new Map<string, Map<string, number>>();
    await Promise.all(
      factoryIds.map(async (factoryId) => {
        const products = await this.productModel.find({ factoryId });
        priceMaps.set(factoryId, new Map(products.map((p) => [p.sku, p.factoryPrice])));
      }),
    );

    const amountMap = new Map<string, number>();
    for (const record of records) {
      if (!record.factoryId) continue;
      const factoryId = String(record.factoryId);
      const priceMap = priceMaps.get(factoryId);
      const recordAmount = record.items.reduce((sum, item) => {
        const factoryPrice = priceMap?.get(item.sku) ?? item.factoryPrice;
        return sum + item.qtyFinal * factoryPrice;
      }, 0);
      amountMap.set(factoryId, (amountMap.get(factoryId) ?? 0) + recordAmount);
    }
    return amountMap;
  }

  /** 供 inbound 模块做模糊匹配（OCR 识别到的玩具厂名称 → 已有玩具厂） */
  async findByFuzzyName(name: string) {
    return this.model.findOne({ name: new RegExp(escapeRegExp(name), 'i') });
  }

  async exists(id: string) {
    return this.model.exists({ _id: new Types.ObjectId(id) });
  }
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
