import { BillPaymentStatus } from "./enums";

/** 应收账单查询参数：玩具厂 + 时间范围 */
export interface BillingQuery {
  factoryId: string;
  /** 如 "2026-08" */
  yearMonth: string;
}

export interface BillingDetailRow {
  date: string;
  sku: string;
  name: string;
  /** 重量（斤） */
  weightJin: number;
  /** 单个克重（g） */
  unitWeightG: number;
  /** 退货行这里是负数——跟正常入库行放在同一个列表里，直接求和就是净数量/净金额 */
  qty: number;
  factoryPrice: number;
  amount: number;
  /** 这一行明细来自哪张入库单，附件用——同一张入库单的多行明细会指向同一张图 */
  imageUrl: string;
  rotation: number;
  /** true 表示这一行是退货（qty/amount 是负数），前端用来标红/加"退"标签区分 */
  isReturn?: boolean;
  /** 退货原因，只有 isReturn 为 true 时才有 */
  reason?: string;
}

/** 按货号汇总的一行：同一个货号在这个玩具厂 + 这个月里的数量/金额合计 */
export interface BillingSkuSummary {
  sku: string;
  name: string;
  qty: number;
  amount: number;
}

/** 实时聚合计算得出，不对应任何落库的"账单"实体（除收款状态外） */
export interface BillingSummary {
  factoryId: string;
  factoryName: string;
  yearMonth: string;
  inboundCount: number;
  /** 净数量/净金额 = 入库合计 - 退货合计，总的和 bySku 都已经是扣完退货之后的数 */
  totalQty: number;
  totalAmount: number;
  /** 退货合计（正数，方便展示"这个月一共退了多少"），totalQty/totalAmount 已经把这部分扣掉了 */
  returnQty: number;
  returnAmount: number;
  status: BillPaymentStatus;
  /** 按货号汇总，明细表要么看这个货号自己的、要么看全部，前端按这个来分组/筛选 */
  bySku: BillingSkuSummary[];
  details: BillingDetailRow[];
}

export interface UpdateBillPaymentStatusDto {
  factoryId: string;
  yearMonth: string;
  status: BillPaymentStatus;
}
