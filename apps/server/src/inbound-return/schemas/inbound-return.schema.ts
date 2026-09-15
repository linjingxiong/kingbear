import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** 入库退货：入库确认之后才发现某个货号不合格，退回给玩具厂的一条记录。
 * 不改动原来那条入库单，单独建一条退货记录；账单页对账用"入库合计 - 退货合计"，
 * 见 billing.service.ts。数量模型（weightJin/unitWeightG/qtyDeclared/qty）
 * 跟入库单、成品回收一样，见 packages/shared/src/quantity.ts。 */
@Schema({ timestamps: true, collection: 'inboundReturns' })
export class InboundReturn extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Factory', required: true, index: true })
  factoryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', default: null, index: true })
  productId: Types.ObjectId | null;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  name: string;

  /** 重量（斤） */
  @Prop({ default: 0 })
  weightJin: number;

  /** 单个克重（g） */
  @Prop({ default: 0 })
  unitWeightG: number;

  /** 单据/识别到的数量，没有就是 null，qty 按公式兜底 */
  @Prop({ type: Number, default: null })
  qtyDeclared: number | null;

  /** 最终数量：qtyDeclared ?? calculateQuantity(weightJin, unitWeightG) */
  @Prop({ required: true })
  qty: number;

  /** 工厂价快照，仅展示用——账单对账实时查最新价格，不依赖这个字段 */
  @Prop({ default: 0 })
  factoryPrice: number;

  /** amount = qty × factoryPrice（快照金额） */
  @Prop({ default: 0 })
  amount: number;

  @Prop({ required: true, index: true })
  returnDate: Date;

  /** 退货原因，比如"破损"/"色差"/"尺寸不对" */
  @Prop({ default: '' })
  reason: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  /** 图片展示旋转角度：0/90/180/270，只是显示时转一下，原图文件从不改动 */
  @Prop({ type: Number, default: 0 })
  rotation: number;

  @Prop()
  remark?: string;
}

export const InboundReturnSchema = SchemaFactory.createForClass(InboundReturn);
