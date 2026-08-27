import { InboundStatus, QuantitySource } from "./enums";

/** 入库单中的一行产品明细 */
export interface InboundItem {
  /** 已匹配到的产品 id；OCR 未匹配到已有产品时为 null，可现场建产品 */
  productId: string | null;
  sku: string;
  name: string;
  /** 重量（斤） */
  weightJin: number;
  /** 单个克重（g） */
  unitWeightG: number;
  /** 入库单上填写的数量，可能不存在 */
  qtyDeclared: number | null;
  /** 系统按公式计算的数量：weightJin × 500 ÷ unitWeightG */
  qtyCalculated: number;
  /** 人工确认后最终采用的数量 */
  qtyFinal: number;
  quantitySource: QuantitySource;
  /** qtyDeclared 与 qtyCalculated 是否存在差异 */
  hasQuantityDiff: boolean;
  /** 工厂价（元/个），来自产品档案，可在确认时覆盖 */
  factoryPrice: number;
  /** 金额 = qtyFinal × factoryPrice */
  amount: number;
  remark?: string;
}

/** 入库单 */
export interface InboundRecord {
  id: string;
  /** 系统生成的入库单号，如 RK20260821001 */
  code: string;
  factoryId: string | null;
  /** 玩具厂识别失败，需要人工在确认页选择 */
  needFactorySelect: boolean;
  inboundDate: string;
  imageUrl: string;
  /** 图片展示旋转角度：0 | 90 | 180 | 270。只是显示时的 CSS 旋转，原图文件字节从不改动，不会有画质损失 */
  rotation: number;
  status: InboundStatus;
  items: InboundItem[];
  createdAt: string;
  updatedAt: string;
}

/** 上传图片后，OCR 识别 + 后处理的返回结果（对应 pending_confirm 状态） */
export type InboundOcrResult = InboundRecord;

/** 人工确认页提交的数据 */
export interface ConfirmInboundDto {
  factoryId: string;
  inboundDate: string;
  items: Array<{
    productId: string | null;
    sku: string;
    name: string;
    weightJin: number;
    unitWeightG: number;
    qtyDeclared: number | null;
    quantitySource: QuantitySource;
    factoryPrice: number;
    remark?: string;
  }>;
  /** 后端查出疑似重复数据后会拦一次，人工确认"确实要这样提交"后带上这个标记再提交一次 */
  force?: boolean;
}

/** 提交/上传遇到疑似重复数据时，后端返回 409，body 是这个结构 */
export interface DuplicateConflictResponse {
  message: string;
  duplicateType: "image" | "item";
  /** 疑似重复的原有入库单号，供提示文案里显示 */
  conflictCodes: string[];
}

/** 入库记录列表搜索条件 */
export interface SearchInboundQuery {
  factoryId?: string;
  dateFrom?: string;
  dateTo?: string;
  productName?: string;
  sku?: string;
  code?: string;
  /** 加工金额区间筛选（按货号拆开后每一行自己的金额，不是整单合计） */
  amountMin?: number;
  amountMax?: number;
  page?: number;
  pageSize?: number;
}

/**
 * 入库管理列表现在是按货号拆开、一行一个货号地展示（不是一整条入库单塞好几个货号），
 * 所以列表接口直接返回拆好的行，筛选/分页也是按这个粒度来的——不然"筛金额"这种
 * 只针对某一行的条件没法跟"按入库单分页"对得上。没有货号明细的单据（识别中/待确认，
 * items 还是空的）sku 等字段就是 null，占一行不会凭空消失。
 */
export interface InboundListRow {
  recordId: string;
  code: string;
  factoryId: string | null;
  needFactorySelect: boolean;
  inboundDate: string;
  status: InboundStatus;
  sku: string | null;
  name: string | null;
  weightJin: number | null;
  unitWeightG: number | null;
  qtyFinal: number | null;
  factoryPrice: number | null;
  amount: number | null;
}
