import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true, collection: 'products' })
export class Product extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Factory', required: true, index: true })
  factoryId: Types.ObjectId;

  @Prop({ required: true })
  sku: string;

  @Prop({ required: true })
  name: string;

  /** 工厂价：玩具厂支付给我们的加工价格（元/个） */
  @Prop({ required: true })
  factoryPrice: number;

  /** 加工价：外放加工支付价格（元/个），第一版不参与利润计算 */
  @Prop()
  processPrice?: number;

  @Prop()
  remark?: string;
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ factoryId: 1, sku: 1 }, { unique: true });
