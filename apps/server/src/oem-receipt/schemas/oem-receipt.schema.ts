import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'oemReceipts' })
export class OemReceipt extends Document {
  @Prop({ type: Types.ObjectId, ref: 'OemFactory', required: true, index: true })
  oemFactoryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  /** 重量（斤），手工录入没称重的话可以是 0 */
  @Prop({ default: 0 })
  weightJin: number;

  /** 单个克重（g） */
  @Prop({ default: 0 })
  unitWeightG: number;

  /** 单据/识别到的数量，没有就是 null，qty 按公式兜底 */
  @Prop({ type: Number, default: null })
  qtyDeclared: number | null;

  /** 最终数量：qtyDeclared ?? calculateQuantity(weightJin, unitWeightG)，见 quantity.ts */
  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  receivedDate: Date;

  @Prop({ type: [String], default: [] })
  images: string[];

  @Prop()
  remark?: string;
}

export const OemReceiptSchema = SchemaFactory.createForClass(OemReceipt);
