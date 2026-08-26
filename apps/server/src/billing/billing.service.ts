import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillPaymentStatus, InboundStatus } from '@kingbear/shared';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { MonthlyBillStatus } from './schemas/monthly-bill-status.schema';
import { Factory } from '../factory/schemas/factory.schema';
import { Product } from '../product/schemas/product.schema';
import { BillingQueryDto } from './dto/billing-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
    @InjectModel(MonthlyBillStatus.name)
    private readonly billStatusModel: Model<MonthlyBillStatus>,
    @InjectModel(Factory.name) private readonly factoryModel: Model<Factory>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
  ) {}

  /** 实时聚合计算，不读取任何"账单"实体（收款状态除外） */
  async getSummary({ factoryId, yearMonth }: BillingQueryDto) {
    const factory = await this.factoryModel.findById(factoryId);
    if (!factory) throw new NotFoundException('玩具厂不存在');

    const { start, end } = monthRange(yearMonth);
    const records = await this.inboundModel
      .find({
        factoryId: new Types.ObjectId(factoryId),
        status: InboundStatus.Completed,
        inboundDate: { $gte: start, $lt: end },
      })
      .sort({ inboundDate: 1 });

    // 工厂价不用入库时存死的快照，改成实时查产品档案当前的价格——改了产品价格，
    // 这个玩具厂这个月所有账单（不管是否已标记收款）都跟着用新价重新算金额
    const skus = [...new Set(records.flatMap((r) => r.items.map((item) => item.sku)))];
    const products = await this.productModel.find({ factoryId, sku: { $in: skus } });
    const priceBySku = new Map(products.map((p) => [p.sku, p.factoryPrice]));

    const details = records.flatMap((r) =>
      r.items.map((item) => {
        const factoryPrice = priceBySku.get(item.sku) ?? item.factoryPrice;
        return {
          date: r.inboundDate.toISOString().slice(0, 10),
          sku: item.sku,
          name: item.name,
          weightJin: item.weightJin,
          unitWeightG: item.unitWeightG,
          qty: item.qtyFinal,
          factoryPrice,
          amount: item.qtyFinal * factoryPrice,
          imageUrl: r.imageUrl,
          rotation: r.rotation,
        };
      }),
    );

    const totalQty = details.reduce((sum, d) => sum + d.qty, 0);
    const totalAmount = details.reduce((sum, d) => sum + d.amount, 0);
    const bySku = groupBySku(details);

    const billStatus = await this.billStatusModel.findOne({ factoryId, yearMonth });

    return {
      factoryId,
      factoryName: factory.name,
      yearMonth,
      inboundCount: records.length,
      totalQty,
      totalAmount,
      status: billStatus?.status ?? BillPaymentStatus.Unpaid,
      bySku,
      details,
    };
  }

  async updatePaymentStatus(dto: UpdatePaymentStatusDto) {
    return this.billStatusModel.findOneAndUpdate(
      { factoryId: dto.factoryId, yearMonth: dto.yearMonth },
      { status: dto.status },
      { upsert: true, new: true },
    );
  }
}

/**
 * 一单里经常好几个不同货号，直接把明细加总成一个总数意义不大。
 * 这里按货号分组算各自的合计，前端"总的"和"单独看某个货号"都从这一份数据来。
 */
function groupBySku(
  details: Array<{ sku: string; name: string; qty: number; amount: number }>,
) {
  const map = new Map<string, { sku: string; name: string; qty: number; amount: number }>();
  for (const d of details) {
    const existing = map.get(d.sku);
    if (existing) {
      existing.qty += d.qty;
      existing.amount += d.amount;
    } else {
      map.set(d.sku, { sku: d.sku, name: d.name, qty: d.qty, amount: d.amount });
    }
  }
  return [...map.values()];
}

function monthRange(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}
