import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BillPaymentStatus, InboundStatus } from '@kingbear/shared';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { Factory } from '../factory/schemas/factory.schema';
import { Product } from '../product/schemas/product.schema';
import { MonthlyBillStatus } from '../billing/schemas/monthly-bill-status.schema';

/** 从 InboundRecord.items 里拆出来、金额已经按实时产品价格重算过的一行 */
interface LiveItem {
  factoryId: string | null;
  sku: string;
  name: string;
  qtyFinal: number;
  amount: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
    @InjectModel(Factory.name) private readonly factoryModel: Model<Factory>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(MonthlyBillStatus.name)
    private readonly billStatusModel: Model<MonthlyBillStatus>,
  ) {}

  async getOverview() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [todayRecords, monthRecords] = await Promise.all([
      this.findCompleted(todayStart, todayEnd),
      this.findCompleted(monthStart, monthEnd),
    ]);
    // 首页这几块统计（今日/本月/玩具厂排行/按货号明细/未收款）全都基于同一份"本月已完成
    // 记录 + 实时产品价格"算出来的明细行，跟应收账单、入库管理列表用的是同一个口径，
    // 不会出现"首页说 8 万、账单说 9 万"这种同一个数字两个地方对不上的情况
    const [todayItems, monthItems] = await Promise.all([
      this.withLivePrices(todayRecords),
      this.withLivePrices(monthRecords),
    ]);

    const [ranking, alerts, unpaidAmount] = await Promise.all([
      this.getFactoryRanking(monthItems),
      this.getAlerts(yearMonth),
      this.getUnpaidAmount(yearMonth, monthItems),
    ]);

    return {
      today: {
        inboundCount: todayRecords.length,
        processedQty: sumQty(todayItems),
        processedAmount: sumAmount(todayItems),
      },
      month: {
        processedAmount: sumAmount(monthItems),
        inboundCount: monthRecords.length,
        processedQty: sumQty(monthItems),
        unpaidAmount,
      },
      ranking,
      alerts,
      monthBySku: this.groupBySku(monthItems),
    };
  }

  private findCompleted(start: Date, end: Date) {
    return this.inboundModel.find({
      status: InboundStatus.Completed,
      inboundDate: { $gte: start, $lt: end },
    });
  }

  /** 工厂价不用入库确认时存死的快照，改成实时读产品档案当前的价格——跟 billing.service /
   * inbound.service 的 findAll 是同一份逻辑，三处口径必须一致 */
  private async withLivePrices(records: InboundRecord[]): Promise<LiveItem[]> {
    const factoryIds = [...new Set(records.map((r) => r.factoryId).filter(Boolean).map(String))];
    const priceMaps = new Map<string, Map<string, number>>();
    await Promise.all(
      factoryIds.map(async (factoryId) => {
        const products = await this.productModel.find({ factoryId });
        priceMaps.set(factoryId, new Map(products.map((p) => [p.sku, p.factoryPrice])));
      }),
    );

    return records.flatMap((r) => {
      const factoryId = r.factoryId ? String(r.factoryId) : null;
      const priceMap = factoryId ? priceMaps.get(factoryId) : undefined;
      return r.items.map((item) => {
        const factoryPrice = priceMap?.get(item.sku) ?? item.factoryPrice;
        return {
          factoryId,
          sku: item.sku,
          name: item.name,
          qtyFinal: item.qtyFinal,
          amount: item.qtyFinal * factoryPrice,
        };
      });
    });
  }

  private async getFactoryRanking(monthItems: LiveItem[]) {
    const amountByFactory = new Map<string, number>();
    for (const item of monthItems) {
      if (!item.factoryId) continue;
      amountByFactory.set(item.factoryId, (amountByFactory.get(item.factoryId) ?? 0) + item.amount);
    }

    const factories = await this.factoryModel.find({ _id: { $in: [...amountByFactory.keys()] } });
    const nameMap = new Map(factories.map((f) => [String(f._id), f.name]));

    return [...amountByFactory.entries()]
      .map(([factoryId, monthAmount]) => ({
        factoryId,
        factoryName: nameMap.get(factoryId) ?? '未知玩具厂',
        monthAmount,
      }))
      .sort((a, b) => b.monthAmount - a.monthAmount);
  }

  /**
   * "本月加工数量"这个总数不同货号加在一起没有意义（见 billing.service 里同样的原则），
   * 首页只放一个笼统的数字容易让人误会。这里按货号拆开算，前端展开明细表，
   * 才是真正能看的"详情"。
   */
  private groupBySku(monthItems: LiveItem[]) {
    const map = new Map<string, { sku: string; name: string; qty: number; amount: number }>();
    for (const item of monthItems) {
      const existing = map.get(item.sku);
      if (existing) {
        existing.qty += item.qtyFinal;
        existing.amount += item.amount;
      } else {
        map.set(item.sku, { sku: item.sku, name: item.name, qty: item.qtyFinal, amount: item.amount });
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }

  private async getAlerts(yearMonth: string) {
    const [pendingConfirmCount, quantityDiffCount, unpaidBillCount] = await Promise.all([
      this.inboundModel.countDocuments({ status: InboundStatus.PendingConfirm }),
      this.inboundModel.countDocuments({
        status: { $in: [InboundStatus.PendingConfirm, InboundStatus.Completed] },
        'items.hasQuantityDiff': true,
      }),
      this.billStatusModel.countDocuments({ yearMonth, status: BillPaymentStatus.Unpaid }),
    ]);
    return { pendingConfirmCount, quantityDiffCount, unpaidBillCount };
  }

  /**
   * 未收款金额 = 本月加工金额中，收款状态不是"已收款"的部分。
   * 没有 monthlyBillStatus 记录的玩具厂，默认视为"未收款"（和 billing.service 的默认值保持一致）。
   */
  private async getUnpaidAmount(yearMonth: string, monthItems: LiveItem[]) {
    const amountByFactory = new Map<string, number>();
    for (const item of monthItems) {
      if (!item.factoryId) continue;
      amountByFactory.set(item.factoryId, (amountByFactory.get(item.factoryId) ?? 0) + item.amount);
    }
    if (!amountByFactory.size) return 0;

    const paidFactoryIds = new Set(
      (await this.billStatusModel.find({ yearMonth, status: BillPaymentStatus.Paid })).map((s) =>
        String(s.factoryId),
      ),
    );

    return [...amountByFactory.entries()]
      .filter(([factoryId]) => !paidFactoryIds.has(factoryId))
      .reduce((sum, [, amount]) => sum + amount, 0);
  }
}

function sumQty(items: LiveItem[]) {
  return items.reduce((sum, i) => sum + i.qtyFinal, 0);
}

function sumAmount(items: LiveItem[]) {
  return items.reduce((sum, i) => sum + i.amount, 0);
}
