/** 入库单状态：识别中 → 待确认 → 已完成 */
export enum InboundStatus {
  Processing = "processing",
  PendingConfirm = "pending_confirm",
  Completed = "completed",
}

/** 单行产品最终采用的数量来源 */
export enum QuantitySource {
  /** 使用入库单上填写的数量 */
  Declared = "declared",
  /** 使用系统按公式计算出的数量 */
  Calculated = "calculated",
}

/** 应收账单收款状态（人工二态切换，不记录金额/日期/方式） */
export enum BillPaymentStatus {
  Unpaid = "unpaid",
  Paid = "paid",
}
