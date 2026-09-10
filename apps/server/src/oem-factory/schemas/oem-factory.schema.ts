import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'oemFactories' })
export class OemFactory extends Document {
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

export const OemFactorySchema = SchemaFactory.createForClass(OemFactory);
