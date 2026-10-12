import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

/** 玩具厂出库单的一行明细。最早这张表只存"退货"（入库确认之后发现某个货号不合格、
 * 玩具厂退回来的一条记录），后来要把出库单整个做进来（发料 + 退料 + 退货），所以加了
 * kind 字段区分；集合名/类名沿用 inboundReturns/InboundReturn 没改，库里已有的记录不用迁移。
 * 退货行不改动原来那条入库单，账单页对账用"入库合计 - 退货合计"，见 billing.service.ts；
 * 发料/退料行只做记录，不进账单。数量模型（weightJin/unitWeightG/qtyDeclared/qty）
 * 跟入库单、成品回收一样，见 packages/shared/src/quantity.ts。
 *
 * 发料/退料和退货记的根本不是一回事：退货是退回已经入库过的成品/半成品，按货号（sku/name/
 * productId/unitWeightG/qty）记，这套字段是给退货用的；发料/退料是原材料（退料是发料的
 * 反向——没用完的料退回给玩具厂），原料没有货号，按"物料名称 + 重量(斤)"
 * （materialName/weightJin）记。所以 sku/name/productId/unitWeightG 在发料/退料行上是空的，
 * materialName 在退货行上是空的——两套字段共用一张表，靠 kind 区分该看哪一套，不是每个
 * 字段都必填。 */
@Schema({ timestamps: true, collection: 'inboundReturns' })
export class InboundReturn extends Document {
  /** issue=发料 / materialReturn=退料（两个都不影响应收）/ return=退货（从应收里扣）。
   * 老记录没有这个字段，读的时候要当 "return" 用——加了 materialReturn 这个第三种之后，
   * "kind !== 'issue'" 不再等价于"这是退货"了（退料也满足 !== 'issue'），查询/判断
   * "是不是退货"必须显式写 kind: 'return'，不能再用 $ne: 'issue' 代替 */
  @Prop({ type: String, enum: ['issue', 'return', 'materialReturn'], default: 'return', index: true })
  kind: 'issue' | 'return' | 'materialReturn';

  @Prop({ type: Types.ObjectId, ref: 'Factory', required: true, index: true })
  factoryId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Product', default: null, index: true })
  productId: Types.ObjectId | null;

  /** 退货必填（原材料没有货号，发料/退料行留空） */
  @Prop({ default: '' })
  sku: string;

  /** 退货是工序名称；发料/退料这个字段留空，物料名称存在下面的 materialName 里 */
  @Prop({ default: '' })
  name: string;

  /** 物料名称，发料/退料专用 */
  @Prop()
  materialName?: string;

  /** 这批物料属于哪个产品（ProductGroup），发料/退料专用、选填——不选也能记，
   * 只是不知道具体是哪个产品用的料 */
  @Prop({ type: Types.ObjectId, ref: 'ProductGroup', default: null, index: true })
  productGroupId?: Types.ObjectId | null;

  /** 重量（斤） */
  @Prop({ default: 0 })
  weightJin: number;

  /** 单个克重（g） */
  @Prop({ default: 0 })
  unitWeightG: number;

  /** 单据/识别到的数量，没有就是 null，qty 按公式兜底 */
  @Prop({ type: Number, default: null })
  qtyDeclared: number | null;

  /** 最终数量：qtyDeclared ?? calculateQuantity(weightJin, unitWeightG) */
  @Prop({ required: true })
  qty: number;

  /** 工厂价快照，仅展示用——账单对账实时查最新价格，不依赖这个字段 */
  @Prop({ default: 0 })
  factoryPrice: number;

  /** amount = qty × factoryPrice（快照金额） */
  @Prop({ default: 0 })
  amount: number;

  @Prop({ required: true, index: true })
  returnDate: Date;

  /** 退货原因，比如"破损"/"色差"/"尺寸不对" */
  @Prop({ default: '' })
  reason: string;

  @Prop({ type: [String], default: [] })
  images: string[];

  /** 图片展示旋转角度：0/90/180/270，只是显示时转一下，原图文件从不改动 */
  @Prop({ type: Number, default: 0 })
  rotation: number;

  @Prop()
  remark?: string;
}

export const InboundReturnSchema = SchemaFactory.createForClass(InboundReturn);
