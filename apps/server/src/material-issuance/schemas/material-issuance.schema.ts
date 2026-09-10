import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'materialIssuances' })
export class MaterialIssuance extends Document {
  @Prop({ type: Types.ObjectId, ref: 'OemFactory', required: true, index: true })
  oemFactoryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Material', required: true, index: true })
  materialId: Types.ObjectId;

  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  issuedDate: Date;

  @Prop()
  remark?: string;
}

export const MaterialIssuanceSchema = SchemaFactory.createForClass(MaterialIssuance);
