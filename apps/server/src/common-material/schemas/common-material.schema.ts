import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** 通用物料：跟产品无关、所有代工厂通用的物料，比如"框"。只跟踪收发结存，不参与消耗计算。 */
@Schema({ timestamps: true, collection: 'commonMaterials' })
export class CommonMaterial extends Document {
  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  unit: string;

  @Prop()
  remark?: string;
}

export const CommonMaterialSchema = SchemaFactory.createForClass(CommonMaterial);
