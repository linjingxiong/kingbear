import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/**
 * "产品"：工序（带货号的 Product 那一层）的父级。用户口径里"火龙果主体"是一个产品，
 * 239-1/239-2/239-3 是它的三道工序。属于某个玩具厂。
 */
@Schema({ timestamps: true, collection: 'productGroups' })
export class ProductGroup extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Factory', required: true, index: true })
  factoryId: Types.ObjectId;

  @Prop({ required: true })
  name: string;

  @Prop()
  remark?: string;

  /** 本产品会用到的物料，下面工序的配方只能从这里面挑 */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Material' }], default: [] })
  materialIds: Types.ObjectId[];
}

export const ProductGroupSchema = SchemaFactory.createForClass(ProductGroup);
