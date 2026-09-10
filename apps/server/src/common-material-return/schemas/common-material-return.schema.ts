import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** 代工厂归还通用物料（比如把空框还回来）的一条记录 */
@Schema({ timestamps: true, collection: 'commonMaterialReturns' })
export class CommonMaterialReturn extends Document {
  @Prop({ type: Types.ObjectId, ref: 'OemFactory', required: true, index: true })
  oemFactoryId: Types.ObjectId;

  @Prop({ required: true })
  commonMaterialName: string;

  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  returnedDate: Date;

  @Prop()
  remark?: string;
}

export const CommonMaterialReturnSchema = SchemaFactory.createForClass(CommonMaterialReturn);
