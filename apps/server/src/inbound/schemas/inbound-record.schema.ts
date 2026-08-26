import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { InboundStatus, QuantitySource } from '@kingbear/shared';

@Schema({ _id: false })
export class InboundItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', default: null })
  productId: Types.ObjectId | null;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  name: string;

  /** 重量（斤） */
  @Prop({ required: true })
  weightJin: number;

  /** 单个克重（g） */
  @Prop({ required: true })
  unitWeightG: number;

  /** 入库单上填写的数量，OCR 未识别到则为 null */
  @Prop({ type: Number, default: null })
  qtyDeclared: number | null;

  /** 系统按公式计算：weightJin × 500 ÷ unitWeightG */
  @Prop({ required: true })
  qtyCalculated: number;

  /** 人工确认后最终采用的数量 */
  @Prop({ required: true })
  qtyFinal: number;

  @Prop({ type: String, enum: QuantitySource, required: true })
  quantitySource: QuantitySource;

  @Prop({ default: false })
  hasQuantityDiff: boolean;

  @Prop({ required: true })
  factoryPrice: number;

  /** amount = qtyFinal × factoryPrice */
  @Prop({ required: true })
  amount: number;

  @Prop()
  remark?: string;
}

export const InboundItemSchema = SchemaFactory.createForClass(InboundItem);

@Schema({ timestamps: true, collection: 'inboundRecords' })
export class InboundRecord extends Document {
  @Prop({ required: true, unique: true })
  code: string;

  @Prop({ type: Types.ObjectId, ref: 'Factory', default: null, index: true })
  factoryId: Types.ObjectId | null;

  /** 玩具厂识别失败，需要人工在确认页选择 */
  @Prop({ default: false })
  needFactorySelect: boolean;

  @Prop({ required: true, index: true })
  inboundDate: Date;

  @Prop({ required: true })
  imageUrl: string;

  /** 图片展示旋转角度：0/90/180/270。只是显示时转一下，原图文件从不改动，不会有画质损失 */
  @Prop({ type: Number, default: 0 })
  rotation: number;

  /** 大模型原始返回，留痕/排障用 */
  @Prop({ type: Object, default: null })
  ocrRawResult: Record<string, unknown> | null;

  @Prop({ type: String, enum: InboundStatus, default: InboundStatus.Processing, index: true })
  status: InboundStatus;

  @Prop({ type: [InboundItemSchema], default: [] })
  items: InboundItem[];
}

export const InboundRecordSchema = SchemaFactory.createForClass(InboundRecord);
