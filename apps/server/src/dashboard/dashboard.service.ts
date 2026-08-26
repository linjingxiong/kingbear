import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BillPaymentStatus, InboundStatus } from '@kingbear/shared';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { Factory } from '../factory/schemas/factory.schema';
import { MonthlyBillStatus } from '../billing/schemas/monthly-bill-status.schema';

@Injectable()
export class DashboardService {
  constructor(
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
    @InjectModel(Factory.name) private readonly factoryModel: Model<Factory>,
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

    const [today, month, ranking, alerts, monthBySku] = await Promise.all([
      this.aggregateRange(todayStart, todayEnd),
      this.aggregateRange(monthStart, monthEnd),
      this.getFactoryRanking(monthStart, monthEnd),
      this.getAlerts(yearMonth),
      this.getMonthBySku(monthStart, monthEnd),
    ]);

    const unpaidAmount = await this.getUnpaidAmount(yearMonth);

    return {
      today: {
        inboundCount: today.inboundCount,
        processedQty: today.processedQty,
        processedAmount: today.processedAmount,
      },
      month: {
        processedAmount: month.processedAmount,
        inboundCount: month.inboundCount,
        processedQty: month.processedQty,
        unpaidAmount,
      },
      ranking,
      alerts,
      monthBySku,
    };
  }

  private async aggregateRange(start: Date, end: Date) {
    const records = await this.inboundModel.find({
      status: InboundStatus.Completed,
      inboundDate: { $gte: start, $lt: end },
    });
    const processedQty = records.reduce(
      (sum, r) => sum + r.items.reduce((s, i) => s + i.qtyFinal, 0),
      0,
    );
    const processedAmount = records.reduce(
      (sum, r) => sum + r.items.reduce((s, i) => s + i.amount, 0),
      0,
    );
    return { inboundCount: records.length, processedQty, processedAmount };
  }

  private async getFactoryRanking(monthStart: Date, monthEnd: Date) {
    const rows = await this.inboundModel.aggregate([
      { $match: { status: InboundStatus.Completed, inboundDate: { $gte: monthStart, $lt: monthEnd } } },
      { $unwind: '$items' },
      { $group: { _id: '$factoryId', monthAmount: { $sum: '$items.amount' } } },
      { $sort: { monthAmount: -1 } },
    ]);

    const factories = await this.factoryModel.find({
      _id: { $in: rows.map((r) => r._id).filter(Boolean) },
    });
    const nameMap = new Map(factories.map((f) => [String(f._id), f.name]));

    return rows
      .filter((r) => r._id)
      .map((r) => ({
        factoryId: String(r._id),
        factoryName: nameMap.get(String(r._id)) ?? '未知玩具厂',
        monthAmount: r.monthAmount,
      }));
  }

  /**
   * "本月加工数量"这个总数不同货号加在一起没有意义（见 billing.service 里同样的原则），
   * 首页只放一个笼统的数字容易让人误会。这里按货号拆开算，前端展开明细表，
   * 才是真正能看的"详情"。
   */
  private async getMonthBySku(monthStart: Date, monthEnd: Date) {
    const rows = await this.inboundModel.aggregate([
      { $match: { status: InboundStatus.Completed, inboundDate: { $gte: monthStart, $lt: monthEnd } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.sku',
          name: { $first: '$items.name' },
          qty: { $sum: '$items.qtyFinal' },
          amount: { $sum: '$items.amount' },
        },
      },
      { $sort: { amount: -1 } },
    ]);

    return rows.map((r) => ({ sku: r._id as string, name: r.name as string, qty: r.qty, amount: r.amount }));
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
  private async getUnpaidAmount(yearMonth: string) {
    const { start, end } = monthRangeFromKey(yearMonth);

    const byFactory = await this.inboundModel.aggregate([
      { $match: { status: InboundStatus.Completed, inboundDate: { $gte: start, $lt: end } } },
      { $unwind: '$items' },
      { $group: { _id: '$factoryId', amount: { $sum: '$items.amount' } } },
    ]);
    if (byFactory.length === 0) return 0;

    const paidFactoryIds = new Set(
      (
        await this.billStatusModel.find({ yearMonth, status: BillPaymentStatus.Paid })
      ).map((s) => String(s.factoryId)),
    );

    return byFactory
      .filter((row) => row._id && !paidFactoryIds.has(String(row._id)))
      .reduce((sum, row) => sum + row.amount, 0);
  }
}

function monthRangeFromKey(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 1) };
}
