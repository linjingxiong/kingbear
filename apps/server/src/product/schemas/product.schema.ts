import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** 这道工序（货号）用某种物料的用量——materialName 是所属产品物料清单里的名字，qty 是每单位货号的用量 */
@Schema({ _id: false })
export class ProductMaterial {
  @Prop({ required: true })
  materialName: string;

  @Prop({ required: true })
  qty: number;
}
export const ProductMaterialSchema = SchemaFactory.createForClass(ProductMaterial);

/**
 * "产品"（Product）这个实体其实是用户口径里的"工序"——带货号的这一层。
 * productGroupId 指向 ProductGroup（用户说的"产品"），是工序的父级。
 */
@Schema({ timestamps: true, collection: 'products' })
export class Product extends Document {
  @Prop({ type: Types.ObjectId, ref: 'Factory', required: true, index: true })
  factoryId: Types.ObjectId;

  /** 所属产品（ProductGroup）。历史数据可能还没归集，所以不是 required */
  @Prop({ type: Types.ObjectId, ref: 'ProductGroup', index: true })
  productGroupId?: Types.ObjectId;

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

  /** 物料配方：这道工序耗哪些物料、各耗多少（物料名来自所属产品的物料清单） */
  @Prop({ type: [ProductMaterialSchema], default: [] })
  materials: ProductMaterial[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ factoryId: 1, sku: 1 }, { unique: true });
