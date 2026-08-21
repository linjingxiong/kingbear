import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'factories' })
export class Factory extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  contact?: string;

  @Prop()
  phone?: string;

  @Prop()
  address?: string;

  @Prop()
  remark?: string;
}

export const FactorySchema = SchemaFactory.createForClass(Factory);
