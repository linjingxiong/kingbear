/**
 * 入库数量计算公式：数量 = 重量(斤) × 500 ÷ 单个克重(g)
 * 例：100斤，单个50g → 100×500÷50 = 1000个
 */
export function calculateQuantity(weightJin: number, unitWeightG: number): number {
  if (!unitWeightG || unitWeightG <= 0) return 0;
  return Math.round((weightJin * 500) / unitWeightG);
}

/** 单据填写数量与系统计算数量是否存在差异 */
export function hasQuantityDiff(
  qtyDeclared: number | null | undefined,
  qtyCalculated: number,
): boolean {
  if (qtyDeclared === null || qtyDeclared === undefined) return false;
  return qtyDeclared !== qtyCalculated;
}
