/** 出库单里的一行是什么性质：
 * - issue：玩具厂发料给我加工（原料/半成品），只做记录，不影响应收
 * - return：玩具厂把不合格的货退回给我（退货），会从应收账单里扣掉 */
export type OutboundKind = "issue" | "return";

/**
 * 出库单的一行明细（历史上这张表最早只存"退货"，集合名/类名沿用 InboundReturn 没改，
 * 数据库里已有的记录一条都不用动——没有 kind 字段的老记录一律当"退货"处理）。
 *
 * 玩具厂开的出库单有两种内容：发料给我加工，以及把不合格的货退回来。退货那部分要从应收
 * 账单里扣掉，跟入库单是两回事——不改动原来那条入库单，单独一条记录；账单页对账时用
 * "入库合计 - 退货合计"算出实际应收金额，见 billing.ts / billing.service.ts。
 *
 * 数量模型跟入库/成品回收一样：weightJin/unitWeightG/qtyDeclared 是原始三个数，
 * qty 是最终数量（qtyDeclared 有填就用它，没填就按公式算），见 quantity.ts。
 */
export interface InboundReturn {
  id: string;
  /** 发料还是退货，老数据没这个字段时后端会补成 "return" */
  kind: OutboundKind;
  factoryId: string;
  /** 已匹配到的工序 id；识别/录入时没匹配上也可以先留空 */
  productId: string | null;
  sku: string;
  name: string;
  /** 重量（斤） */
  weightJin: number;
  /** 单个克重（g） */
  unitWeightG: number;
  /** 单据/识别到的数量，没有就是 null，由 qty 按公式兜底 */
  qtyDeclared: number | null;
  /** 最终数量：qtyDeclared ?? calculateQuantity(weightJin, unitWeightG) */
  qty: number;
  /** 工厂价快照（创建时的产品档案价格），仅列表展示用——账单页对账实时查最新价格，
   * 不依赖这个快照，改了产品价格不用回来改历史退货记录 */
  factoryPrice: number;
  /** amount = qty × factoryPrice（快照金额） */
  amount: number;
  /** 退货日期，"YYYY-MM-DD" */
  returnDate: string;
  /** 退货原因，比如"破损"/"色差"/"尺寸不对" */
  reason: string;
  /** 退货凭证图片，可以不止一张 */
  images: string[];
  /** 图片展示旋转角度：0/90/180/270 */
  rotation: number;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

/** 列表展示用，带上玩具厂名称，不用前端再拿 id 反查一遍 */
export interface InboundReturnListItem extends InboundReturn {
  factoryName: string;
}

export interface CreateInboundReturnDto {
  /** 不传就当"退货"，跟这张表最早只存退货时的行为保持一致 */
  kind?: OutboundKind;
  factoryId: string;
  productId?: string | null;
  sku: string;
  name: string;
  weightJin?: number;
  unitWeightG?: number;
  qtyDeclared?: number | null;
  qty: number;
  factoryPrice?: number;
  returnDate: string;
  reason?: string;
  images?: string[];
  remark?: string;
}

export type UpdateInboundReturnDto = Partial<CreateInboundReturnDto>;

/** 退货单上的一行识别结果——退货单跟入库单长得一样（货号/名称/重量/克重/数量），
 * 复用同一套 OCR 识别（recognizeInboundImage），前端按货号/名字模糊匹配到系统里的工序 */
export interface InboundReturnOcrItem {
  sku: string;
  name: string;
  weightJin: number;
  unitWeightG: number;
  qtyDeclared: number | null;
}

/** POST /inbound-returns/recognize 的返回：图片URL + 识别到的玩具厂/日期/各行 */
export interface InboundReturnOcrResult {
  imageUrl: string;
  factoryName: string | null;
  date: string | null;
  items: InboundReturnOcrItem[];
}
