import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** 一道工序里，某种物料的用量——materialId 指向全局物料目录，配比是手动录入的数字 */
@Schema({ _id: false })
export class ProcessStepMaterial {
  @Prop({ type: Types.ObjectId, ref: 'Material', required: true })
  materialId: Types.ObjectId;

  @Prop({ required: true })
  qty: number;
}
export const ProcessStepMaterialSchema = SchemaFactory.createForClass(ProcessStepMaterial);

/** 工序：产品要经过哪几道工序、每道工序耗哪些物料，代工厂成品回收后按这个算应耗物料 */
@Schema({ _id: false })
export class ProcessStep {
  @Prop({ required: true })
  name: string;

  @Prop({ type: [ProcessStepMaterialSchema], default: [] })
  materials: ProcessStepMaterial[];
}
export const ProcessStepSchema = SchemaFactory.createForClass(ProcessStep);

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

  @Prop({ type: [ProcessStepSchema], default: [] })
  processes: ProcessStep[];
}

export const ProductSchema = SchemaFactory.createForClass(Product);
ProductSchema.index({ factoryId: 1, sku: 1 }, { unique: true });
