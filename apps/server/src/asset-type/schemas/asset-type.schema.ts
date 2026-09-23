import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * 资产类型：资产盘点里"资产名称"的目录，比如"笔记本电脑""打印机"。跟通用物料是同一个思路——
 * 单独维护一份名录，资产领用记录里存的还是名字字符串，不引用这张表的 id，删掉一个类型
 * 不影响历史领用记录还能正常显示。
 */
@Schema({ timestamps: true, collection: 'assetTypes' })
export class AssetType extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  remark?: string;
}

export const AssetTypeSchema = SchemaFactory.createForClass(AssetType);
