import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'materials' })
export class Material extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  unit: string;

  @Prop()
  remark?: string;
}

export const MaterialSchema = SchemaFactory.createForClass(Material);
