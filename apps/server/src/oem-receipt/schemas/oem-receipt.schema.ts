import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'oemReceipts' })
export class OemReceipt extends Document {
  @Prop({ type: Types.ObjectId, ref: 'OemFactory', required: true, index: true })
  oemFactoryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', required: true, index: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  receivedDate: Date;

  @Prop({ type: [String], default: [] })
  images: string[];
}

export const OemReceiptSchema = SchemaFactory.createForClass(OemReceipt);
