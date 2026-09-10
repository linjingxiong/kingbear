import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** 给代工厂发放物料的一条记录。物料按"产品 + 物料名"标识（物料只存在产品身上） */
@Schema({ timestamps: true, collection: 'materialIssuances' })
export class MaterialIssuance extends Document {
  @Prop({ type: Types.ObjectId, ref: 'OemFactory', required: true, index: true })
  oemFactoryId: Types.ObjectId;

  /** 通用物料（框等）发放时留空 */
  @Prop({ type: Types.ObjectId, ref: 'ProductGroup', index: true })
  productGroupId?: Types.ObjectId;

  @Prop({ required: true })
  materialName: string;

  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  issuedDate: Date;

  @Prop()
  remark?: string;

  /** 发料单图片（拍照识别录入时留存），同一张发料单拆出的多条记录共用一个 URL */
  @Prop()
  imageUrl?: string;
}

export const MaterialIssuanceSchema = SchemaFactory.createForClass(MaterialIssuance);
