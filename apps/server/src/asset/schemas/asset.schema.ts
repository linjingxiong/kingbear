import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'assets' })
export class Asset extends Document {
  @Prop({ required: true })
  custodian: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  qty: number;

  @Prop({ required: true })
  location: string;

  @Prop({ required: true })
  checkoutDate: Date;

  @Prop({ type: [String], default: [] })
  images: string[];
}

export const AssetSchema = SchemaFactory.createForClass(Asset);
