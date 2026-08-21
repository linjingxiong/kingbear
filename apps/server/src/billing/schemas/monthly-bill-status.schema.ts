import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { BillPaymentStatus } from '@kingbear/shared';

/**
 * 账单本身不落库（应收账单是对 inboundRecords 的实时聚合查询），
 * 这里只存"收款状态"这一个需要人工维护的标记，按 玩具厂+年月 一条。
 */
@Schema({ timestamps: true, collection: 'monthlyBillStatus' })
export class MonthlyBillStatus extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Factory', required: true })
  factoryId: Types.ObjectId;

  /** 如 "2026-08" */
  @Prop({ required: true })
  yearMonth: string;

  @Prop({ type: String, enum: BillPaymentStatus, default: BillPaymentStatus.Unpaid })
  status: BillPaymentStatus;
}

export const MonthlyBillStatusSchema = SchemaFactory.createForClass(MonthlyBillStatus);
MonthlyBillStatusSchema.index({ factoryId: 1, yearMonth: 1 }, { unique: true });
