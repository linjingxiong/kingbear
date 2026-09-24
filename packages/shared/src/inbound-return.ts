/** 出库单里的一行是什么性质：
 * - issue：玩具厂发料给我加工（原料），只做记录，不影响应收
 * - return：玩具厂把不合格的货退回给我（退货），会从应收账单里扣掉 */
export type OutboundKind = "issue" | "return";

/**
 * 出库单的一行明细（历史上这张表最早只存"退货"，集合名/类名沿用 InboundReturn 没改，
 * 数据库里已有的记录一条都不用动——没有 kind 字段的老记录一律当"退货"处理）。
 *
 * 玩具厂开的出库单有两种内容，记的东西完全不是一回事：
 * - 发料（issue）：玩具厂发原材料给我，按"物料名称 + 重量(斤)"记（materialName/weightJin），
 *   不是货号/工序——原料还没加工成半成品，没有货号。只做记录，不影响应收。
 * - 退货（return）：把已经入库过、不合格的成品/半成品退回来，按货号记（sku/name/weightJin/
 *   unitWeightG/qty，跟入库单同一套字段），要从应收账单里扣掉——跟入库单是两回事，不改动
 *   原来那条入库单，单独一条记录；账单页对账时用"入库合计 - 退货合计"算出实际应收金额，
 *   见 billing.ts / billing.service.ts。
 *
 * 退货的数量模型（weightJin/unitWeightG/qtyDeclared/qty）跟入库/成品回收一样：qty 是最终数量
 * （qtyDeclared 有填就用它，没填就按公式算），见 quantity.ts。发料只有重量，qty 直接等于 weightJin。
 */
export interface InboundReturn {
  id: string;
  /** 发料还是退货，老数据没这个字段时后端会补成 "return" */
  kind: OutboundKind;
  factoryId: string;
  /** 已匹配到的工序 id；只有退货才有，识别/录入时没匹配上也可以先留空 */
  productId: string | null;
  /** 退货才有；发料是原材料，没有货号 */
  sku: string;
  /** 退货是工序名称；发料是物料名称（跟 materialName 是同一个值，历史字段名没改） */
  name: string;
  /** 物料名称，发料专用，跟 name 是同一个值——加这个字段只是让读代码的人一看就知道
   * 这是"物料"不是"工序"，query/展示上跟 name 二选一都行 */
  materialName?: string;
  /** 这批物料属于哪个产品（ProductGroup），发料专用、选填 */
  productGroupId?: string | null;
  /** 重量（斤）：退货是这一批货的重量，发料是这批原料的重量，两种都用得到 */
  weightJin: number;
  /** 单个克重（g），只有退货用得到（用来从重量换算件数） */
  unitWeightG: number;
  /** 单据/识别到的数量，只有退货用得到，没有就是 null，qty 按公式兜底 */
  qtyDeclared: number | null;
  /** 最终数量：退货是 qtyDeclared ?? calculateQuantity(weightJin, unitWeightG)；发料直接等于 weightJin */
  qty: number;
  /** 工厂价快照，只有退货用得到，仅展示用——账单对账实时查最新价格，不依赖这个字段 */
  factoryPrice: number;
  /** amount = qty × factoryPrice（退货专用快照金额，发料恒为 0） */
  amount: number;
  /** 出库日期，"YYYY-MM-DD" */
  returnDate: string;
  /** 退货原因，比如"破损"/"色差"/"尺寸不对"；发料不用填 */
  reason: string;
  /** 单据凭证图片，可以不止一张 */
  images: string[];
  /** 图片展示旋转角度：0/90/180/270 */
  rotation: number;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

/** 列表展示用，带上玩具厂名称（和发料行的产品名称，没选产品就是 undefined），不用前端再拿 id 反查一遍 */
export interface InboundReturnListItem extends InboundReturn {
  factoryName: string;
  productGroupName?: string;
}

export interface CreateInboundReturnDto {
  /** 不传就当"退货"，跟这张表最早只存退货时的行为保持一致 */
  kind?: OutboundKind;
  factoryId: string;
  /** 退货才用 */
  productId?: string | null;
  /** 退货必填，发料留空 */
  sku?: string;
  /** 退货是工序名称，发料是物料名称 */
  name?: string;
  materialName?: string;
  productGroupId?: string | null;
  weightJin?: number;
  unitWeightG?: number;
  qtyDeclared?: number | null;
  qty: number;
  factoryPrice?: number;
  returnDate: string;
  reason?: string;
  images?: string[];
  remark?: string;
  /** 后端查出疑似重复数据会拦一次（409），人工确认过之后带上这个标记再提交一次，跳过检查 */
  force?: boolean;
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

/** 发料单上的一行识别结果——发的是原材料，只有物料名称和重量(斤)，没有货号/克重 */
export interface OutboundIssueOcrItem {
  materialName: string;
  weightJin: number;
}

/** POST /inbound-returns/recognize-issue 的返回：图片URL + 识别到的玩具厂/日期/各行物料 */
export interface OutboundIssueOcrResult {
  imageUrl: string;
  factoryName: string | null;
  date: string | null;
  items: OutboundIssueOcrItem[];
}
