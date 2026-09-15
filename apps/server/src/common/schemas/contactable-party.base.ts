import { Prop } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/**
 * 玩具厂（Factory）、代工厂（OemFactory）本质上是同一种东西——都是"你打交道的一个
 * 外部角色"，联系人/电话/地址/备注这几个字段一字不差，之前是两份重复代码。
 * 抽出这个公共基类只是为了别再维护两份一样的字段定义；Factory/OemFactory 各自的
 * collection 名、业务方法（比如 Factory 特有的模糊匹配、加工金额统计）完全不受影响，
 * 数据库里已有的两个集合、字段名、_id 都不变，不涉及任何数据迁移。
 *
 * 注意：这里不加 @Schema() 装饰器——它只是个"字段清单"，真正的 collection 由
 * Factory/OemFactory 各自的 @Schema({ collection: ... }) 决定，@nestjs/mongoose 的
 * SchemaFactory.createForClass 会沿着原型链把这里的 @Prop() 也收进去。
 */
export abstract class ContactablePartyBase extends Document {
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
