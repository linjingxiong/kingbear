import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** 给代工厂发放物料的一条记录。物料按"产品 + 物料名"标识（物料只存在产品身上） */
@Schema({ timestamps: true, collection: 'materialIssuances' })
export class MaterialIssuance extends Document {
  @Prop({ type: Types.ObjectId, ref: 'OemFactory', required: true, index: true })
  oemFactoryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ProductGroup', required: true, index: true })
  productGroupId: Types.ObjectId;

  @Prop({ required: true })
  materialName: string;

  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  issuedDate: Date;

  @Prop()
  remark?: string;
}

export const MaterialIssuanceSchema = SchemaFactory.createForClass(MaterialIssuance);
