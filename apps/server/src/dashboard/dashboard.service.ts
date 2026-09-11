import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BillPaymentStatus, InboundStatus } from '@kingbear/shared';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { Factory } from '../factory/schemas/factory.schema';
import { Product } from '../product/schemas/product.schema';
import { ProductGroup } from '../product-group/schemas/product-group.schema';
import { MonthlyBillStatus } from '../billing/schemas/monthly-bill-status.schema';

/** 从 InboundRecord.items 里拆出来、金额已经按实时产品价格重算过的一行 */
interface LiveItem {
  factoryId: string | null;
  sku: string;
  name: string;
  qtyFinal: number;
  amount: number;
  /** 所属入库单的日期，格式 YYYY-MM-DD——按天分组统计（近7天产能）要用 */
  date: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
    @InjectModel(Factory.name) private readonly factoryModel: Model<Factory>,
    @InjectModel(Product.name) private readonly productModel: Model<Product>,
    @InjectModel(ProductGroup.name) private readonly productGroupModel: Model<ProductGroup>,
    @InjectModel(MonthlyBillStatus.name)
    private readonly billStatusModel: Model<MonthlyBillStatus>,
  ) {}

  async getOverview() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    // 近7天：含今天在内往前数7天，不是自然周（周一到周日），"7天内"这种说法平时都是
    // 指滚动窗口，跟自然周对不上的话每周一都会有一天数据"消失"，观感很奇怪
    const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const [todayRecords, weekRecords, monthRecords, allRecords] = await Promise.all([
      this.findCompleted(todayStart, todayEnd),
      this.findCompleted(weekStart, todayEnd),
      this.findCompleted(monthStart, monthEnd),
      // "关注货号"卡片要支持切到"所有"（不限时间的累计），不能只查某个区间
      this.inboundModel.find({ status: InboundStatus.Completed }),
    ]);
    // 首页这几块统计（今日/近7天/本月/累计/玩具厂排行/按货号明细/未收款）全都基于同一份
    // "已完成记录 + 实时产品价格"算出来的明细行，跟应收账单、入库管理列表用的是同一个
    // 口径，不会出现"首页说 8 万、账单说 9 万"这种同一个数字两个地方对不上的情况
    const [todayItems, weekItems, monthItems, allItems] = await Promise.all([
      this.withLivePrices(todayRecords),
      this.withLivePrices(weekRecords),
      this.withLivePrices(monthRecords),
      this.withLivePrices(allRecords),
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
        bySku: this.groupBySku(todayItems),
      },
      week: {
        processedQty: sumQty(weekItems),
        processedAmount: sumAmount(weekItems),
        inboundCount: weekRecords.length,
        daily: this.groupByDay(weekItems, weekStart),
        bySku: this.groupBySku(weekItems),
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
      allTimeBySku: this.groupBySku(allItems),
    };
  }

  /**
   * "产品加工情况"面板：按产品（工序的父级）汇总指定时间段内的加工数量/金额，
   * 展开能看到它下面每道工序自己的数字。dateFrom/dateTo 都不传就是不限时间（全部）。
   * 跟首页其它统计同一套"实时价格"口径。
   */
  async getProductRangeSummary(dateFrom?: string, dateTo?: string) {
    const filter: Record<string, unknown> = { status: InboundStatus.Completed };
    if (dateFrom || dateTo) {
      const range: Record<string, Date> = {};
      if (dateFrom) range.$gte = new Date(dateFrom);
      if (dateTo) {
        const end = new Date(dateTo);
        end.setDate(end.getDate() + 1); // dateTo 当天也要算进去，所以取到第二天凌晨为止（不含）
        range.$lt = end;
      }
      filter.inboundDate = range;
    }

    const records = await this.inboundModel.find(filter);
    const items = await this.withLivePrices(records);

    const [products, groups, factories] = await Promise.all([
      this.productModel.find().lean(),
      this.productGroupModel.find().lean(),
      this.factoryModel.find().lean(),
    ]);
    // sku 只在同一个玩具厂内唯一，查工序要用 factoryId+sku 一起做 key
    const productMap = new Map(products.map((p) => [`${p.factoryId}|${p.sku}`, p]));
    const groupMap = new Map(groups.map((g) => [String(g._id), g]));
    const factoryNameMap = new Map(factories.map((f) => [String(f._id), f.name]));

    type Bucket = {
      productGroupId: string;
      productGroupName: string;
      factoryName: string;
      qty: number;
      amount: number;
      steps: Map<string, { sku: string; name: string; qty: number; amount: number }>;
    };
    const buckets = new Map<string, Bucket>();

    for (const item of items) {
      const product = item.factoryId ? productMap.get(`${item.factoryId}|${item.sku}`) : undefined;
      const groupId = product?.productGroupId ? String(product.productGroupId) : null;
      const factoryName = item.factoryId ? (factoryNameMap.get(item.factoryId) ?? '未知玩具厂') : '未知玩具厂';
      // 没归到产品的工序，按玩具厂分开放进各自的"未归集"里，不同厂的未归集工序不混在一起
      const key = groupId ?? `unassigned:${item.factoryId ?? ''}`;

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          productGroupId: groupId ?? '',
          productGroupName: groupId ? (groupMap.get(groupId)?.name ?? '未知产品') : '未归集',
          factoryName,
          qty: 0,
          amount: 0,
          steps: new Map(),
        };
        buckets.set(key, bucket);
      }
      bucket.qty += item.qtyFinal;
      bucket.amount += item.amount;

      const step = bucket.steps.get(item.sku) ?? { sku: item.sku, name: item.name, qty: 0, amount: 0 };
      step.qty += item.qtyFinal;
      step.amount += item.amount;
      bucket.steps.set(item.sku, step);
    }

    const groupsResult = [...buckets.values()]
      .map((b) => ({
        productGroupId: b.productGroupId,
        productGroupName: b.productGroupName,
        factoryName: b.factoryName,
        qty: b.qty,
        amount: b.amount,
        steps: [...b.steps.values()].sort((a, c) => c.amount - a.amount),
      }))
      .sort((a, c) => c.amount - a.amount);

    return { groups: groupsResult };
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
      const date = formatDate(r.inboundDate);
      return r.items.map((item) => {
        const factoryPrice = priceMap?.get(item.sku) ?? item.factoryPrice;
        return {
          factoryId,
          sku: item.sku,
          name: item.name,
          qtyFinal: item.qtyFinal,
          amount: item.qtyFinal * factoryPrice,
          date,
        };
      });
    });
  }

  /** 近7天产能：按天把数量/金额加起来，凑不满7天的日子补0，不是缺项，前端画趋势要用连续的7条 */
  private groupByDay(weekItems: LiveItem[], weekStart: Date) {
    const byDate = new Map<string, { qty: number; amount: number }>();
    for (const item of weekItems) {
      const bucket = byDate.get(item.date) ?? { qty: 0, amount: 0 };
      bucket.qty += item.qtyFinal;
      bucket.amount += item.amount;
      byDate.set(item.date, bucket);
    }

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i);
      const date = formatDate(d);
      const bucket = byDate.get(date);
      return { date, qty: bucket?.qty ?? 0, amount: bucket?.amount ?? 0 };
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
   * "加工数量"这个总数不同货号加在一起没有意义（见 billing.service 里同样的原则），
   * 首页只放一个笼统的数字容易让人误会。这里按货号拆开算，前端展开明细表，
   * 才是真正能看的"详情"。本月、近7天两处统计都是同一套口径，共用这一个方法。
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

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sumQty(items: LiveItem[]) {
  return items.reduce((sum, i) => sum + i.qtyFinal, 0);
}

function sumAmount(items: LiveItem[]) {
  return items.reduce((sum, i) => sum + i.amount, 0);
}
