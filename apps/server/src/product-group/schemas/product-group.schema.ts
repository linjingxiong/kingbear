import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** 本产品用到的一种物料——名字 + 单位，新建产品时直接录入，没有全局物料目录 */
@Schema({ _id: false })
export class ProductGroupMaterial {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  unit: string;
}
export const ProductGroupMaterialSchema = SchemaFactory.createForClass(ProductGroupMaterial);

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

  /** 本产品用到的物料，工序配方、代工厂发料/对账都按这里的物料名认 */
  @Prop({ type: [ProductGroupMaterialSchema], default: [] })
  materials: ProductGroupMaterial[];
}

export const ProductGroupSchema = SchemaFactory.createForClass(ProductGroup);
