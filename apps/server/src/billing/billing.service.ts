import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillPaymentStatus, InboundStatus } from '@kingbear/shared';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { InboundReturn } from '../inbound-return/schemas/inbound-return.schema';
import { MonthlyBillStatus } from './schemas/monthly-bill-status.schema';
import { Factory } from '../factory/schemas/factory.schema';
import { Product } from '../product/schemas/product.schema';
import { BillingQueryDto } from './dto/billing-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
    @InjectModel(InboundReturn.name) private readonly inboundReturnModel: Model<InboundReturn>,
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
    const [records, returns] = await Promise.all([
      this.inboundModel
        .find({
          factoryId: new Types.ObjectId(factoryId),
          status: InboundStatus.Completed,
          inboundDate: { $gte: start, $lt: end },
        })
        .sort({ inboundDate: 1 }),
      // 退货是入库确认之后才发现问题、单独补录的一条记录，不影响原来那条入库单，
      // 这里查出来跟入库明细放一起对账："入库合计 - 退货合计"。
      // 注意：InboundReturn.factoryId 实际存的是字符串（跟 Product.factoryId 是同一个
      // 历史遗留特点，不是 ObjectId），这里不能像上面 inboundModel 那样包一层
      // new Types.ObjectId(...)，包了就永远查不出来——之前刚踩过这个坑
      this.inboundReturnModel
        .find({
          factoryId,
          returnDate: { $gte: start, $lt: end },
        })
        .sort({ returnDate: 1 }),
    ]);

    // 工厂价不用入库/退货时存死的快照，改成实时查产品档案当前的价格——改了产品价格，
    // 这个玩具厂这个月所有账单（不管是否已标记收款）都跟着用新价重新算金额
    const skus = [
      ...new Set([...records.flatMap((r) => r.items.map((item) => item.sku)), ...returns.map((r) => r.sku)]),
    ];
    const products = await this.productModel.find({ factoryId, sku: { $in: skus } });
    const priceBySku = new Map(products.map((p) => [p.sku, p.factoryPrice]));

    const inboundDetails = records.flatMap((r) =>
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

    // 退货行 qty/amount 存成负数，跟入库行放进同一个 details 数组，求和/按货号分组
    // 就自动是净数——不用另外维护一套"扣减"逻辑
    const returnDetails = returns.map((r) => {
      const factoryPrice = priceBySku.get(r.sku) ?? r.factoryPrice;
      return {
        date: r.returnDate.toISOString().slice(0, 10),
        sku: r.sku,
        name: r.name,
        weightJin: r.weightJin,
        unitWeightG: r.unitWeightG,
        qty: -r.qty,
        factoryPrice,
        amount: -(r.qty * factoryPrice),
        imageUrl: r.images[0] ?? '',
        rotation: r.rotation,
        isReturn: true,
        reason: r.reason,
      };
    });

    const details = [...inboundDetails, ...returnDetails].sort((a, b) => a.date.localeCompare(b.date));

    const totalQty = details.reduce((sum, d) => sum + d.qty, 0);
    const totalAmount = details.reduce((sum, d) => sum + d.amount, 0);
    const returnQty = returnDetails.reduce((sum, d) => sum + -d.qty, 0);
    const returnAmount = returnDetails.reduce((sum, d) => sum + -d.amount, 0);
    const bySku = groupBySku(details);

    const billStatus = await this.billStatusModel.findOne({ factoryId, yearMonth });

    return {
      factoryId,
      factoryName: factory.name,
      yearMonth,
      inboundCount: records.length,
      totalQty,
      totalAmount,
      returnQty,
      returnAmount,
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
