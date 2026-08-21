import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BillPaymentStatus, InboundStatus } from '@kingbear/shared';
import { InboundRecord } from '../inbound/schemas/inbound-record.schema';
import { MonthlyBillStatus } from './schemas/monthly-bill-status.schema';
import { Factory } from '../factory/schemas/factory.schema';
import { BillingQueryDto } from './dto/billing-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';

@Injectable()
export class BillingService {
  constructor(
    @InjectModel(InboundRecord.name) private readonly inboundModel: Model<InboundRecord>,
    @InjectModel(MonthlyBillStatus.name)
    private readonly billStatusModel: Model<MonthlyBillStatus>,
    @InjectModel(Factory.name) private readonly factoryModel: Model<Factory>,
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

    const details = records.flatMap((r) =>
      r.items.map((item) => ({
        date: r.inboundDate.toISOString().slice(0, 10),
        sku: item.sku,
        name: item.name,
        qty: item.qtyFinal,
        factoryPrice: item.factoryPrice,
        amount: item.amount,
      })),
    );

    const totalQty = details.reduce((sum, d) => sum + d.qty, 0);
    const totalAmount = details.reduce((sum, d) => sum + d.amount, 0);

    const billStatus = await this.billStatusModel.findOne({ factoryId, yearMonth });

    return {
      factoryId,
      factoryName: factory.name,
      yearMonth,
      inboundCount: records.length,
      totalQty,
      totalAmount,
      status: billStatus?.status ?? BillPaymentStatus.Unpaid,
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

function monthRange(yearMonth: string) {
  const [y, m] = yearMonth.split('-').map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  return { start, end };
}
