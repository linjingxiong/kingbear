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
  qty: number;
  factoryPrice: number;
  amount: number;
}

/** 实时聚合计算得出，不对应任何落库的"账单"实体（除收款状态外） */
export interface BillingSummary {
  factoryId: string;
  factoryName: string;
  yearMonth: string;
  inboundCount: number;
  totalQty: number;
  totalAmount: number;
  status: BillPaymentStatus;
  details: BillingDetailRow[];
}

export interface UpdateBillPaymentStatusDto {
  factoryId: string;
  yearMonth: string;
  status: BillPaymentStatus;
}
